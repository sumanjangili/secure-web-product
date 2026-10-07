// netlify/functions/save-consent.js
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');
const { validateCsrf } = require('./_middleware/csrf-check');

const dbUrl = process.env.DATABASE_URL;
const RATE_LIMIT_KEY_PREFIX = 'consent_save:';
const MAX_UPDATES_PER_MINUTE = 5;
const RATE_LIMIT_WINDOW = 60;

const pool = new Pool({ 
  connectionString: dbUrl,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false } 
    : false
});

/**
 * Logs audit events with GUARANTEED constraint compliance.
 */
async function logAuditEvent(client, userId, eventType, details, ipAddress) {
  try {
    const compliantDetails = {
      event_type: String(eventType),           // REQUIRED by chk_audit_details_structure
      timestamp: new Date().toISOString(),     // REQUIRED by chk_audit_details_structure (as STRING)
      ...(details || {}),
      ip_address: ipAddress || 'unknown'
    };

    await client.query(
      `INSERT INTO public.audit_logs (user_id, event_type, details, timestamp, ip_address) 
       VALUES ($1, $2, $3, NOW(), $4)`,
      [userId, eventType, JSON.stringify(compliantDetails), ipAddress || 'unknown']
    );
  } catch (err) {
    console.error(`[Audit] NON-FATAL: ${eventType} - ${err.message}`);
  }
}

exports.handler = async (event, context) => {
  // 1. Handle CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    const origin = event.headers.origin || '*';
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    };
  }

  // 2. Method Check
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // 3. CSRF Check (KEEP for POST - state-changing operation)
  const csrfError = validateCsrf(event);
  if (csrfError) return csrfError;

  // 4. Extract and Verify Auth Token
  let userId;
  try {
    const cookies = event.headers.cookie;
    if (!cookies) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Authentication required. No session cookie found.' }) };
    }

    const cookiePairs = cookies.split(';');
    const authTokenPair = cookiePairs.find(pair => pair.trim().startsWith('auth_token='));
    
    if (!authTokenPair) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Authentication required. Session cookie missing.' }) };
    }

    const token = authTokenPair.split('=')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.userId;
  } catch (jwtErr) {
    console.error('[SaveConsent] JWT Verification Failed:', jwtErr.message);
    if (jwtErr.name === 'TokenExpiredError') {
      return { statusCode: 401, body: JSON.stringify({ error: 'Session expired. Please log in again.' }) };
    }
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) };
  }

  // 5. Rate Limiting Check
  const rateKey = `${RATE_LIMIT_KEY_PREFIX}${userId}`;
  let attempts = 0;
  
  try {
    const attemptsStr = await redis.get(rateKey);
    attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;
  } catch (redisErr) {
    console.warn('[SaveConsent] Redis error (non-fatal):', redisErr.message);
  }

  if (attempts >= MAX_UPDATES_PER_MINUTE) {
    const ttl = await redis.ttl(rateKey).catch(() => RATE_LIMIT_WINDOW);
    return {
      statusCode: 429,
      body: JSON.stringify({ 
        error: 'Too many consent updates. Please try again later.', 
        retryAfter: ttl > 0 ? ttl : RATE_LIMIT_WINDOW 
      }),
    };
  }

  // 6. Parse Body
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { essential, analytics, version } = payload;
  
  // 7. Validate Payload
  if (typeof essential !== 'boolean' || typeof analytics !== 'boolean') {
    return { statusCode: 400, body: JSON.stringify({ error: 'essential and analytics must be booleans' }) };
  }

  if (!version || typeof version !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(version) || version.length > 20) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid version format' }) };
  }

  const client = await pool.connect();
  try {
    // 8. Upsert Consent Record (with public. schema prefix)
    await client.query(
      `INSERT INTO public.consent_records (user_id, essential, analytics, version, timestamp, created_at) 
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         essential = EXCLUDED.essential,
         analytics = EXCLUDED.analytics,
         version = EXCLUDED.version,
         timestamp = EXCLUDED.timestamp`,
      [userId, essential, analytics, version]
    );

    // 9. Log to Audit Trail (COMPLIANT with constraints)
    const ipAddress = context.identity?.sourceIp || 'unknown';
    
    try {
      await logAuditEvent(client, userId, 'CONSENT_UPDATED', { 
        essential,
        analytics,
        version
      }, ipAddress);
    } catch (auditErr) {
      console.error('[SaveConsent] Audit FAILED (ignored):', auditErr.message);
    }

    // 10. Increment Rate Limit
    try {
      await redis.incr(rateKey);
      await redis.expire(rateKey, RATE_LIMIT_WINDOW);
    } catch (redisErr) {
      console.warn('[SaveConsent] Redis incr failed:', redisErr.message);
    }

    const origin = event.headers.origin;
    const allowedOrigin = origin && (origin.includes('indoscient.in') || origin.includes('localhost')) 
      ? origin 
      : 'https://app.indoscient.in';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Credentials': 'true',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY'
      },
      body: JSON.stringify({ 
        success: true, 
        message: 'Consent saved successfully' 
      }),
    };

  } catch (error) {
    console.error('[SaveConsent] Database Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save consent' }) };
  } finally {
    client.release();
  }
};
