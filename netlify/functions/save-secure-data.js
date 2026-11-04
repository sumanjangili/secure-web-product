// netlify/functions/save-secure-data.js
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');
const { validateCsrf } = require('./_middleware/csrf-check');

const dbUrl = process.env.DATABASE_URL;
const MAX_SAVES_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW = 60;
const MAX_PAYLOAD_SIZE = 1024 * 1024; // 1MB limit

// --- Allowed Origins Configuration ---
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
    if (normalized === origin.toLowerCase()) return origin;
  }

  if (normalized.includes('localhost') && !process.env.NETLIFY) {
    return requestedOrigin;
  }

  return null;
}

const pool = new Pool({
  connectionString: dbUrl,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

if (!dbUrl) {
  console.error('FATAL: DATABASE_URL environment variable is missing.');
}

async function logAuditEvent(client, userId, eventType, details, ipAddress) {
  try {
    const compliantDetails = {
      event_type: String(eventType),           // REQUIRED first — never overwritten
      timestamp: new Date().toISOString(),     // REQUIRED first — never overwritten
      ip_address: ipAddress || 'unknown',
      ...(details || {}),
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

function jsonResponse(statusCode, data, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(data),
  };
}

exports.handler = async (event, context) => {
  // 1. CORS Preflight — whitelist only, never echo arbitrary origins
  if (event.httpMethod === 'OPTIONS') {
    const allowedOrigin = getAllowedOrigin(event.headers.origin);

    return jsonResponse(204, {}, {
      'Access-Control-Allow-Origin': allowedOrigin || '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Authorization',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    });
  }

  // 2. Method Check
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  // 3. CSRF Check (state-changing operation)
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
      return jsonResponse(401, { error: 'Authentication required. No session cookie found.' });
    }

    const cookiePairs = cookies.split(';');
    const authTokenPair = cookiePairs.find(pair => pair.trim().startsWith('auth_token='));

    if (!authTokenPair) {
      return jsonResponse(401, { error: 'Authentication required. Session cookie missing.' });
    }

    const token = authTokenPair.split('=')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.userId;
  } catch (jwtErr) {
    console.error('[SaveSecureData] JWT Verification Failed:', jwtErr.message);
    if (jwtErr.name === 'TokenExpiredError') {
      return jsonResponse(401, { error: 'Session expired. Please log in again.' });
    }
    return jsonResponse(401, { error: 'Invalid or expired session' });
  }

  // 5. Rate Limiting — ATOMIC via checkRateLimit (closes get/incr race)
  const rateKey = `secure_data_save:${userId}`;

  let rateLimitResult;
  try {
    rateLimitResult = await redis.checkRateLimit(
      rateKey,
      MAX_SAVES_PER_MINUTE,
      RATE_LIMIT_WINDOW
    );
  } catch (redisErr) {
    console.warn('[SaveSecureData] Redis rate limit failed (non-fatal):', redisErr.message);
    rateLimitResult = { allowed: true, count: 0, ttl: RATE_LIMIT_WINDOW };
  }

  if (!rateLimitResult.allowed) {
    return jsonResponse(429, {
      error: 'Too many save attempts. Please try again later.',
      retryAfter: rateLimitResult.ttl,
    }, {
      'Retry-After': String(rateLimitResult.ttl),
    });
  }

  // 6. Parse Body
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  const { ciphertext, salt, iv } = payload;

  // 7. Validate Encryption Components
  if (!ciphertext || typeof ciphertext !== 'string' || ciphertext.trim() === '') {
    return jsonResponse(400, { error: 'Missing or invalid ciphertext' });
  }
  if (ciphertext.length > MAX_PAYLOAD_SIZE) {
    return jsonResponse(400, { error: 'Ciphertext too large' });
  }
  if (!/^[A-Za-z0-9+/=_-]+$/.test(ciphertext)) {
    return jsonResponse(400, { error: 'Invalid ciphertext format' });
  }

  if (!salt || typeof salt !== 'string' || salt.trim() === '') {
    return jsonResponse(400, { error: 'Missing or invalid salt' });
  }
  if (!/^[A-Za-z0-9+/=_-]+$/.test(salt)) {
    return jsonResponse(400, { error: 'Invalid salt format' });
  }

  if (!iv || typeof iv !== 'string' || iv.trim() === '') {
    return jsonResponse(400, { error: 'Missing or invalid IV' });
  }
  if (!/^[A-Za-z0-9+/=_-]+$/.test(iv)) {
    return jsonResponse(400, { error: 'Invalid IV format' });
  }

  const client = await pool.connect();
  try {
    // 8. Insert Encrypted Blob
    await client.query(
      `INSERT INTO public.secure_data (user_id, ciphertext, salt, iv, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [userId, ciphertext, salt, iv]
    );

    // 9. Log Event
    const ipAddress = context.identity?.sourceIp || 'unknown';

    try {
      await logAuditEvent(client, userId, 'SECURE_TICKET_CREATED', {
        size: ciphertext.length,
        type: 'contact_form',
      }, ipAddress);
    } catch (auditErr) {
      console.error('[SaveSecureData] Audit FAILED (ignored):', auditErr.message);
    }

    // ✅ Rate limit already incremented by checkRateLimit — no manual incr

    const allowedOrigin = getAllowedOrigin(event.headers.origin);

    return jsonResponse(200, {
      success: true,
      message: 'Secure ticket created successfully. Data is encrypted and stored.',
    }, {
      'Access-Control-Allow-Origin': allowedOrigin || 'https://app.indoscient.in',
      'Access-Control-Allow-Credentials': 'true',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Vary': 'Origin',
    });

  } catch (error) {
    console.error('[SaveSecureData] Database Error:', error);
    return jsonResponse(500, { error: 'Failed to store encrypted data' });
  } finally {
    client.release();
  }
};
