// netlify/functions/get-consent.js
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');

const dbUrl = process.env.DATABASE_URL;
const RATE_LIMIT_KEY_PREFIX = 'consent_get:';
const MAX_REQUESTS_PER_MINUTE = 30;
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
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    };
  }

  // 2. Method Check
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // ✅ KEY FIX: SKIP CSRF for GET requests (read-only operations don't need CSRF protection)
  // CSRF should only protect state-changing operations (POST, PUT, DELETE)

  // 3. Extract and Verify Auth Token (NO CSRF needed!)
  let userId = null;
  try {
    const cookies = event.headers.cookie;
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
    console.error('[GetConsent] JWT Verification Failed:', jwtErr.message);
    return { statusCode: 401, body: JSON.stringify({ error: 'Session expired or invalid' }) };
  }

  // 4. Rate Limiting Check
  const rateKey = `${RATE_LIMIT_KEY_PREFIX}${userId}`;
  let attempts = 0;
  
  try {
    const attemptsStr = await redis.get(rateKey);
    attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;
  } catch (redisErr) {
    console.warn('[GetConsent] Redis error (non-fatal):', redisErr.message);
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

  // 5. Fetch Consent (with public. schema prefix)
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

    if (result.rows.length === 0) {
      // No consent found yet -> Return default (all rejected except essential)
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
          'Cache-Control': 'no-store, no-cache, must-revalidate, private'
        },
        body: JSON.stringify({
          essential: true,    // Essential always allowed
          analytics: false,   // Default to rejected
          version: '1.0',
          timestamp: null
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
