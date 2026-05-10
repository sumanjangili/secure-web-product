// netlify/functions/get-user-profile.js
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');
const { validateCsrf } = require('./_middleware/csrf-check');

// --- Configuration ---
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
  // 1. Method Check
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // 2. Extract and Verify Auth Token FIRST (Before CSRF)
  let userId = null;
  try {
    const cookies = event.headers.cookie;
    if (!cookies) {
      // No cookies at all -> Not logged in
      return { statusCode: 401, body: JSON.stringify({ error: 'Authentication required' }) };
    }

    const cookiePairs = cookies.split(';');
    const authTokenPair = cookiePairs.find(pair => pair.trim().startsWith('auth_token='));
    
    if (!authTokenPair) {
      // No auth token -> Not logged in
      return { statusCode: 401, body: JSON.stringify({ error: 'Authentication required' }) };
    }

    const token = authTokenPair.split('=')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.userId;
  } catch (jwtErr) {
    // Invalid or expired token -> Not logged in
    console.error('[GetProfile] JWT Verification Failed:', jwtErr.message);
    return { statusCode: 401, body: JSON.stringify({ error: 'Session expired or invalid' }) };
  }

  // 3. IF User is Authenticated, THEN Check CSRF
  // This prevents the 403 loop for unauthenticated users who have stale cookies
  const csrfError = validateCsrf(event);
  if (csrfError) {
    // If CSRF fails but we have a valid user, it's a real attack or bad session
    // Return 403
    return csrfError;
  }

  // 4. Rate Limiting Check (Only for authenticated users)
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

  // 5. Fetch User Data
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, email, mfa_enabled, needs_new_backup_codes FROM users WHERE id = $1',
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

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
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
