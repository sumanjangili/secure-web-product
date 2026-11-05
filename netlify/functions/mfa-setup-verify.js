// netlify/functions/mfa-setup-verify.js
const { authenticator } = require('otplib');
const { Pool } = require('pg');
const argon2 = require('argon2');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');
const { validateCsrf } = require('./_middleware/csrf-check');

// Set options once globally
authenticator.options = { window: 1 };

// --- Configuration ---
const dbUrl = process.env.DATABASE_URL;
const MAX_MFA_VERIFY_ATTEMPTS = 5;
const LOCKOUT_TIME_SECONDS = 15 * 60; // 15 minutes
const BACKUP_CODE_COUNT = 10;

// Initialize Pool with SSL for Neon/Cloud Postgres
const pool = new Pool({
  connectionString: dbUrl,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

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

  // 5. ✅ FIX: Rate limiting — was completely missing, making the 6-digit
  // TOTP brute-forceable (~1M combinations, 3 valid per window with window:1).
  // Mirrors verify-mfa.js: 5 attempts per 15 minutes, atomic via checkRateLimit.
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
    const userResult = await client.query('SELECT mfa_secret FROM public.users WHERE id = $1', [userId]);

    if (userResult.rows.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }) };
    }

    const user = userResult.rows[0];
    if (!user.mfa_secret) {
      return { statusCode: 400, body: JSON.stringify({ error: 'MFA not initiated. Please run the init step first.' }) };
    }

    // 7. Verify TOTP Code
    const isValid = authenticator.check(code, user.mfa_secret);

    if (!isValid) {
      // Rate limit already incremented by checkRateLimit — no manual increment needed
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid code. Please try again.' }) };
    }

    // 8. Generate Backup Codes
    const backupCodes = [];
    const backupCodeHashes = [];

    for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
      // ✅ COMMENT FIX: 6 random bytes as hex = 12 HEX characters (0-9, A-F),
      // NOT full alphanumeric. Entropy is 48 bits — strength is fine.
      // The frontend's [A-Z0-9]{12} validator is a superset, so still compatible.
      const codeStr = crypto.randomBytes(6).toString('hex').toUpperCase();
      backupCodes.push(codeStr);

      const hash = await argon2.hash(codeStr);
      backupCodeHashes.push(hash);
    }

    // 9. ✅ FIX: Transaction — the UPDATE and audit INSERT are now atomic.
    // Previously a crash between them enabled MFA without any audit record.
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

    // 10. ✅ FIX: Reset rate limit on success
    try {
      await redis.resetRateLimit(rateKey);
    } catch (redisErr) {
      console.warn('[MFA Verify] Redis reset failed (non-fatal):', redisErr.message);
    }

    // 11. Return Response — plaintext backup codes ONLY ONCE, never stored.
    return {
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

  } catch (error) {
    console.error('[MFA Verify] Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Verification failed. Please try again.' }) };
  } finally {
    client.release();
  }
};
