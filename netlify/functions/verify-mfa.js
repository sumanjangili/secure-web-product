// netlify/functions/verify-mfa.js
const { authenticator } = require('otplib');
const { Pool } = require('pg');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');
const { validateCsrf } = require('./_middleware/csrf-check');

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
    : false
});

/**
 * Logs audit events with GUARANTEED constraint compliance.
 */
async function logAuditEvent(client, userId, eventType, details, ipAddress) {
  try {
    const compliantDetails = {
      event_type: String(eventType),           // REQUIRED by chk_audit_details_structure
      timestamp: new Date().toISOString(),     // REQUIRED by chk_audit_details_structure (as STRING)
      ...(details || {}),                       // Additional details
      ip_address: ipAddress || 'unknown'
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

exports.handler = async (event, context) => {
  // Handle CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    const origin = event.headers.origin || '*';
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    };
  }

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
    // 5. Fetch User Data (with public. schema prefix)
    const userResult = await client.query('SELECT * FROM public.users WHERE id = $1', [userId]);

    if (userResult.rows.length === 0) {
      // Constant time delay to prevent timing attacks
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
    }

    if (attempts >= MAX_ATTEMPTS) {
      const ttl = await redis.ttl(rateKey).catch(() => LOCKOUT_TIME_SECONDS);
      const ipAddress = context.identity?.sourceIp || 'unknown';
      
      try {
        await logAuditEvent(client, userId, 'MFA_RATE_LIMITED', { method }, ipAddress);
      } catch (auditErr) {
        console.error('[VerifyMFA] Audit FAILED (ignored):', auditErr.message);
      }
      
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
      
      const ipAddress = context.identity?.sourceIp || 'unknown';
      
      try {
        await logAuditEvent(client, userId, 'MFA_FAILED', { method }, ipAddress);
      } catch (auditErr) {
        console.error('[VerifyMFA] Audit FAILED (ignored):', auditErr.message);
      }
      
      return {
        statusCode: 401,
        body: JSON.stringify({ 
          error: 'Invalid code', 
          requiresBackupCode: method === 'totp'
        }),
      };
    }

    // 8. Success: Begin Transaction for Atomic Updates
    await client.query('BEGIN');

    try {
      // 9. Handle Backup Code Consumption (Atomic, with public. schema prefix)
      if (method === 'backup' && matchedHashIndex !== -1) {
        const newHashes = user.backup_code_hashes.filter((_, i) => i !== matchedHashIndex);
        const needsNew = newHashes.length === 0;
        
        await client.query(
          `UPDATE public.users SET backup_code_hashes = $1, needs_new_backup_codes = $2 WHERE id = $3`,
          [newHashes, needsNew, userId]
        );
      }

      // 10. Generate NEW JWT for the fully authenticated session
      const newToken = jwt.sign(
        { userId: user.id, email: user.email, mfaVerified: true },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      // 11. Log Success (with compliant audit structure)
      const ipAddress = context.identity?.sourceIp || 'unknown';
      
      try {
        await logAuditEvent(client, userId, 'MFA_SUCCESS', { 
          method, 
          ip_address: ipAddress
        }, ipAddress);
      } catch (auditErr) {
        console.error('[VerifyMFA] Audit FAILED (ignored):', auditErr.message);
      }

      // Commit the transaction
      await client.query('COMMIT');

      // 12. Reset Rate Limit (After successful commit)
      try {
        await redis.del(rateKey);
      } catch (redisErr) {
        console.warn('[VerifyMFA] Redis del failed:', redisErr.message);
      }

      // 13. Return Response with NEW Cookie (FIXED: SameSite=None + Secure for production)
      const isProd = process.env.NODE_ENV === 'production' || !!process.env.NETLIFY;
      const samesiteFlag = isProd ? 'None' : 'Lax';
      const secureFlag = isProd ? 'Secure' : '';
      
      const origin = event.headers.origin;
      const allowedOrigin = origin && (origin.includes('indoscient.in') || origin.includes('localhost')) 
        ? origin 
        : 'https://app.indoscient.in';
      
      return {
        statusCode: 200,
        headers: {
          'Set-Cookie': `auth_token=${newToken}; HttpOnly; ${secureFlag}; SameSite=${samesiteFlag}; Path=/; Max-Age=86400`,
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Allow-Credentials': 'true',
          'Cache-Control': 'no-store, no-cache, must-revalidate, private',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY'
        },
        body: JSON.stringify({
          success: true,
          userId: user.id,
          message: 'MFA verified successfully'
        }),
      };

    } catch (dbError) {
      // Rollback on database error
      await client.query('ROLLBACK');
      console.error('[VerifyMFA] Database transaction failed:', dbError);
      throw dbError;
    }

  } catch (error) {
    console.error('[VerifyMFA] Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  } finally {
    client.release();
  }
};
