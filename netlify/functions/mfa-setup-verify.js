// netlify/functions/mfa-setup-verify.js
const { pool } = require('./lib/db');
const { verify } = require('otplib');
const argon2 = require('argon2');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');
const { validateCsrf } = require('./_middleware/csrf-check');

// --- Configuration ---
const dbUrl = process.env.DATABASE_URL;
const MAX_MFA_VERIFY_ATTEMPTS = 5;
const LOCKOUT_TIME_SECONDS = 15 * 60; // 15 minutes
const BACKUP_CODE_COUNT = 10;

// ±30s clock-drift allowance for TOTP verification (≈ the old window:1
// from otplib v12; v13 expresses tolerance in seconds, not steps).
const EPOCH_TOLERANCE_SECONDS = 30;

exports.handler = async (event, context) => {
  // 1. Method Check
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // 2. CSRF Check (CRITICAL)
  const csrfError = validateCsrf(event);
  if (csrfError) return csrfError;

  // 3. Authenticate via Cookie (HttpOnly)
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
    console.error('[MFA Verify] JWT Verification Failed:', jwtErr.message);
    if (jwtErr.name === 'TokenExpiredError') {
      return { statusCode: 401, body: JSON.stringify({ error: 'Session expired. Please log in again.' }) };
    }
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) };
  }

  // 4. Parse Body
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { code } = payload;
  if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid code format. Expected 6 digits.' }) };
  }

  // 5. Rate limiting — protects the 6-digit TOTP from brute force.
  // 5 attempts per 15 minutes, atomic via checkRateLimit (mirrors verify-mfa.js).
  const rateKey = `mfa_setup_verify:${userId}`;

  let rateLimitResult;
  try {
    rateLimitResult = await redis.checkRateLimit(
      rateKey,
      MAX_MFA_VERIFY_ATTEMPTS,
      LOCKOUT_TIME_SECONDS
    );
  } catch (redisErr) {
    console.warn('[MFA Verify] Redis rate limit failed (non-fatal):', redisErr.message);
    rateLimitResult = { allowed: true, count: 0, ttl: LOCKOUT_TIME_SECONDS };
  }

  if (!rateLimitResult.allowed) {
    return {
      statusCode: 429,
      headers: { 'Retry-After': String(rateLimitResult.ttl) },
      body: JSON.stringify({
        error: 'Too many MFA verification attempts. Please try again later.',
        retryAfter: rateLimitResult.ttl,
      }),
    };
  }

  const client = await pool.connect();
  try {
    // 6. Fetch User MFA Secret
    const userResult = await client.query('SELECT mfa_secret, email, id FROM public.users WHERE id = $1', [userId]);

    if (userResult.rows.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }) };
    }

    const user = userResult.rows[0];
    if (!user.mfa_secret) {
      return { statusCode: 400, body: JSON.stringify({ error: 'MFA not initiated. Please run the init step first.' }) };
    }

    // 7. Verify TOTP Code (otplib v13: async, returns { valid, delta })
    const result = await verify({
      secret: user.mfa_secret,
      token: code,
      epochTolerance: [EPOCH_TOLERANCE_SECONDS, EPOCH_TOLERANCE_SECONDS],
    });

    if (!result.valid) {
      // Rate limit already incremented by checkRateLimit — no manual increment needed
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid code. Please try again.' }) };
    }

    // 8. Generate Backup Codes
    const backupCodes = [];
    const backupCodeHashes = [];

    for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
      // 6 random bytes as hex = 12 HEX characters (0-9, A-F).
      // Entropy is 48 bits; Argon2-hashed at rest.
      const codeStr = crypto.randomBytes(6).toString('hex').toUpperCase();
      backupCodes.push(codeStr);

      const hash = await argon2.hash(codeStr);
      backupCodeHashes.push(hash);
    }

    // 9. Transaction — the UPDATE and audit INSERT are atomic.
    await client.query('BEGIN');

    try {
      await client.query(
        `UPDATE public.users
         SET mfa_enabled = TRUE,
             backup_code_hashes = $1,
             needs_new_backup_codes = FALSE,
             mfa_verified_at = NOW()
         WHERE id = $2`,
        [backupCodeHashes, userId]
      );

      const ipAddress = context.identity?.sourceIp || 'unknown';
      const auditTimestamp = new Date().toISOString();

      const safeDetails = {
        event_type: 'MFA_SETUP_COMPLETE',
        timestamp: auditTimestamp,
        backupCodesCount: BACKUP_CODE_COUNT,
        method: 'totp'
      };

      await client.query(
        `INSERT INTO public.audit_logs (user_id, event_type, details, timestamp, ip_address)
         VALUES ($1, $2, $3, NOW(), $4)`,
        [userId, 'MFA_SETUP_COMPLETE', JSON.stringify(safeDetails), ipAddress]
      );

      await client.query('COMMIT');
    } catch (dbError) {
      await client.query('ROLLBACK');
      console.error('[MFA Verify] Database transaction failed:', dbError);
      throw dbError;
    }

    // 10. Reset rate limit on success
    try {
      await redis.resetRateLimit(rateKey);
    } catch (redisErr) {
      console.warn('[MFA Verify] Redis reset failed (non-fatal):', redisErr.message);
    }

    // 10.5 Upgrade the session token: the user just proved TOTP possession,
    // so the new JWT carries mfaVerified: true (mirrors verify-mfa.js).
    // Without this, save-secure-data's requireMFAIfEnrolled gate 403s on the
    // pre-MFA token until the user logs out/in again.
    const SESSION_DURATION = 86400;
    const isProd = process.env.NODE_ENV === 'production' || !!process.env.NETLIFY;
    const newToken = jwt.sign(
      { userId: user.id, email: user.email, mfaVerified: true },
      process.env.JWT_SECRET,
      { expiresIn: 86400 } // SESSION_DURATION (define at top: const SESSION_DURATION = 86400;)
    );
    const authCookie = `auth_token=${newToken}; HttpOnly; SameSite=${isProd ? 'None' : 'Lax'}; Path=/; Max-Age=86400${isProd ? '; Secure; Domain=.indoscient.in' : ''}`;

    // 11. Return Response — plaintext backup codes ONLY ONCE, never stored.
    const response = {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private'
      },
      body: JSON.stringify({
        success: true,
        backupCodes,
        message: 'MFA enabled successfully. Save these codes immediately. They will not be shown again.',
      }),
    };
    response.multiValueHeaders = { 'Set-Cookie': [authCookie] };
    return response;

  } catch (error) {
    console.error('[MFA Verify] Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Verification failed. Please try again.' }) };
  } finally {
    client.release();
  }
};
