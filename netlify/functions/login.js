// netlify/functions/login.js
const { Pool } = require('pg');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const redis = require('./lib/redis');

// --- Configuration ---
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME_SECONDS = 15 * 60; // 15 minutes
const RATE_LIMIT_KEY_PREFIX = 'login_rate_limit:';
const SESSION_DURATION = 86400; // 24 hours in seconds

// --- Database Initialization ---
const dbUrl = process.env.DATABASE_URL;
let pool;

if (!dbUrl) {
  console.error('FATAL: DATABASE_URL environment variable is missing.');
} else {
  try {
    // Conditional SSL for local dev vs production
    pool = new Pool({ 
      connectionString: dbUrl,
      ssl: process.env.NODE_ENV === 'production' 
        ? { rejectUnauthorized: false } 
        : false  // Disable SSL for local dev
    });
    console.log('[Login] Database pool initialized.');
  } catch (err) {
    console.error('[Login] Failed to initialize DB pool:', err.message);
  }
}

exports.handler = async (event, context) => {
  // 1. Method Check
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // 2. Parse Body
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { email, password } = payload;

  if (!email || !password) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Email and password are required' }) };
  }

  // 3. Database Check
  if (!pool) {
    console.error('[Login] Aborted: Database not configured.');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const client = await pool.connect();
  try {
    // 4. Find User (Constant time delay for security)
    const userResult = await client.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);

    if (userResult.rows.length === 0) {
      // Simulate delay to prevent timing attacks
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid credentials' }) };
    }

    const user = userResult.rows[0];

    // 5. Rate Limiting Check
    const rateKey = `${RATE_LIMIT_KEY_PREFIX}${user.id}`;
    let attempts = 0;
    
    try {
      const attemptsStr = await redis.get(rateKey);
      attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;
    } catch (redisErr) {
      console.warn('[Login] Redis get error (non-fatal):', redisErr.message);
    }

    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      const ttl = await redis.ttl(rateKey).catch(() => LOCKOUT_TIME_SECONDS);
      const ipAddress = context?.identity?.sourceIp || 'unknown';
      await logAuditEvent(client, user.id, 'LOGIN_RATE_LIMITED', { email, attempts }, ipAddress);
      
      return {
        statusCode: 429,
        body: JSON.stringify({ 
          error: 'Too many login attempts. Please try again later.', 
          retryAfter: ttl > 0 ? ttl : LOCKOUT_TIME_SECONDS 
        }),
      };
    }

    // 6. Verify Password
    const isValid = await argon2.verify(user.password_hash, password);

    if (!isValid) {
      try {
        await redis.incr(rateKey);
        await redis.expire(rateKey, LOCKOUT_TIME_SECONDS);
      } catch (redisErr) {
        console.warn('[Login] Redis incr/expire failed:', redisErr.message);
      }
      
      const ipAddress = context?.identity?.sourceIp || 'unknown';
      await logAuditEvent(client, user.id, 'LOGIN_FAILED', { email }, ipAddress);
      
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid credentials' }) };
    }

    // 7. Success: Reset Rate Limit
    try {
      await redis.del(rateKey);
    } catch (redisErr) {
      console.warn('[Login] Redis del failed:', redisErr.message);
    }

    // 8. Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: SESSION_DURATION }
    );

    // 9. Generate CSRF Token
    const csrfToken = crypto.randomBytes(32).toString('hex');

    // 10. Audit Log
    const ipAddress = context?.identity?.sourceIp || 'unknown';
    await logAuditEvent(client, user.id, 'LOGIN_SUCCESS', { 
      email, 
      mfaRequired: user.mfa_enabled || false,
      timestamp: new Date().toISOString() 
    }, ipAddress);

    // 11. Update Last Login
    await client.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    // 12. Return Response with BOTH Cookies (PRODUCTION SAFE VERSION)
    const isProd = process.env.NODE_ENV === 'production';
    const samesiteFlag = isProd ? 'Strict' : 'Lax'; 
    const secureFlag = isProd ? 'Secure' : ''; 
    
    // Construct cookies as an array
    const cookies = [
      `auth_token=${token}; HttpOnly; ${secureFlag}; SameSite=${samesiteFlag}; Path=/; Max-Age=${SESSION_DURATION}`,
      `csrf_token=${csrfToken}; ${secureFlag}; SameSite=${samesiteFlag}; Path=/; Max-Age=${SESSION_DURATION}`
    ];

    // DEBUG: Log the cookie length to ensure it's not too huge
    console.log(`[Login] Cookie 1 Length: ${cookies[0].length}`);
    console.log(`[Login] Cookie 2 Length: ${cookies[1].length}`);

    return {
      statusCode: 200,
      headers: {
        // Netlify Production: Array is usually fine, but if it fails, try joining with comma (rare)
        // We stick to array as it's the standard for multiple Set-Cookie
        'Set-Cookie': cookies, 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff'
      },
      body: JSON.stringify({
        success: true,
        userId: user.id,
        mfaEnabled: user.mfa_enabled || false,
        message: user.mfa_enabled ? 'MFA required' : 'Login successful'
      }),
    };

  } catch (error) {
    console.error('[Login] UNCAUGHT ERROR:', error.message);
    console.error('[Login] Stack:', error.stack);
    // Do not log the full event to avoid leaking sensitive data in logs
    return { statusCode: 500, body: JSON.stringify({ error: 'An unexpected error occurred' }) };
  } finally {
    client.release();
  }
};

async function logAuditEvent(client, userId, eventType, details, ipAddress) {
  try {
    const safeDetails = {
      event_type: eventType,
      timestamp: new Date().toISOString(),
      ...details
    };

    await client.query(
      `INSERT INTO audit_logs (user_id, event_type, details, timestamp, ip_address) 
       VALUES ($1, $2, $3, NOW(), $4)`,
      [userId, eventType, JSON.stringify(safeDetails), ipAddress || 'unknown']
    );
  } catch (err) {
    console.error('[Audit Log] Failed to write:', err.message);
  }
}
