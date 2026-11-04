// netlify/functions/login.js
const { Pool } = require('pg');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const redis = require('./lib/redis');

// --- Configuration ---
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME_SECONDS = 15 * 60; // 15 minutes
const SESSION_DURATION = 86400; // 24 hours

// --- Environment Validation ---
const dbUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;

if (!dbUrl) console.error('FATAL: DATABASE_URL missing');
if (!jwtSecret) console.error('FATAL: JWT_SECRET missing');

// --- Allowed Origins Configuration ---
const ALLOWED_ORIGINS = [
  'https://app.indoscient.in',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
];

function getAllowedOrigin(requestedOrigin) {
  if (!requestedOrigin) return null;
  
  const normalized = requestedOrigin.toLowerCase();
  for (const origin of ALLOWED_ORIGINS) {
    if (normalized === origin.toLowerCase()) {
      return origin;
    }
  }
  
  if (normalized.includes('localhost') && !process.env.NETLIFY) {
    return requestedOrigin;
  }
  
  return null;
}

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
 */
async function logAuditEvent(client, userId, eventType, details, ipAddress) {
  try {
    const compliantDetails = {
      event_type: String(eventType),
      timestamp: new Date().toISOString(),
      ip_address: ipAddress || 'unknown',
      ...(details || {}),
    };

    await client.query(
      `INSERT INTO public.audit_logs (user_id, event_type, details, timestamp, ip_address) 
       VALUES ($1, $2, $3, NOW(), $4)`,
      [userId, eventType, JSON.stringify(compliantDetails), ipAddress || 'unknown']
    );
  } catch (err) {
    console.error(`[Audit] NON-FATAL: ${eventType} - ${err.message}`);
  }
}

/**
 * Helper to create consistent error responses
 */
function jsonResponse(statusCode, data, extraHeaders = {}) {
  return {
    statusCode: statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders
    },
    body: JSON.stringify(data)
  };
}

exports.handler = async (event, context) => {
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
    return jsonResponse(502, { error: 'Gateway Timeout or Internal Error' });
  }
};

async function executeHandler(event, context) {
  // 1. Handle CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    const allowedOrigin = getAllowedOrigin(event.headers.origin);
    
    return jsonResponse(204, {}, {
      'Access-Control-Allow-Origin': allowedOrigin || '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Authorization',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    });
  }

  // 2. Method Check
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  // 3. Parse Body
  let payload;
  try {
    const bodyStr = typeof event.body === 'string' ? event.body : JSON.stringify(event.body);
    payload = JSON.parse(bodyStr || '{}');
  } catch (e) {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  const { email, password } = payload;
  if (!email || !password) {
    return jsonResponse(400, { error: 'Email and password required' });
  }

  // 4. Database Check
  if (!pool) {
    console.error('[Login] DB Pool null');
    return jsonResponse(500, { error: 'Server Config Error' });
  }

  const client = await pool.connect();
  try {
    // 5. Find User
    const userResult = await client.query(
      'SELECT * FROM public.users WHERE email = $1', 
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      await new Promise(r => setTimeout(r, 500)); // Timing attack prevention
      return jsonResponse(401, { error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];

    // 6. Rate Limiting - ATOMIC check using Lua script
    const rateKey = `login_rate_limit:${user.id}`;
    const ipAddress = context?.identity?.sourceIp || 'unknown';
    
    let rateLimitResult;
    try {
      rateLimitResult = await redis.checkRateLimit(
        rateKey, 
        MAX_LOGIN_ATTEMPTS, 
        LOCKOUT_TIME_SECONDS
      );
    } catch (redisErr) {
      console.warn('[Login] Redis rate limit check failed (non-fatal):', redisErr.message);
      // Continue without rate limiting if Redis fails
      rateLimitResult = { allowed: true, count: 0, ttl: LOCKOUT_TIME_SECONDS };
    }

    if (!rateLimitResult.allowed) {
      // Log rate limit event
      try {
        await logAuditEvent(client, user.id, 'LOGIN_RATE_LIMITED', { 
          attempts: rateLimitResult.count 
        }, ipAddress);
      } catch (auditErr) {
        console.warn('Audit log failed (ignored):', auditErr.message);
      }

      return jsonResponse(429, { 
        error: 'Too many login attempts', 
        retryAfter: rateLimitResult.ttl 
      }, {
        'Retry-After': String(rateLimitResult.ttl)
      });
    }

    // 7. Verify Password
    const isValid = await argon2.verify(user.password_hash, password);
    
    if (!isValid) {
      // Increment was already done by checkRateLimit - no need to increment again
      
      try {
        await logAuditEvent(client, user.id, 'LOGIN_FAILED', { 
          email: email 
        }, ipAddress);
      } catch (auditErr) {
        console.warn('Audit log failed on login failure (ignored):', auditErr.message);
      }
      
      return jsonResponse(401, { error: 'Invalid credentials' });
    }

    // 8. Success: Reset Rate Limit
    try { 
      await redis.resetRateLimit(rateKey); 
    } catch (e) { 
      console.warn('Redis del failed (non-fatal)'); 
    }

    // 9. Generate JWT
    if (!jwtSecret) {
      return jsonResponse(500, { error: 'Server configuration error' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email }, 
      jwtSecret, 
      { expiresIn: SESSION_DURATION }
    );

    // 10. Generate CSRF Token
    const csrfToken = crypto.randomBytes(32).toString('hex');

    // 11. Audit Log
    try {
      await logAuditEvent(client, user.id, 'LOGIN_SUCCESS', { 
        email: user.email,
        mfa_enabled: user.mfa_enabled || false
      }, ipAddress);
    } catch (auditErr) {
      console.error('[Login] Audit Log FAILED (Ignored):', auditErr.message);
    }

    // 12. Update Last Login
    try {
      await client.query(
        'UPDATE public.users SET last_login = NOW() WHERE id = $1', 
        [user.id]
      );
    } catch (updateErr) {
      console.error('[Login] Update Last Login FAILED (Ignored):', updateErr.message);
    }

    // 13. Prepare Cookies
    const isProd = process.env.NODE_ENV === 'production' || !!process.env.NETLIFY;
    const samesiteFlag = isProd ? 'None' : 'Lax';
    const domainFlag = isProd ? '; Domain=.indoscient.in' : '';
    
    const authCookie = `auth_token=${token}; HttpOnly; SameSite=${samesiteFlag}; Path=/; Max-Age=${SESSION_DURATION}${isProd ? '; Secure' : ''}${domainFlag}`;
    const csrfCookie = `csrf_token=${csrfToken}; SameSite=${samesiteFlag}; Path=/; Max-Age=${SESSION_DURATION}${isProd ? '; Secure' : ''}${domainFlag}`;

    const allowedOrigin = getAllowedOrigin(event.headers.origin);
    
    return jsonResponse(200, {
      success: true,
      userId: user.id,
      mfaEnabled: user.mfa_enabled || false,
      message: user.mfa_enabled ? 'MFA required' : 'Login successful'
    }, {
      'Set-Cookie': `${authCookie}, ${csrfCookie}`,
      'Access-Control-Allow-Origin': allowedOrigin || 'https://app.indoscient.in',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Authorization',
      'Access-Control-Max-Age': '86400',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Vary': 'Origin',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff'
    });

  } catch (error) {
    console.error('[Login] UNCAUGHT ERROR:', error.message, error.stack);
    return jsonResponse(500, { error: 'Unexpected error occurred' });
  } finally {
    client.release();
  }
}
