// netlify/functions/delete-user.js
const { Pool } = require('pg');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');
const { validateCsrf } = require('./_middleware/csrf-check');

// --- Configuration ---
const dbUrl = process.env.DATABASE_URL;
const MAX_DELETIONS_PER_HOUR = 3;
const RATE_LIMIT_WINDOW = 60 * 60; // 1 hour

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
    if (normalized === origin.toLowerCase()) return origin;
  }

  if (normalized.includes('localhost') && !process.env.NETLIFY) {
    return requestedOrigin;
  }

  return null;
}

// --- Database Initialization ---
const pool = new Pool({
  connectionString: dbUrl,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

/**
 * Builds Set-Cookie strings that DELETE cookies with attributes matching
 * login.js exactly. CRITICAL: must stay in sync with login.js buildCookie()
 * and logout.js buildDeletionCookies() — one cookie contract, three files.
 */
function buildDeletionCookies() {
  const isProd = process.env.NODE_ENV === 'production' || !!process.env.NETLIFY;

  const build = (name, httpOnly) => {
    const attrs = [`${name}=;`];
    if (httpOnly) attrs.push('HttpOnly');
    attrs.push(`SameSite=${isProd ? 'None' : 'Lax'}`);
    attrs.push('Path=/');
    attrs.push('Max-Age=0');
    attrs.push(`Expires=${new Date(0).toUTCString()}`);
    if (isProd) attrs.push('Secure');
    if (isProd) attrs.push('Domain=.indoscient.in');
    return attrs.join(' ');
  };

  return [build('auth_token', true), build('csrf_token', false)];
}

const sanitizeLogInput = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '').replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
};

function jsonResponse(statusCode, data, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders
    },
    body: JSON.stringify(data)
  };
}

exports.handler = async (event, context) => {
  // 1. CORS Preflight
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

  // 3. CSRF Check (CRITICAL)
  const csrfError = validateCsrf(event);
  if (csrfError) return csrfError;

  // 4. Authenticate via Cookie (HttpOnly)
  let userId;
  try {
    const cookies = event.headers.cookie;
    if (!cookies) {
      return jsonResponse(401, { error: 'Authentication required. No session cookie found.' });
    }

    const cookiePairs = cookies.split(';');
    const authTokenPair = cookiePairs.find(pair => pair.trim().startsWith('auth_token='));

    if (!authTokenPair) {
      return jsonResponse(401, { error: 'Authentication required. Session cookie missing.' });
    }

    const token = authTokenPair.split('=')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.userId;
  } catch (jwtErr) {
    console.error('[DeleteUser] JWT Verification Failed:', jwtErr.message);
    if (jwtErr.name === 'TokenExpiredError') {
      return jsonResponse(401, { error: 'Session expired. Please log in again.' });
    }
    return jsonResponse(401, { error: 'Invalid or expired session' });
  }

  // 5. Parse Body
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  const { password } = payload;
  if (!password || typeof password !== 'string' || password.length < 1 || password.length > 1024) {
    return jsonResponse(400, { error: 'Password confirmation required.' });
  }

  // 6. Rate Limiting (BEFORE expensive password hash check)
  const rateKey = `user_delete:${userId}`;
  const ipAddress = context.identity?.sourceIp || 'unknown';

  let rateLimitResult;
  try {
    rateLimitResult = await redis.checkRateLimit(rateKey, MAX_DELETIONS_PER_HOUR, RATE_LIMIT_WINDOW);
  } catch (redisErr) {
    console.warn('[DeleteUser] Redis rate limit check failed (non-fatal):', redisErr.message);
    rateLimitResult = { allowed: true, count: 0, ttl: RATE_LIMIT_WINDOW };
  }

  if (!rateLimitResult.allowed) {
    return jsonResponse(429, {
      error: 'Too many deletion attempts. Please contact support.',
      retryAfter: rateLimitResult.ttl
    }, {
      'Retry-After': String(rateLimitResult.ttl)
    });
  }

  const deletionCookies = buildDeletionCookies();
  const allowedOrigin = getAllowedOrigin(event.headers.origin);

  const client = await pool.connect();
  try {
    // 7. ✅ PASSWORD RE-AUTHENTICATION (before ANY mutation)
    // This raises the bar from "valid cookie" to "knowing the password" for
    // destructive actions. Standard practice (GitHub, Google, Apple all require this
    // for account deletion) — prevents a hijacked session (stolen cookie, malware,
    // shared computer) from irreversibly destroying someone's account with zero friction.
    const userResult = await client.query(
      'SELECT password_hash FROM public.users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      // User vanished between cookie verify and now. Return success to avoid
      // revealing whether the account existed.
      return jsonResponse(200, {
        success: true,
        message: 'Account and associated data have been permanently erased (or did not exist).'
      }, {
        'Set-Cookie': deletionCookies,
        'Access-Control-Allow-Origin': allowedOrigin || 'https://app.indoscient.in',
        'Access-Control-Allow-Credentials': 'true',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Vary': 'Origin'
      });
    }

    const user = userResult.rows[0];
    const isValidPassword = await argon2.verify(user.password_hash, password);

    if (!isValidPassword) {
      // Timing-safe: we still sleep to prevent timing attacks on password validity
      await new Promise(r => setTimeout(r, 500));

      return jsonResponse(401, { error: 'Incorrect password. Account deletion requires password confirmation.' });
    }

    // 8. Begin Transaction
    await client.query('BEGIN');

    // 9. ERASURE_REQUESTED — canonical name, details.key matches column param
    const reason = sanitizeLogInput(payload.reason || 'GDPR Right to Erasure');
    const timestamp = payload.timestamp
      ? new Date(payload.timestamp).toISOString()
      : new Date().toISOString();

    const safeDetailsRequest = {
      event_type: 'ERASURE_REQUESTED',
      timestamp: timestamp,
      reason: reason
    };

    await client.query(
      `INSERT INTO public.audit_logs (user_id, event_type, details, timestamp, ip_address) 
       VALUES ($1, $2, $3, NOW(), $4)`,
      [userId, 'ERASURE_REQUESTED', JSON.stringify(safeDetailsRequest), ipAddress]
    );

    // 10. ERASURE_COMPLETED — `reason` included (required by chk_erasure_log_structure)
    const completedTimestamp = new Date().toISOString();
    const safeDetailsComplete = {
      event_type: 'ERASURE_COMPLETED',
      timestamp: completedTimestamp,
      deletedAt: completedTimestamp,
      reason: reason
    };

    await client.query(
      `INSERT INTO public.audit_logs (user_id, event_type, details, timestamp, ip_address) 
       VALUES ($1, $2, $3, NOW(), $4)`,
      [userId, 'ERASURE_COMPLETED', JSON.stringify(safeDetailsComplete), ipAddress]
    );

    // (Explicit SET user_id = NULL removed — the FK's ON DELETE SET NULL handles it.)

    // 11. Hard Delete User (children cascade: secure_data, consent_records, etc.)
    const deleteResult = await client.query('DELETE FROM public.users WHERE id = $1', [userId]);

    if (deleteResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return jsonResponse(200, {
        success: true,
        message: 'Account and associated data have been permanently erased (or did not exist).'
      }, {
        'Set-Cookie': deletionCookies,
        'Access-Control-Allow-Origin': allowedOrigin || 'https://app.indoscient.in',
        'Access-Control-Allow-Credentials': 'true',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Vary': 'Origin'
      });
    }

    await client.query('COMMIT');

    return jsonResponse(200, {
      success: true,
      message: 'Account and associated data have been permanently erased.'
    }, {
      'Set-Cookie': deletionCookies,
      'Access-Control-Allow-Origin': allowedOrigin || 'https://app.indoscient.in',
      'Access-Control-Allow-Credentials': 'true',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Origin'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[DeleteUser] Critical Error:', error);

    // Best-effort failure audit (pool-level, independent of the rolled-back tx)
    try {
      const failedTimestamp = new Date().toISOString();
      const errorMessage = sanitizeLogInput(error.message);

      const safeDetailsFail = {
        event_type: 'ERASURE_FAILED',
        timestamp: failedTimestamp,
        error: errorMessage
      };

      await pool.query(
        `INSERT INTO public.audit_logs (user_id, event_type, details, timestamp, ip_address) 
         VALUES ($1, $2, $3, NOW(), $4)`,
        [userId, 'ERASURE_FAILED', JSON.stringify(safeDetailsFail), ipAddress]
      );
    } catch (logErr) {
      console.error('[DeleteUser] Failed to log error:', logErr);
    }

    return jsonResponse(500, { error: 'Internal server error during erasure process' });
  } finally {
    client.release();
  }
};
