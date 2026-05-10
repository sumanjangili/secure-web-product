// netlify/functions/save-secure-data.js
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');
const { validateCsrf } = require('./_middleware/csrf-check'); // Import CSRF validator

// --- Configuration ---
const dbUrl = process.env.DATABASE_URL;
const RATE_LIMIT_KEY_PREFIX = 'secure_data_save:';
const MAX_SAVES_PER_MINUTE = 10; // Prevent spam/DoS
const RATE_LIMIT_WINDOW = 60; // 1 minute
const MAX_PAYLOAD_SIZE = 1024 * 1024; // 1MB limit for ciphertext (adjust as needed)

// Initialize Pool with SSL for Neon/Cloud Postgres
const pool = new Pool({ 
  connectionString: dbUrl,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false }
    : false // Disable SSL for local dev
});

// Helper to validate base64-like strings (common for encrypted data)
const isValidEncodedString = (str) => {
  // Allows alphanumeric, +, /, =, and - _ (for URL safe base64)
  return /^[A-Za-z0-9+/=_-]+$/.test(str);
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
    console.error('[SaveSecureData] JWT Verification Failed:', jwtErr.message);
    if (jwtErr.name === 'TokenExpiredError') {
      return { statusCode: 401, body: JSON.stringify({ error: 'Session expired. Please log in again.' }) };
    }
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) };
  }

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

  // 4. Parse Body
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { ciphertext, salt, iv } = payload;
  
  // 5. Validate Encryption Components
  // Strict validation to prevent malformed data and potential DoS
  if (!ciphertext || typeof ciphertext !== 'string' || ciphertext.trim() === '') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid ciphertext' }) };
  }
  if (ciphertext.length > MAX_PAYLOAD_SIZE) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Ciphertext too large' }) };
  }
  if (!isValidEncodedString(ciphertext)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid ciphertext format' }) };
  }

  if (!salt || typeof salt !== 'string' || salt.trim() === '') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid salt' }) };
  }
  if (!isValidEncodedString(salt)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid salt format' }) };
  }

  if (!iv || typeof iv !== 'string' || iv.trim() === '') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid IV' }) };
  }
  if (!isValidEncodedString(iv)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid IV format' }) };
  }

  const client = await pool.connect();
  try {
    // 6. Insert Encrypted Blob
    // Ensure 'secure_data' table exists with columns: user_id, ciphertext, salt, iv, created_at
    await client.query(
      `INSERT INTO secure_data (user_id, ciphertext, salt, iv, created_at) 
       VALUES ($1, $2, $3, $4, NOW())`,
      [userId, ciphertext, salt, iv]
    );

    // 7. Log Event
    // Sanitized details: only safe metadata (size, type)
    await client.query(
      `INSERT INTO audit_logs (user_id, event_type, details, timestamp, ip_address) 
       VALUES ($1, $2, $3, NOW(), $4)`,
      [userId, 'SECURE_TICKET_CREATED', JSON.stringify({
        event_type: 'SECURE_TICKET_CREATED', 
        size: ciphertext.length, 
        type: 'contact_form',
        timestamp: new Date().toISOString()
      }), context.identity?.sourceIp || 'unknown']
    );

    // 8. Increment Rate Limit
    try {
      await redis.incr(rateKey);
      await redis.expire(rateKey, RATE_LIMIT_WINDOW);
    } catch (redisErr) {
      console.warn('[SaveSecureData] Redis incr failed:', redisErr.message);
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
