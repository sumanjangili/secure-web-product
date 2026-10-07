// netlify/functions/get-user-profile.js
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');
const { validateCsrf } = require('./_middleware/csrf-check');

const dbUrl = process.env.DATABASE_URL;
const RATE_LIMIT_KEY_PREFIX = 'profile_get:';
const MAX_REQUESTS_PER_MINUTE = 60;
const RATE_LIMIT_WINDOW = 60;

const pool = new Pool({ 
  connectionString: dbUrl,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false } 
    : false
});

if (!dbUrl) {
  console.error('FATAL: DATABASE_URL environment variable is missing.');
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
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    };
  }

  // 2. Method Check
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // 3. Extract and Verify Auth Token FIRST (Before CSRF)
  let userId = null;
  let cookies;
  try {
    cookies = event.headers.cookie;
    if (!cookies) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Authentication required' }) };
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
    console.error('[GetProfile] JWT Verification Failed:', jwtErr.message);
    return { statusCode: 401, body: JSON.stringify({ error: 'Session expired or invalid' }) };
  }

  // 4. IF User is Authenticated, THEN Check CSRF
  const csrfError = validateCsrf(event);
  if (csrfError) {
    // Important: If we have valid auth but CSRF failed, it could be:
    // a) Stale frontend session (refresh page)
    // b) Actual CSRF attack
    console.warn('[GetProfile] CSRF validation failed for authenticated user:', userId);
    return csrfError;
  }

  // 5. Rate Limiting Check
  const rateKey = `${RATE_LIMIT_KEY_PREFIX}${userId}`;
  let attempts = 0;
  
  try {
    const attemptsStr = await redis.get(rateKey);
    attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;
  } catch (redisErr) {
    console.warn('[GetProfile] Redis error (non-fatal):', redisErr.message);
  }

  if (attempts >= MAX_REQUESTS_PER_MINUTE) {
    const ttl = await redis.ttl(rateKey).catch(() => RATE_LIMIT_WINDOW);
    return {
      statusCode: 429,
      body: JSON.stringify({ 
        error: 'Too many requests. Please slow down.', 
        retryAfter: ttl > 0 ? ttl : RATE_LIMIT_WINDOW 
      }),
    };
  }

  // 6. Fetch User Data
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, email, mfa_enabled, needs_new_backup_codes FROM public.users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }) };
    }

    const user = result.rows[0];
    
    // Increment rate limit
    try {
      await redis.incr(rateKey);
      await redis.expire(rateKey, RATE_LIMIT_WINDOW);
    } catch (redisErr) {
      console.warn('[GetProfile] Redis incr failed:', redisErr.message);
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
        'X-Content-Type-Options': 'nosniff'
      },
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        mfaEnabled: user.mfa_enabled,
        needsNewBackupCodes: user.needs_new_backup_codes
      })
    };
  } catch (error) {
    console.error('[GetProfile] Database Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  } finally {
    client.release();
  }
};
