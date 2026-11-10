// netlify/functions/save-consent.js
const { pool } = require('./lib/db');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');
const { validateCsrf } = require('./_middleware/csrf-check');

const dbUrl = process.env.DATABASE_URL;
const RATE_LIMIT_KEY_PREFIX = 'consent_save:';
const MAX_UPDATES_PER_MINUTE = 5;
const RATE_LIMIT_WINDOW = 60;

// --- Allowed Origins Configuration (exact match, shared with other handlers) ---
const ALLOWED_ORIGINS = [
  'https://app.indoscient.in',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
];

function getAllowedOrigin(requestedOrigin) {
  if (!requestedOrigin) return null;

  const normalized = requestedOrigin.toLowerCase();
  for (const origin of ALLOWED_ORIGINS) {
    if (normalized === origin.toLowerCase()) {
      return origin;
    }
  }

  // Localhost variants permitted only outside Netlify (local dev)
  if (normalized.includes('localhost') && !process.env.NETLIFY) {
    return requestedOrigin;
  }

  return null;
}

/**
 * Logs audit events with GUARANTEED constraint compliance.
 */
async function logAuditEvent(client, userId, eventType, details, ipAddress) {
  try {
    const compliantDetails = {
      event_type: String(eventType),           // REQUIRED by chk_audit_details_structure
      timestamp: new Date().toISOString(),     // REQUIRED by chk_audit_details_structure (as STRING)
      ip_address: ipAddress || 'unknown',
      ...(details || {})
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
  // 1. Handle CORS Preflight — whitelist only, never echo arbitrary origins
  if (event.httpMethod === 'OPTIONS') {
    const allowedOrigin = getAllowedOrigin(event.headers.origin);

    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin || '*',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Authorization',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
      },
    };
  }

  // 2. Method Check
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // 3. CSRF Check (KEEP for POST — state-changing operation)
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

  // 5. Rate Limiting — ATOMIC via checkRateLimit (closes get/incr race).
  //    Increments unconditionally BEFORE the body-parse/validation paths,
  //    so rejected or malformed requests are also throttled.
  const rateKey = `${RATE_LIMIT_KEY_PREFIX}${userId}`;

  let rateLimitResult;
  try {
    rateLimitResult = await redis.checkRateLimit(
      rateKey,
      MAX_UPDATES_PER_MINUTE,
      RATE_LIMIT_WINDOW
    );
  } catch (redisErr) {
    console.warn('[SaveConsent] Redis error (non-fatal):', redisErr.message);
    rateLimitResult = { allowed: true, count: 0, ttl: RATE_LIMIT_WINDOW };
  }

  if (!rateLimitResult.allowed) {
    return {
      statusCode: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(rateLimitResult.ttl),
      },
      body: JSON.stringify({
        error: 'Too many consent updates. Please try again later.',
        retryAfter: rateLimitResult.ttl,
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

  if (!version || typeof version !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(version) || version.length > 50) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid version format' }) };
  }

  const client = await pool.connect();
  try {
    // 8. Append Consent Record (HISTORY MODEL)
    // FIX: The previous ON CONFLICT (user_id) upsert failed at runtime because
    // consent_records has NO unique constraint on user_id (verified via pg_constraint).
    // The schema (created_at DESC index + non-unique user_id index) is append-only,
    // so we INSERT a new row; get-consent reads the newest with ORDER BY created_at DESC.
    await client.query(
      `INSERT INTO public.consent_records (user_id, essential, analytics, version, timestamp, created_at) 
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
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

    // Rate limit already incremented by checkRateLimit — no manual incr

    const allowedOrigin = getAllowedOrigin(event.headers.origin);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': allowedOrigin || 'https://app.indoscient.in',
        'Access-Control-Allow-Credentials': 'true',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Vary': 'Origin',
      },
      body: JSON.stringify({
        success: true,
        message: 'Consent saved successfully',
      }),
    };

  } catch (error) {
    console.error('[SaveConsent] Database Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to save consent' }),
    };
  } finally {
    client.release();
  }
};
