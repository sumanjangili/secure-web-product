// netlify/functions/login.js
const { Pool } = require('pg');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const redis = require('./lib/redis');

// --- Configuration ---
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME_SECONDS = 15 * 60;
const RATE_LIMIT_KEY_PREFIX = 'login_rate_limit:';
const SESSION_DURATION = 86400;

const dbUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;

if (!dbUrl) console.error('FATAL: DATABASE_URL missing');
if (!jwtSecret) console.error('FATAL: JWT_SECRET missing');

let pool;
if (dbUrl) {
  try {
    const isProdEnv = process.env.NODE_ENV === 'production' || !!process.env.NETLIFY;
    console.log(`[Login] Initializing DB. IsProd: ${isProdEnv}`);
    pool = new Pool({ 
      connectionString: dbUrl,
      ssl: isProdEnv ? { rejectUnauthorized: false } : false  
    });
    console.log('[Login] Database pool initialized.');
  } catch (err) {
    console.error('[Login] Failed to init DB:', err.message);
    pool = null;
  }
}

exports.handler = async (event, context) => {
  // Add a global timeout to prevent hanging
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Function timeout')), 10000) // 10s timeout
  );

  try {
    return await Promise.race([
      executeHandler(event, context),
      timeoutPromise
    ]);
  } catch (err) {
    console.error('[Login] CRITICAL FAILURE:', err.message);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Gateway Timeout or Internal Error' })
    };
  }
};

async function executeHandler(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let payload;
  try {
    const bodyStr = typeof event.body === 'string' ? event.body : JSON.stringify(event.body);
    payload = JSON.parse(bodyStr || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { email, password } = payload;
  if (!email || !password) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Email and password required' }) };
  }

  if (!pool) {
    console.error('[Login] DB Pool null');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server Config Error' }) };
  }

  const client = await pool.connect();
  try {
    // 4. Find User
    const userResult = await client.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (userResult.rows.length === 0) {
      await new Promise(r => setTimeout(r, 500));
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid credentials' }) };
    }
    const user = userResult.rows[0];

    // 5. Rate Limiting
    const rateKey = `${RATE_LIMIT_KEY_PREFIX}${user.id}`;
    let attempts = 0;
    let rateLimitExceeded = false;
    let ttl = LOCKOUT_TIME_SECONDS;

    try {
      const attemptsStr = await redis.get(rateKey);
      attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        rateLimitExceeded = true;
        ttl = await redis.ttl(rateKey).catch(() => LOCKOUT_TIME_SECONDS);
      } else {
        await redis.incr(rateKey);
        await redis.expire(rateKey, LOCKOUT_TIME_SECONDS);
      }
    } catch (redisErr) {
      console.warn('[Login] Redis error:', redisErr.message);
    }

    if (rateLimitExceeded) {
      return {
        statusCode: 429,
        body: JSON.stringify({ error: 'Too many attempts', retryAfter: ttl })
      };
    }

    // 6. Verify Password
    const isValid = await argon2.verify(user.password_hash, password);
    if (!isValid) {
      const ipAddress = context?.identity?.sourceIp || 'unknown';
      await logAuditEvent(client, user.id, 'LOGIN_FAILED', { email }, ipAddress);
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid credentials' }) };
    }

    // 7. Success: Reset Rate Limit
    try { await redis.del(rateKey); } catch (e) { console.warn('Redis del failed'); }

    // 8. Generate JWT
    if (!jwtSecret) return { statusCode: 500, body: JSON.stringify({ error: 'No JWT Secret' }) };
    const token = jwt.sign({ userId: user.id, email: user.email }, jwtSecret, { expiresIn: SESSION_DURATION });

    // 9. CSRF
    const csrfToken = crypto.randomBytes(32).toString('hex');

    // 10. Audit
    const ipAddress = context?.identity?.sourceIp || 'unknown';
    await logAuditEvent(client, user.id, 'LOGIN_SUCCESS', { email, mfaRequired: user.mfa_enabled }, ipAddress);

    // 11. Update Login
    await client.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    // 12. Cookies (TEST: Lax, No Secure)
    const samesiteFlag = 'Lax';
    const authParts = [`auth_token=${token}`, 'HttpOnly', `SameSite=${samesiteFlag}`, `Path=/`, `Max-Age=${SESSION_DURATION}`];
    const csrfParts = [`csrf_token=${csrfToken}`, `SameSite=${samesiteFlag}`, `Path=/`, `Max-Age=${SESSION_DURATION}`];
    
    // NO Secure flag for this test
    const cookie1 = authParts.join('; ');
    const cookie2 = csrfParts.join('; ');

    console.log(`[Login] PREPARING RESPONSE. Cookies: ${cookie1.substring(0, 20)}...`);

    const response = {
      statusCode: 200,
      headers: {
        'Set-Cookie': [cookie1, cookie2],
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff'
      },
      body: JSON.stringify({
        success: true,
        userId: user.id,
        mfaEnabled: user.mfa_enabled || false,
        message: user.mfa_enabled ? 'MFA required' : 'Login successful'
      })
    };

    console.log('[Login] RETURNING RESPONSE.');
    return response;

  } catch (error) {
    console.error('[Login] UNCAUGHT ERROR:', error.message, error.stack);
    return { statusCode: 500, body: JSON.stringify({ error: 'Unexpected Error' }) };
  } finally {
    console.log('[Login] Releasing DB client.');
    client.release();
  }
}

async function logAuditEvent(client, userId, eventType, details, ipAddress) {
  try {
    await client.query(
      `INSERT INTO audit_logs (user_id, event_type, details, timestamp, ip_address) 
       VALUES ($1, $2, $3, NOW(), $4)`,
      [userId, eventType, JSON.stringify(details), ipAddress || 'unknown']
    );
  } catch (err) {
    console.error('[Audit] Failed:', err.message);
  }
}
