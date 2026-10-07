// netlify/functions/save-secure-data.js
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');
const { validateCsrf } = require('./_middleware/csrf-check');

const dbUrl = process.env.DATABASE_URL;
const RATE_LIMIT_KEY_PREFIX = 'secure_data_save:';
const MAX_SAVES_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW = 60;
const MAX_PAYLOAD_SIZE = 1024 * 1024; // 1MB limit

const pool = new Pool({ 
  connectionString: dbUrl,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false }
    : false
});

if (!dbUrl) {
  console.error('FATAL: DATABASE_URL environment variable is missing.');
}

/**
 * Logs audit events with GUARANTEED constraint compliance.
 * CRITICAL: The 'details' JSON MUST contain:
 * - event_type: STRING (top-level field in details)
 * - timestamp: STRING (top-level field in details)
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

  // 3. CSRF Check (CRITICAL - state-changing operation)
  const csrfError = validateCsrf(event);
  if (csrfError) {
    console.error('[SaveSecureData] CSRF validation failed:', csrfError.body);
    return csrfError;
  }

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
    console.error('[SaveSecureData] JWT Verification Failed:', jwtErr.message);
    if (jwtErr.name === 'TokenExpiredError') {
      return { statusCode: 401, body: JSON.stringify({ error: 'Session expired. Please log in again.' }) };
    }
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) };
  }

  // 5. Rate Limiting Check
  const rateKey = `${RATE_LIMIT_KEY_PREFIX}${userId}`;
  let attempts = 0;
  
  try {
    const attemptsStr = await redis.get(rateKey);
    attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;
  } catch (redisErr) {
    console.warn('[SaveSecureData] Redis error (non-fatal):', redisErr.message);
  }

  if (attempts >= MAX_SAVES_PER_MINUTE) {
    const ttl = await redis.ttl(rateKey).catch(() => RATE_LIMIT_WINDOW);
    return {
      statusCode: 429,
      body: JSON.stringify({ 
        error: 'Too many save attempts. Please try again later.', 
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

  const { ciphertext, salt, iv } = payload;
  
  // 7. Validate Encryption Components
  if (!ciphertext || typeof ciphertext !== 'string' || ciphertext.trim() === '') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid ciphertext' }) };
  }
  if (ciphertext.length > MAX_PAYLOAD_SIZE) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Ciphertext too large' }) };
  }
  if (!/^[A-Za-z0-9+/=_-]+$/.test(ciphertext)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid ciphertext format' }) };
  }

  if (!salt || typeof salt !== 'string' || salt.trim() === '') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid salt' }) };
  }
  if (!/^[A-Za-z0-9+/=_-]+$/.test(salt)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid salt format' }) };
  }

  if (!iv || typeof iv !== 'string' || iv.trim() === '') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid IV' }) };
  }
  if (!/^[A-Za-z0-9+/=_-]+$/.test(iv)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid IV format' }) };
  }

  const client = await pool.connect();
  try {
    // 8. Insert Encrypted Blob (with public. schema prefix)
    await client.query(
      `INSERT INTO public.secure_data (user_id, ciphertext, salt, iv, created_at) 
       VALUES ($1, $2, $3, $4, NOW())`,
      [userId, ciphertext, salt, iv]
    );

    // 9. Log Event (COMPLIANT with audit constraints)
    const ipAddress = context.identity?.sourceIp || 'unknown';
    
    try {
      await logAuditEvent(client, userId, 'SECURE_TICKET_CREATED', { 
        size: ciphertext.length, 
        type: 'contact_form'
      }, ipAddress);
    } catch (auditErr) {
      console.error('[SaveSecureData] Audit FAILED (ignored):', auditErr.message);
    }

    // 10. Increment Rate Limit
    try {
      await redis.incr(rateKey);
      await redis.expire(rateKey, RATE_LIMIT_WINDOW);
    } catch (redisErr) {
      console.warn('[SaveSecureData] Redis incr failed:', redisErr.message);
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
        message: 'Secure ticket created successfully. Data is encrypted and stored.'
      }),
    };

  } catch (error) {
    console.error('[SaveSecureData] Database Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to store encrypted data' }) };
  } finally {
    client.release();
  }
};
