// netlify/functions/save-consent.js
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');
const { validateCsrf } = require('./_middleware/csrf-check'); // Import CSRF validator

// --- Configuration ---
const dbUrl = process.env.DATABASE_URL;
const RATE_LIMIT_KEY_PREFIX = 'consent_save:';
const MAX_UPDATES_PER_MINUTE = 5; // Prevent spam
const RATE_LIMIT_WINDOW = 60; // 1 minute

// Initialize Pool with SSL for Neon/Cloud Postgres
const pool = new Pool({ 
  connectionString: dbUrl,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false }
    : false // Disable SSL for local dev
});

// Helper to validate version string (prevent injection of weird chars)
const isValidVersion = (str) => {
  // Allow simple versions like "1.0", "v1.0", "1.0.1"
  return /^[a-zA-Z0-9._-]+$/.test(str) && str.length <= 20;
};

// Helper to validate ISO timestamp
const isValidTimestamp = (str) => {
  if (!str || typeof str !== 'string') return false;
  const date = new Date(str);
  return !isNaN(date.getTime());
};

exports.handler = async (event, context) => {
  // 1. Method Check
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // 2. CSRF Check (CRITICAL)
  const csrfError = validateCsrf(event);
  if (csrfError) return csrfError;

  // 3. Rate Limiting Check
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

  // 4. Parse Body
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { essential, analytics, timestamp, version } = payload;
  
  // 5. Validate Payload
  if (typeof essential !== 'boolean' || typeof analytics !== 'boolean') {
    return { statusCode: 400, body: JSON.stringify({ error: 'essential and analytics must be booleans' }) };
  }
  
  if (!version || typeof version !== 'string' || !isValidVersion(version)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid version format' }) };
  }

  // Validate timestamp if provided, otherwise use server time
  const safeTimestamp = timestamp && isValidTimestamp(timestamp) ? timestamp : new Date().toISOString();

  const client = await pool.connect();
  try {
    // 6. Store Consent Record
    // Ensure 'consent_records' table exists with columns: user_id, essential, analytics, version, timestamp, created_at
    await client.query(
      `INSERT INTO consent_records (user_id, essential, analytics, version, timestamp, created_at) 
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [userId, essential, analytics, version, safeTimestamp]
    );

    // 7. Log to Audit Trail
    await client.query(
      `INSERT INTO audit_logs (user_id, event_type, details, timestamp, ip_address) 
       VALUES ($1, $2, $3, NOW(), $4)`,
      [userId, 'CONSENT_UPDATED', JSON.stringify({ 
        essential, 
        analytics, 
        version,
        timestamp: safeTimestamp 
      }), context.identity?.sourceIp || 'unknown']
    );

    // 8. Increment Rate Limit
    try {
      await redis.incr(rateKey);
      await redis.expire(rateKey, RATE_LIMIT_WINDOW);
    } catch (redisErr) {
      console.warn('[SaveConsent] Redis incr failed:', redisErr.message);
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'X-Content-Type-Options': 'nosniff'
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
