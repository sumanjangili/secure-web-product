// netlify/functions/get-consent.js
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');

const dbUrl = process.env.DATABASE_URL;
const RATE_LIMIT_KEY_PREFIX = 'consent_get:';
const MAX_REQUESTS_PER_MINUTE = 30;
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

const pool = new Pool({
  connectionString: dbUrl,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

if (!dbUrl) {
  console.error('FATAL: DATABASE_URL environment variable is missing.');
}

exports.handler = async (event) => {
  // 1. Handle CORS Preflight — whitelist only, never echo arbitrary origins
  if (event.httpMethod === 'OPTIONS') {
    const allowedOrigin = getAllowedOrigin(event.headers.origin);

    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin || '*',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Authorization',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
      },
    };
  }

  // 2. Method Check
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // GET requests need no CSRF (read-only). Still require authentication.

  // 3. Extract and Verify Auth Token
  let userId;
  try {
    const cookies = event.headers.cookie;
    if (!cookies) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Authentication required' }) };
    }

    const cookiePairs = cookies.split(';');
    const authTokenPair = cookiePairs.find(pair => pair.trim().startsWith('auth_token='));

    if (!authTokenPair) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Session cookie missing' }) };
    }

    const token = authTokenPair.split('=')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.userId;
  } catch (jwtErr) {
    console.error('[GetConsent] JWT Verification Failed:', jwtErr.message);
    return { statusCode: 401, body: JSON.stringify({ error: 'Session expired or invalid' }) };
  }

  // 4. Rate Limiting — ATOMIC via checkRateLimit.
  //    Increments unconditionally, so BOTH paths below are throttled.
  const rateKey = `${RATE_LIMIT_KEY_PREFIX}${userId}`;

  let rateLimitResult;
  try {
    rateLimitResult = await redis.checkRateLimit(
      rateKey,
      MAX_REQUESTS_PER_MINUTE,
      RATE_LIMIT_WINDOW
    );
  } catch (redisErr) {
    console.warn('[GetConsent] Redis error (non-fatal):', redisErr.message);
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
        error: 'Too many requests. Please slow down.',
        retryAfter: rateLimitResult.ttl,
      }),
    };
  }

  // 5. Fetch Latest Consent (history model: newest row wins)
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT essential, analytics, version, timestamp 
       FROM public.consent_records 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [userId]
    );

    const allowedOrigin = getAllowedOrigin(event.headers.origin);

    if (result.rows.length === 0) {
      // FIX: No consent record = NO consent given.
      // essential: false ensures the frontend ConsentBanner renders.
      // Returning essential: true here caused the banner to stay hidden.
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': allowedOrigin || 'https://app.indoscient.in',
          'Access-Control-Allow-Credentials': 'true',
          'Cache-Control': 'no-store, no-cache, must-revalidate, private',
          'Vary': 'Origin',
        },
        body: JSON.stringify({
          essential: false,
          analytics: false,
          version: '1.0',
          timestamp: null,
        }),
      };
    }

    const record = result.rows[0];

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': allowedOrigin || 'https://app.indoscient.in',
        'Access-Control-Allow-Credentials': 'true',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'X-Content-Type-Options': 'nosniff',
        'Vary': 'Origin',
      },
      body: JSON.stringify({
        essential: record.essential,
        analytics: record.analytics,
        version: record.version,
        timestamp: record.timestamp,
      }),
    };

  } catch (error) {
    console.error('[GetConsent] Database Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch consent' }) };
  } finally {
    client.release();
  }
};
