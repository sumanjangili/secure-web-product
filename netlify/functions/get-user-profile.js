// netlify/functions/get-user-profile.js
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');

// --- Configuration ---
const dbUrl = process.env.DATABASE_URL;
const MAX_REQUESTS_PER_MINUTE = 60;
const RATE_LIMIT_WINDOW = 60; // 1 minute in seconds

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
    if (normalized === origin.toLowerCase()) {
      return origin;
    }
  }

  if (normalized.includes('localhost') && !process.env.NETLIFY) {
    return requestedOrigin;
  }

  return null;
}

// --- Database Initialization ---
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
 * Helper to create consistent error responses
 */
function jsonResponse(statusCode, data, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders
    },
    body: JSON.stringify(data)
  };
}

exports.handler = async (event, context) => {
  // 1. Handle CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    const allowedOrigin = getAllowedOrigin(event.headers.origin);

    return jsonResponse(204, {}, {
      'Access-Control-Allow-Origin': allowedOrigin || '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Authorization',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    });
  }

  // 2. Method Check
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  // 3. Extract and Verify Auth Token FIRST
  // NOTE: This endpoint deliberately accepts PRE-MFA tokens — the frontend
  // needs mfaEnabled right after password login to route into the MFA step.
  // Do NOT gate this on mfaVerified; gate the sensitive endpoints instead.
  let userId = null;
  try {
    const cookies = event.headers.cookie;
    if (!cookies) {
      return jsonResponse(401, { error: 'Authentication required' });
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
    console.error('[GetProfile] JWT Verification Failed:', jwtErr.message);
    return jsonResponse(401, { error: 'Session expired or invalid' });
  }

  // GET requests do NOT require CSRF validation (read-only operation)

  // 4. Rate Limiting - ATOMIC check using Lua script
  const rateKey = `profile_get:${userId}`;

  let rateLimitResult;
  try {
    rateLimitResult = await redis.checkRateLimit(
      rateKey,
      MAX_REQUESTS_PER_MINUTE,
      RATE_LIMIT_WINDOW
    );
  } catch (redisErr) {
    console.warn('[GetProfile] Redis rate limit check failed (non-fatal):', redisErr.message);
    rateLimitResult = { allowed: true, count: 0, ttl: RATE_LIMIT_WINDOW };
  }

  if (!rateLimitResult.allowed) {
    return jsonResponse(429, {
      error: 'Too many requests. Please slow down.',
      retryAfter: rateLimitResult.ttl
    }, {
      'Retry-After': String(rateLimitResult.ttl)
    });
  }

  // 5. Fetch User Data
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, email, mfa_enabled, needs_new_backup_codes FROM public.users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return jsonResponse(404, { error: 'User not found' });
    }

    const user = result.rows[0];
    const allowedOrigin = getAllowedOrigin(event.headers.origin);

    return jsonResponse(200, {
      id: user.id,
      email: user.email,
      mfaEnabled: user.mfa_enabled,
      needsNewBackupCodes: user.needs_new_backup_codes
    }, {
      'Access-Control-Allow-Origin': allowedOrigin || 'https://app.indoscient.in',
      'Access-Control-Allow-Credentials': 'true',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY', // ✅ added — every other 200 response has it
      'Vary': 'Origin'
    });
  } catch (error) {
    console.error('[GetProfile] Database Error:', error);
    return jsonResponse(500, { error: 'Internal server error' });
  } finally {
    client.release();
  }
};
