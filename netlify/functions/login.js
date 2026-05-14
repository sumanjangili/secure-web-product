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

// --- CRITICAL: Validate Environment Variables Immediately ---
const dbUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;

if (!dbUrl) {
  console.error('FATAL: DATABASE_URL is missing. Check Netlify Environment Variables.');
  // We do not throw here to allow the function to load, but it will fail on first DB call.
  // Better to log clearly so the user knows why it's failing.
}

if (!jwtSecret) {
  console.error('FATAL: JWT_SECRET is missing. Check Netlify Environment Variables.');
}

// --- Database Initialization ---
let pool;

if (dbUrl) {
  try {
    // Determine Production Mode:
    // 1. Check explicit NODE_ENV
    // 2. Check if running on Netlify (context is usually present in production)
    // 3. Default to 'production' behavior if uncertain to ensure Secure cookies
    const isProdEnv = process.env.NODE_ENV === 'production' || 
                      (process.env.NETLIFY === 'true'); 
    
    console.log(`[Login] Initializing DB. NODE_ENV: ${process.env.NODE_ENV}, NETLIFY: ${process.env.NETLIFY}, IsProd: ${isProdEnv}`);

    pool = new Pool({ 
      connectionString: dbUrl,
      ssl: isProdEnv 
        ? { rejectUnauthorized: false } // Accept self-signed certs for cloud DBs
        : false  
    });
    console.log('[Login] Database pool initialized.');
  } catch (err) {
    console.error('[Login] Failed to initialize DB pool:', err.message);
    pool = null; // Prevent further attempts
  }
} else {
  pool = null;
}

exports.handler = async (event, context) => {
  // 1. Method Check
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // 2. Parse Body
  let payload;
  try {
    // Netlify sometimes sends body as string, sometimes as object depending on config
    // Ensure we parse it safely
    const bodyStr = typeof event.body === 'string' ? event.body : JSON.stringify(event.body);
    payload = JSON.parse(bodyStr || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { email, password } = payload;

  if (!email || !password) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Email and password are required' }) };
  }

  // 3. Database Check
  if (!pool) {
    console.error('[Login] Aborted: Database pool not initialized. Check DATABASE_URL env var.');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const client = await pool.connect();
  try {
    // 4. Find User
    const userResult = await client.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);

    if (userResult.rows.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 500)); // Timing attack prevention
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
    if (!jwtSecret) {
      console.error('[Login] CRITICAL: JWT_SECRET is missing. Cannot generate token.');
      return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }

    let token;
    try {
      token = jwt.sign(
        { userId: user.id, email: user.email },
        jwtSecret,
        { expiresIn: SESSION_DURATION }
      );
    } catch (jwtErr) {
      console.error('[Login] JWT Sign Error:', jwtErr.message);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to generate session' }) };
    }

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

    // 12. Determine Cookie Flags
    // Logic: If NODE_ENV is 'production' OR we are on Netlify (process.env.NETLIFY), use Secure/Strict
    const isProd = process.env.NODE_ENV === 'production' || process.env.NETLIFY === 'true';
    const samesiteFlag = isProd ? 'Strict' : 'Lax'; 
    
    const authParts = [`auth_token=${token}`, 'HttpOnly', `SameSite=${samesiteFlag}`, `Path=/`, `Max-Age=${SESSION_DURATION}`];
    const csrfParts = [`csrf_token=${csrfToken}`, `SameSite=${samesiteFlag}`, `Path=/`, `Max-Age=${SESSION_DURATION}`];

    if (isProd) {
      authParts.unshift('Secure');
      csrfParts.unshift('Secure');
    }

    const cookie1 = authParts.join('; ');
    const cookie2 = csrfParts.join('; ');

    console.log(`[Login] SUCCESS. Env: ${process.env.NODE_ENV}, Netlify: ${process.env.NETLIFY}, IsProd: ${isProd}`);

    return {
      statusCode: 200,
      headers: {
        'Set-Cookie': [cookie1, cookie2],
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
