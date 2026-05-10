// netlify/functions/get-consent.js
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');
const { validateCsrf } = require('./_middleware/csrf-check');

// --- Configuration ---
const dbUrl = process.env.DATABASE_URL;
const RATE_LIMIT_KEY_PREFIX = 'consent_get:';
const MAX_REQUESTS_PER_MINUTE = 30;
const RATE_LIMIT_WINDOW = 60;

// ✅ FIXED: Conditional SSL for local dev vs production
const pool = new Pool({ 
  connectionString: dbUrl,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false } 
    : false  // Disable SSL for local dev
});

exports.handler = async (event, context) => {
  // 1. Method Check
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // 2. CSRF Check
  const csrfError = validateCsrf(event);
  if (csrfError) return csrfError;

  // 3. Rate Limiting Check
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
    console.error('[GetConsent] JWT Error:', jwtErr.message);
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) };
  }

  const rateKey = `${RATE_LIMIT_KEY_PREFIX}${userId}`;
  let attempts = 0;
  try {
    const attemptsStr = await redis.get(rateKey);
    attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;
  } catch (redisErr) {
    console.warn('[GetConsent] Redis error:', redisErr.message);
  }

  if (attempts >= MAX_REQUESTS_PER_MINUTE) {
    return {
      statusCode: 429,
      body: JSON.stringify({ error: 'Too many requests', retryAfter: RATE_LIMIT_WINDOW })
    };
  }

  // 4. Fetch Consent
  const client = await pool.connect();
  try {
    // Get the most recent consent record
    const result = await client.query(
      `SELECT essential, analytics, version, timestamp 
       FROM consent_records 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      // No consent found yet -> Return default (false) so frontend shows banner
      return {
        statusCode: 200,
        body: JSON.stringify({
          essential: false, // Banner will show
          analytics: false,
          version: "1.0",
          timestamp: new Date().toISOString()
        })
      };
    }

    const record = result.rows[0];

    // Increment rate limit
    try {
      await redis.incr(rateKey);
      await redis.expire(rateKey, RATE_LIMIT_WINDOW);
    } catch (redisErr) {
      console.warn('[GetConsent] Redis incr failed:', redisErr.message);
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private'
      },
      body: JSON.stringify({
        essential: record.essential,
        analytics: record.analytics,
        version: record.version,
        timestamp: record.timestamp
      })
    };

  } catch (error) {
    console.error('[GetConsent] Database Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch consent' }) };
  } finally {
    client.release();
  }
};
