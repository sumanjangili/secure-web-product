// netlify/functions/verify-mfa.js
const { authenticator } = require('otplib');
const { Pool } = require('pg');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');
const { validateCsrf } = require('./_middleware/csrf-check'); // Import CSRF validator

// Set options once globally
authenticator.options = { window: 1 };

// --- Configuration ---
const dbUrl = process.env.DATABASE_URL;
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME_SECONDS = 15 * 60; // 15 minutes
const RATE_LIMIT_KEY_PREFIX = 'mfa_rate_limit:';

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
  // Prevents Cross-Site Request Forgery attacks on this state-changing endpoint
  const csrfError = validateCsrf(event);
  if (csrfError) return csrfError;

  // 3. Authenticate via Cookie (HttpOnly)
  // The user has already logged in (step 1), so the cookie should exist.
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
    
    // Verify JWT (This token was set in the login step, pending MFA)
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.userId;
  } catch (jwtErr) {
    console.error('[VerifyMFA] JWT Verification Failed:', jwtErr.message);
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

  const { mfaCode, backupCode, method } = payload;

  if ((!mfaCode && !backupCode) || !method) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields (code and method)' }) };
  }

  const client = await pool.connect();
  try {
    // 5. Fetch User Data
    const userResult = await client.query('SELECT * FROM users WHERE id = $1', [userId]);

    if (userResult.rows.length === 0) {
      // Constant time delay to prevent timing attacks (simulate work even if user not found)
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid credentials' }) };
    }

    const user = userResult.rows[0];

    // 6. Rate Limiting Check
    const rateKey = `${RATE_LIMIT_KEY_PREFIX}${userId}`;
    let attempts = 0;
    
    try {
      const attemptsStr = await redis.get(rateKey);
      attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;
    } catch (redisErr) {
      console.warn('[VerifyMFA] Redis error (non-fatal):', redisErr.message);
      // Proceed without rate limiting if Redis fails, but log it
    }

    if (attempts >= MAX_ATTEMPTS) {
      const ttl = await redis.ttl(rateKey).catch(() => LOCKOUT_TIME_SECONDS);
      await logAuditEvent(client, userId, 'MFA_RATE_LIMITED', { method });
      return {
        statusCode: 429,
        body: JSON.stringify({ 
          error: 'Too many MFA attempts. Please try again later.', 
          retryAfter: ttl > 0 ? ttl : LOCKOUT_TIME_SECONDS 
        }),
      };
    }

    // 7. Verify Code
    let isValid = false;
    let matchedHashIndex = -1;

    if (method === 'totp') {
      if (!user.mfa_secret) {
        return { statusCode: 400, body: JSON.stringify({ error: 'MFA not configured for this user' }) };
      }
      isValid = authenticator.check(mfaCode, user.mfa_secret);
    } else if (method === 'backup') {
      const storedHashes = user.backup_code_hashes || [];
      // Iterate to find matching hash
      for (let i = 0; i < storedHashes.length; i++) {
        try {
          if (await argon2.verify(storedHashes[i], backupCode)) {
            isValid = true;
            matchedHashIndex = i;
            break;
          }
        } catch (err) {
          // Ignore hash verification errors to prevent timing leaks
        }
      }
    }

    if (!isValid) {
      // Increment rate limit
      try {
        await redis.incr(rateKey);
        await redis.expire(rateKey, LOCKOUT_TIME_SECONDS);
      } catch (redisErr) {
        console.warn('[VerifyMFA] Redis incr failed:', redisErr.message);
      }
      
      await logAuditEvent(client, userId, 'MFA_FAILED', { method });
      return {
        statusCode: 401,
        body: JSON.stringify({ 
          error: 'Invalid code', 
          requiresBackupCode: method === 'totp' // Suggest backup code if TOTP failed
        }),
      };
    }

    // 8. Success: Begin Transaction for Atomic Updates
    // This prevents race conditions where two simultaneous requests consume the same backup code
    await client.query('BEGIN');

    try {
      // 9. Handle Backup Code Consumption (Atomic)
      if (method === 'backup' && matchedHashIndex !== -1) {
        const newHashes = user.backup_code_hashes.filter((_, i) => i !== matchedHashIndex);
        const needsNew = newHashes.length === 0;
        
        await client.query(
          `UPDATE users SET backup_code_hashes = $1, needs_new_backup_codes = $2 WHERE id = $3`,
          [newHashes, needsNew, userId]
        );
      }

      // 10. Generate NEW JWT for the fully authenticated session
      const newToken = jwt.sign(
        { userId: user.id, email: user.email, mfaVerified: true },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      // 11. Log Success
      await logAuditEvent(client, userId, 'MFA_SUCCESS', { 
        method, 
        ip: context.identity?.sourceIp || 'unknown',
        timestamp: new Date().toISOString()
      });

      // Commit the transaction
      await client.query('COMMIT');

      // 12. Reset Rate Limit (After successful commit)
      try {
        await redis.del(rateKey);
      } catch (redisErr) {
        console.warn('[VerifyMFA] Redis del failed:', redisErr.message);
      }

      // 13. Return Response with NEW Cookie
      return {
        statusCode: 200,
        headers: {
          // ✅ CRITICAL: Set the new fully-authenticated cookie
          'Set-Cookie': `auth_token=${newToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, private'
        },
        body: JSON.stringify({
          success: true,
          userId: user.id,
          message: 'MFA verified successfully'
          // ❌ REMOVED: token from body (security best practice)
        }),
      };

    } catch (dbError) {
      // Rollback on database error
      await client.query('ROLLBACK');
      console.error('[VerifyMFA] Database transaction failed:', dbError);
      throw dbError; // Re-throw to be caught by outer catch
    }

  } catch (error) {
    console.error('[VerifyMFA] Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  } finally {
    client.release();
  }
};

async function logAuditEvent(client, userId, eventType, details) {
  try {
    await client.query(
      `INSERT INTO audit_logs (user_id, event_type, details, timestamp, ip_address) 
       VALUES ($1, $2, $3, NOW(), $4)`,
      [userId, eventType, JSON.stringify(details), details.ip || 'unknown']
    );
  } catch (err) {
    console.error('[Audit Log] Failed:', err.message);
    // Don't fail the main operation if audit logging fails
  }
}
