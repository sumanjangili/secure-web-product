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
const MAX_MFA_ATTEMPTS = 5;
const LOCKOUT_TIME_SECONDS = 15 * 60; // 15 minutes
const SESSION_DURATION = 86400; // 24 hours

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
  // Handle CORS Preflight
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

  // 1. Method Check
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  // 2. CSRF Check (CRITICAL)
  const csrfError = validateCsrf(event);
  if (csrfError) return csrfError;

  // 3. Authenticate via Cookie
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
    console.error('[VerifyMFA] JWT Verification Failed:', jwtErr.message);
    if (jwtErr.name === 'TokenExpiredError') {
      return jsonResponse(401, { error: 'Session expired. Please log in again.' });
    }
    return jsonResponse(401, { error: 'Invalid session' });
  }

  // 4. Parse Body
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  const { mfaCode, backupCode, method } = payload;

  if ((!mfaCode && !backupCode) || !method) {
    return jsonResponse(400, { error: 'Missing required fields (code and method)' });
  }

  const client = await pool.connect();
  try {
    // 5. Fetch User Data
    const userResult = await client.query('SELECT * FROM public.users WHERE id = $1', [userId]);

    if (userResult.rows.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 500)); // Timing attack prevention
      return jsonResponse(401, { error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];
    const ipAddress = context.identity?.sourceIp || 'unknown';

    // 6. Rate Limiting - ATOMIC check using Lua script
    const rateKey = `mfa_rate_limit:${userId}`;
    
    let rateLimitResult;
    try {
      rateLimitResult = await redis.checkRateLimit(
        rateKey, 
        MAX_MFA_ATTEMPTS, 
        LOCKOUT_TIME_SECONDS
      );
    } catch (redisErr) {
      console.warn('[VerifyMFA] Redis rate limit check failed (non-fatal):', redisErr.message);
      rateLimitResult = { allowed: true, count: 0, ttl: LOCKOUT_TIME_SECONDS };
    }

    if (!rateLimitResult.allowed) {
      try {
        await logAuditEvent(client, userId, 'MFA_RATE_LIMITED', { 
          method,
          attempts: rateLimitResult.count
        }, ipAddress);
      } catch (auditErr) {
        console.error('[VerifyMFA] Audit FAILED (ignored):', auditErr.message);
      }
      
      return jsonResponse(429, { 
        error: 'Too many MFA attempts. Please try again later.', 
        retryAfter: rateLimitResult.ttl 
      }, {
        'Retry-After': String(rateLimitResult.ttl)
      });
    }

    // 7. Verify Code
    let isValid = false;
    let matchedHashIndex = -1;

    if (method === 'totp') {
      if (!user.mfa_secret) {
        return jsonResponse(400, { error: 'MFA not configured for this user' });
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
      // Rate limit already incremented by checkRateLimit - no manual increment needed
      
      try {
        await logAuditEvent(client, userId, 'MFA_FAILED', { 
          method 
        }, ipAddress);
      } catch (auditErr) {
        console.error('[VerifyMFA] Audit FAILED (ignored):', auditErr.message);
      }
      
      return jsonResponse(401, { 
        error: 'Invalid code', 
        requiresBackupCode: method === 'totp'
      });
    }

    // 8. Success: Begin Transaction for Atomic Updates
    await client.query('BEGIN');

    try {
      // 9. Handle Backup Code Consumption
      if (method === 'backup' && matchedHashIndex !== -1) {
        const newHashes = user.backup_code_hashes.filter((_, i) => i !== matchedHashIndex);
        const needsNew = newHashes.length === 0;
        
        await client.query(
          `UPDATE public.users SET backup_code_hashes = $1, needs_new_backup_codes = $2 WHERE id = $3`,
          [newHashes, needsNew, userId]
        );
      }

      // 10. Generate NEW JWT
      const newToken = jwt.sign(
        { userId: user.id, email: user.email, mfaVerified: true },
        process.env.JWT_SECRET,
        { expiresIn: SESSION_DURATION }
      );

      // 11. Log Success
      try {
        await logAuditEvent(client, userId, 'MFA_SUCCESS', { 
          method 
        }, ipAddress);
      } catch (auditErr) {
        console.error('[VerifyMFA] Audit FAILED (ignored):', auditErr.message);
      }

      // Commit the transaction
      await client.query('COMMIT');

      // 12. Reset Rate Limit
      try {
        await redis.resetRateLimit(rateKey);
      } catch (redisErr) {
        console.warn('[VerifyMFA] Redis del failed:', redisErr.message);
      }

      // 13. Return Response with NEW Cookie
      const isProd = process.env.NODE_ENV === 'production' || !!process.env.NETLIFY;
      const samesiteFlag = isProd ? 'None' : 'Lax';
      const domainFlag = isProd ? '; Domain=.indoscient.in' : '';
      
      const authCookie = `auth_token=${newToken}; HttpOnly; SameSite=${samesiteFlag}; Path=/; Max-Age=${SESSION_DURATION}${isProd ? '; Secure' : ''}${domainFlag}`;
      
      const allowedOrigin = getAllowedOrigin(event.headers.origin);
      
      return jsonResponse(200, {
        success: true,
        userId: user.id,
        message: 'MFA verified successfully'
      }, {
        'Set-Cookie': authCookie,
        'Access-Control-Allow-Origin': allowedOrigin || 'https://app.indoscient.in',
        'Access-Control-Allow-Credentials': 'true',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Vary': 'Origin'
      });

    } catch (dbError) {
      // Rollback on database error
      await client.query('ROLLBACK');
      console.error('[VerifyMFA] Database transaction failed:', dbError);
      throw dbError;
    }

  } catch (error) {
    console.error('[VerifyMFA] Error:', error);
    return jsonResponse(500, { error: 'Internal server error' });
  } finally {
    client.release();
  }
};
