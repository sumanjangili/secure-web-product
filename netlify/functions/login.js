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
const SESSION_DURATION = 86400; // 24 hours

// --- Environment Validation ---
const dbUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;

if (!dbUrl) console.error('FATAL: DATABASE_URL missing');
if (!jwtSecret) console.error('FATAL: JWT_SECRET missing');

// --- Database Initialization ---
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

/**
 * Logs audit events with GUARANTEED constraint compliance.
 * CRITICAL: The 'details' JSON MUST contain:
 * - event_type: STRING (top-level field in details)
 * - timestamp: STRING (top-level field in details)
 */
async function logAuditEvent(client, userId, eventType, details, ipAddress) {
  try {
    // BUILD compliant structure - NEVER rely on passed details alone
    const compliantDetails = {
      event_type: String(eventType),           // REQUIRED by chk_audit_details_structure
      timestamp: new Date().toISOString(),     // REQUIRED by chk_audit_details_structure (as STRING)
      ...(details && details.email && { email: details.email }),
      ...(details && details.mfaEnabled !== undefined && { mfa_required: Boolean(details.mfaEnabled) }),
      ip_address: ipAddress || 'unknown'       // Additional info
    };

    await client.query(
      `INSERT INTO audit_logs (user_id, event_type, details, timestamp, ip_address) 
       VALUES ($1, $2, $3, NOW(), $4)`,
      [userId, eventType, JSON.stringify(compliantDetails), ipAddress || 'unknown']
    );
  } catch (err) {
    // ABSOLUTELY NON-FATAL - never break login flow
    console.error(`[Audit] NON-FATAL: ${eventType} - ${err.message}`);
  }
}

exports.handler = async (event, context) => {
  // Global timeout to prevent hanging functions
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Function timeout')), 10000)
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
  // 1. Handle CORS Preflight (OPTIONS)
  if (event.httpMethod === 'OPTIONS') {
    const origin = event.headers.origin || '*';
    const allowedOrigin = origin === '*' ? '*' : origin;

    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    };
  }

  // 2. Method Check
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // 3. Parse Body
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

  // 4. Database Check
  if (!pool) {
    console.error('[Login] DB Pool null');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server Config Error' }) };
  }

  const client = await pool.connect();
  try {
    // 5. Find User
    const userResult = await client.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (userResult.rows.length === 0) {
      await new Promise(r => setTimeout(r, 500)); // Timing attack prevention
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid credentials' }) };
    }
    const user = userResult.rows[0];

    // 6. Rate Limiting
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

    // 7. Verify Password
    const isValid = await argon2.verify(user.password_hash, password);
    if (!isValid) {
      const ipAddress = context?.identity?.sourceIp || 'unknown';
      // Log failure (ISOLATED - non-fatal)
      try {
        await logAuditEvent(client, user.id, 'LOGIN_FAILED', { 
          email: email 
        }, ipAddress);
      } catch (auditErr) {
        console.warn('Audit log failed on login failure (ignored):', auditErr.message);
      }
      
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid credentials' }) };
    }

    // 8. Success: Reset Rate Limit
    try { await redis.del(rateKey); } catch (e) { console.warn('Redis del failed'); }

    // 9. Generate JWT
    if (!jwtSecret) return { statusCode: 500, body: JSON.stringify({ error: 'No JWT Secret' }) };
    const token = jwt.sign({ userId: user.id, email: user.email }, jwtSecret, { expiresIn: SESSION_DURATION });

    // 10. Generate CSRF Token
    const csrfToken = crypto.randomBytes(32).toString('hex');

    // 11. Audit Log (ISOLATED - non-fatal)
    const ipAddress = context?.identity?.sourceIp || 'unknown';
    try {
      await logAuditEvent(client, user.id, 'LOGIN_SUCCESS', { 
        email: user.email,
        mfaEnabled: user.mfa_enabled || false
      }, ipAddress);
    } catch (auditErr) {
      console.error('[Login] Audit Log FAILED (Ignored):', auditErr.message);
    }

    // 12. Update Last Login (ISOLATED - non-fatal)
    try {
      await client.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    } catch (updateErr) {
      console.error('[Login] Update Last Login FAILED (Ignored):', updateErr.message);
    }

    // 13. Prepare Cookies (FIXED: Secure + SameSite=None for production)
// ================================================
// CRITICAL COOKIE CONFIGURATION FOR PRODUCTION:
// - SameSite=None: Required for cross-origin HTTPS (frontend ≠ Netlify Functions)
// - Secure flag: Only send cookies over HTTPS
// - HttpOnly: Prevent JavaScript access (XSS protection)
// - Path=/: Available site-wide
// - Max-Age: 24-hour sessions
// ================================================================

const isProd = process.env.NODE_ENV === 'production' || !!process.env.NETLIFY;
const samesiteFlag = isProd ? 'None' : 'Lax';  // Lax for dev, None for production HTTPS cross-origin

// Generate both cookies with proper attributes
const authCookie = `auth_token=${token}; HttpOnly; SameSite=${samesiteFlag}; Path=/; Max-Age=${SESSION_DURATION}${isProd ? '; Secure' : ''}`;
const csrfCookie = `csrf_token=${csrfToken}; SameSite=${samesiteFlag}; Path=/; Max-Age=${SESSION_DURATION}${isProd ? '; Secure' : ''}`;

// Debug logging - REMOVE in production or keep for troubleshooting
console.log(`[Login] Production mode: ${isProd}`);
console.log(`[Login] SameSite setting: ${samesiteFlag}`);
console.log(`[Login] Auth cookie (truncated): ${authCookie.substring(0, 100)}...`);
console.log(`[Login] CSRF cookie (truncated): ${csrfCookie.substring(0, 100)}...`);

// Origin validation for CORS
const origin = event.headers.origin;
const allowedOrigin = origin && (origin.includes('indoscient.in') || origin.includes('localhost')) 
  ? origin 
  : 'https://app.indoscient.in';

return {
  statusCode: 200,
  headers: {
    'Set-Cookie': `${authCookie}, ${csrfCookie}`,  // Combined into single header
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigin,  // Must match frontend origin exactly
    'Access-Control-Allow-Credentials': 'true',    // Required when using credentials: include
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Authorization',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
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
