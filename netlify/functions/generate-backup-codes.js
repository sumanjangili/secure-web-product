// netlify/functions/generate-backup-codes.js
const { Pool } = require('pg');
const argon2 = require('argon2');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');
const { validateCsrf } = require('./_middleware/csrf-check');

// --- Configuration ---
const dbUrl = process.env.DATABASE_URL;
const CODE_COUNT = 10;
const MAX_GENERATIONS_PER_HOUR = 3;
const RATE_LIMIT_WINDOW = 60 * 60; // 1 hour in seconds

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
    console.error('[GenBackupCodes] JWT Verification Failed:', jwtErr.message);
    if (jwtErr.name === 'TokenExpiredError') {
      return jsonResponse(401, { error: 'Session expired. Please log in again.' });
    }
    return jsonResponse(401, { error: 'Invalid session' });
  }

  // 4. Rate Limiting - ATOMIC check using Lua script
  const rateKey = `backup_codes_gen:${userId}`;
  const ipAddress = context.identity?.sourceIp || 'unknown';
  
  let rateLimitResult;
  try {
    rateLimitResult = await redis.checkRateLimit(
      rateKey, 
      MAX_GENERATIONS_PER_HOUR, 
      RATE_LIMIT_WINDOW
    );
  } catch (redisErr) {
    console.warn('[GenBackupCodes] Redis rate limit check failed (non-fatal):', redisErr.message);
    rateLimitResult = { allowed: true, count: 0, ttl: RATE_LIMIT_WINDOW };
  }

  if (!rateLimitResult.allowed) {
    try {
      await logAuditEvent(client, userId, 'BACKUP_CODES_RATE_LIMITED', { 
        attempts: rateLimitResult.count 
      }, ipAddress);
    } catch (auditErr) {
      console.error('[GenBackupCodes] Audit FAILED (ignored):', auditErr.message);
    }

    return jsonResponse(429, { 
      error: 'Too many code generation attempts. Please try again later.', 
      retryAfter: rateLimitResult.ttl 
    }, {
      'Retry-After': String(rateLimitResult.ttl)
    });
  }

  const client = await pool.connect();
  try {
    // 5. Verify User Exists
    const userResult = await client.query(
      'SELECT id, mfa_enabled, backup_code_hashes, needs_new_backup_codes FROM public.users WHERE id = $1', 
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return jsonResponse(404, { error: 'User not found' });
    }

    const user = userResult.rows[0];
    
    if (!user.needs_new_backup_codes && user.backup_code_hashes && user.backup_code_hashes.length > 0) {
       console.log(`User ${userId} regenerated codes despite having valid ones.`);
    }

    // 6. Generate Codes
    const codes = [];
    const hashes = [];

    for (let i = 0; i < CODE_COUNT; i++) {
      const code = crypto.randomBytes(8).toString('hex').toUpperCase();
      const hash = await argon2.hash(code);
      codes.push(code);
      hashes.push(hash);
    }

    // 7. Update Database
    await client.query(
      `UPDATE public.users 
       SET backup_code_hashes = $1, needs_new_backup_codes = FALSE 
       WHERE id = $2`,
      [hashes, userId]
    );

    // 8. Log Audit Event
    try {
      await logAuditEvent(client, userId, 'BACKUP_CODES_GENERATED', { 
        count: CODE_COUNT 
      }, ipAddress);
    } catch (auditErr) {
      console.error('[GenBackupCodes] Audit FAILED (ignored):', auditErr.message);
    }

    // 9. Rate limit was already incremented by checkRateLimit - no manual increment needed

    const allowedOrigin = getAllowedOrigin(event.headers.origin);
    
    return jsonResponse(200, {
      success: true,
      codes: codes,
      message: 'Save these codes securely. They will not be shown again.'
    }, {
      'Access-Control-Allow-Origin': allowedOrigin || 'https://app.indoscient.in',
      'Access-Control-Allow-Credentials': 'true',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Vary': 'Origin'
    });

  } catch (error) {
    console.error('[GenerateBackupCodes] Error:', error);
    return jsonResponse(500, { error: 'Failed to generate codes' });
  } finally {
    client.release();
  }
};
