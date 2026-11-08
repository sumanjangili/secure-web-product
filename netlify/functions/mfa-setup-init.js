// netlify/functions/mfa-setup-init.js
const { generateSecret } = require('otplib');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');
const { validateCsrf } = require('./_middleware/csrf-check');
const { requireMFAIfEnrolled } = require('./_middleware/require-mfa');

// --- Configuration ---
const dbUrl = process.env.DATABASE_URL;
const MAX_INIT_PER_HOUR = 10; // Secret regeneration is a rare, deliberate act
const RATE_LIMIT_WINDOW = 3600; // 1 hour
const EPOCH_TOLERANCE_SECONDS = 30;

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

// Initialize Pool with SSL for Neon/Cloud Postgres
const pool = new Pool({
  connectionString: dbUrl,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

exports.handler = async (event, context) => {
  // 1. CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    const allowedOrigin = getAllowedOrigin(event.headers.origin);

    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin || '*',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Authorization',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
      },
    };
  }

  // 2. Method Check
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // 3. CSRF Check (CRITICAL)
  const csrfError = validateCsrf(event);
  if (csrfError) return csrfError;

  // 4. Authenticate via Cookie (HttpOnly)
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
    console.error('[MFA Init] JWT Verification Failed:', jwtErr.message);
    if (jwtErr.name === 'TokenExpiredError') {
      return { statusCode: 401, body: JSON.stringify({ error: 'Session expired. Please log in again.' }) };
    }
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) };
  }

  // 5. Rate limiting — each call regenerates a secret AND writes to the DB
  const rateKey = `mfa_setup_init:${userId}`;

  let rateLimitResult;
  try {
    rateLimitResult = await redis.checkRateLimit(rateKey, MAX_INIT_PER_HOUR, RATE_LIMIT_WINDOW);
  } catch (redisErr) {
    console.warn('[MFA Init] Redis rate limit failed (non-fatal):', redisErr.message);
    rateLimitResult = { allowed: true, count: 0, ttl: RATE_LIMIT_WINDOW };
  }

  if (!rateLimitResult.allowed) {
    return {
      statusCode: 429,
      headers: { 'Retry-After': String(rateLimitResult.ttl) },
      body: JSON.stringify({
        error: 'Too many MFA setup attempts. Please try again later.',
        retryAfter: rateLimitResult.ttl,
      }),
    };
  }

  const client = await pool.connect();
  try {
    // 6. Fetch user email + current MFA state (single query)
    const userResult = await client.query(
      'SELECT email, mfa_enabled FROM public.users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }) };
    }

    const user = userResult.rows[0];
    const isRotation = user.mfa_enabled === true;

    // CONDITIONAL gate (MFA is optional):
    // - First-time enrollment: user holds a pre-MFA token by definition —
    //   demanding mfaVerified here created a deadlock where NOBODY could
    //   ever enable MFA. Enrollment stays open.
    // - Rotation of an ACTIVE secret: user has MFA on, so a legit login
    //   session would have mfaVerified. A token lacking it mid-session is
    //   the compromise scenario — demand proof before invalidating the
    //   old secret. requireMFAIfEnrolled enforces exactly this.
    const mfaError = requireMFAIfEnrolled(event, user.mfa_enabled);
    if (mfaError) return mfaError;

    // 7. Generate MFA Secret
    const secret = generateSecret();

    // 8. User-specific otpauth URI (RFC 6238 issuer:account)
    const issuer = 'SecureProduct';
    const label = encodeURIComponent(user.email);
    const encodedIssuer = encodeURIComponent(issuer);

    const otpAuthUrl = `otpauth://totp/${encodedIssuer}:${label}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;

    const ipAddress = context.identity?.sourceIp || 'unknown';
    const auditTimestamp = new Date().toISOString();

    // ROTATION event when re-initialising an ACTIVE secret — a deliberate
    // reconfigure or session-compromise indicator must leave a trace.
    const eventType = isRotation ? 'MFA_SECRET_ROTATED' : 'MFA_INITIATED';
    const safeDetails = {
      event_type: eventType,
      timestamp: auditTimestamp,
      method: 'totp',
    };

    // FIX: Transaction — the audit INSERT and the secret UPDATE are now
    // atomic. Previously a crash between them produced an audit record with
    // no matching secret rotation (or vice versa).
    await client.query('BEGIN');

    try {
      await client.query(
        `INSERT INTO public.audit_logs (user_id, event_type, details, timestamp, ip_address)
         VALUES ($1, $2, $3, NOW(), $4)`,
        [userId, eventType, JSON.stringify(safeDetails), ipAddress]
      );

      // 9. Store Secret in Database
      await client.query(
        `UPDATE public.users SET mfa_secret = $1, mfa_enabled = false WHERE id = $2`,
        [secret, userId]
      );

      await client.query('COMMIT');
    } catch (dbError) {
      await client.query('ROLLBACK');
      console.error('[MFA Init] Database transaction failed:', dbError);
      throw dbError;
    }

    // 10. Return Response
    // CRITICAL: DO NOT return 'secret' in the JSON body — the otpAuthUrl is
    // for local QR rendering (frontend uses qrcode.toCanvas) and manual entry.
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private'
      },
      body: JSON.stringify({
        success: true,
        otpAuthUrl,
        message: isRotation
          ? 'New QR code generated. Your previous authenticator entry is now invalid — re-scan and verify.'
          : 'Scan the QR code with your authenticator app.',
      }),
    };

  } catch (error) {
    console.error('[MFA Init] Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to generate MFA secret' }) };
  } finally {
    client.release();
  }
};
