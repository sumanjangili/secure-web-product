// netlify/functions/generate-backup-codes.js
const { Pool } = require('pg');
const argon2 = require('argon2');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');
const { validateCsrf } = require('./_middleware/csrf-check'); // Import CSRF validator

// --- Configuration ---
const dbUrl = process.env.DATABASE_URL;
const CODE_COUNT = 10;
const RATE_LIMIT_KEY_PREFIX = 'backup_codes_gen:';
const MAX_GENERATIONS_PER_HOUR = 3;
const RATE_LIMIT_WINDOW = 60 * 60; // 1 hour in seconds

// Initialize Pool with SSL for Neon/Cloud Postgres
const pool = new Pool({ 
  connectionString: dbUrl,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false }
    : false  // Disable SSL for local dev
});

exports.handler = async (event, context) => {
  // 1. Method Check
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // 2. CSRF Check (CRITICAL)
  // Prevents Cross-Site Request Forgery attacks on this sensitive endpoint
  const csrfError = validateCsrf(event);
  if (csrfError) return csrfError;

  // 3. Authenticate via Cookie (HttpOnly)
  let userId;
  try {
    const cookies = event.headers.cookie;
    if (!cookies) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Authentication required. No session cookie found.' }) };
    }

    // Parse cookies to find 'auth_token'
    const cookiePairs = cookies.split(';');
    const authTokenPair = cookiePairs.find(pair => pair.trim().startsWith('auth_token='));
    
    if (!authTokenPair) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Authentication required. Session cookie missing.' }) };
    }

    const token = authTokenPair.split('=')[1];
    
    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.userId; // ✅ SECURITY: Use ID from JWT, ignore any body input
  } catch (jwtErr) {
    console.error('[GenBackupCodes] JWT Verification Failed:', jwtErr.message);
    if (jwtErr.name === 'TokenExpiredError') {
      return { statusCode: 401, body: JSON.stringify({ error: 'Session expired. Please log in again.' }) };
    }
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) };
  }

  // 4. Rate Limiting Check
  const rateKey = `${RATE_LIMIT_KEY_PREFIX}${userId}`;
  let attempts = 0;
  
  try {
    const attemptsStr = await redis.get(rateKey);
    attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;
  } catch (redisErr) {
    console.warn('[GenBackupCodes] Redis error (non-fatal):', redisErr.message);
    // Proceed if Redis fails, but log it. In strict mode, you might block here.
  }

  if (attempts >= MAX_GENERATIONS_PER_HOUR) {
    const ttl = await redis.ttl(rateKey).catch(() => RATE_LIMIT_WINDOW);
    return {
      statusCode: 429,
      body: JSON.stringify({ 
        error: 'Too many code generation attempts. Please try again later.', 
        retryAfter: ttl > 0 ? ttl : RATE_LIMIT_WINDOW 
      }),
    };
  }

  const client = await pool.connect();
  try {
    // 5. Verify User Exists
    const userResult = await client.query(
      'SELECT id, mfa_enabled, backup_code_hashes, needs_new_backup_codes FROM users WHERE id = $1', 
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }) };
    }

    const user = userResult.rows[0];
    
    // Optional: Log if user regenerates codes unnecessarily
    if (!user.needs_new_backup_codes && user.backup_code_hashes && user.backup_code_hashes.length > 0) {
       console.log(`User ${userId} regenerated codes despite having valid ones.`);
    }

    // 6. Generate Codes
    const codes = [];
    const hashes = [];

    for (let i = 0; i < CODE_COUNT; i++) {
      // Generate 16-character alphanumeric code (8 bytes hex)
      const code = crypto.randomBytes(8).toString('hex').toUpperCase();
      const hash = await argon2.hash(code);
      codes.push(code);
      hashes.push(hash);
    }

    // 7. Update Database (Atomic)
    await client.query(
      `UPDATE users 
       SET backup_code_hashes = $1, needs_new_backup_codes = FALSE 
       WHERE id = $2`,
      [hashes, userId]
    );

    // 8. Log Event
    await client.query(
      `INSERT INTO audit_logs (user_id, event_type, details, timestamp, ip_address) 
       VALUES ($1, 'BACKUP_CODES_GENERATED', $2, NOW(), $3)`,
      [userId, JSON.stringify({ count: CODE_COUNT }), context.identity?.sourceIp || 'unknown']
    );

    // 9. Increment Rate Limit
    try {
      await redis.incr(rateKey);
      await redis.expire(rateKey, RATE_LIMIT_WINDOW);
    } catch (redisErr) {
      console.warn('[GenBackupCodes] Redis incr failed:', redisErr.message);
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        // ✅ CRITICAL: Prevent caching of sensitive backup codes
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        // Ensure response is not cached by proxies
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      body: JSON.stringify({
        success: true,
        codes: codes,
        message: 'Save these codes securely. They will not be shown again.'
      }),
    };

  } catch (error) {
    console.error('[GenerateBackupCodes] Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to generate codes' }) };
  } finally {
    client.release();
  }
};
