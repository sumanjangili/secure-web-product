// netlify/functions/audit_log.js
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');

// --- Configuration ---
const dbUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
const MAX_REQUESTS_PER_MINUTE = 30;
const RATE_LIMIT_WINDOW = 60; // 1 minute in seconds

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

// --- Admin User Configuration ---
const ADMIN_USER_IDS = (() => {
  const raw = process.env.ADMIN_USER_IDS;
  if (!raw || !raw.trim()) return [];
  
  return raw
    .split(',')
    .map(id => id.trim().toLowerCase())
    .filter(id => id.length > 0); // Reject empty entries
})();

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
  // 1. Handle CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    const allowedOrigin = getAllowedOrigin(event.headers.origin);
    
    return jsonResponse(204, {}, {
      'Access-Control-Allow-Origin': allowedOrigin || '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Authorization',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    });
  }

  // 2. Method Check
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  // 3. Authentication Check (NO CSRF required for read-only operation)
  let userId;
  try {
    const cookies = event.headers.cookie;
    if (!cookies) {
      console.error('[AuditLog] No cookies in request');
      return jsonResponse(401, { error: 'Authentication required' });
    }

    const cookiePairs = cookies.split(';');
    const authTokenPair = cookiePairs.find(pair => pair.trim().startsWith('auth_token='));
    
    if (!authTokenPair) {
      console.error('[AuditLog] auth_token cookie missing');
      return jsonResponse(401, { error: 'Session cookie missing' });
    }

    const token = authTokenPair.split('=')[1];
    const decoded = jwt.verify(token, jwtSecret);
    userId = decoded.userId;
  } catch (err) {
    console.error('[AuditLog] JWT verification failed:', err.message);
    return jsonResponse(401, { error: 'Invalid session' });
  }

  // Debug logging for troubleshooting
  console.log('[AuditLog] Authenticated user:', userId);

  // 4. Rate Limiting - ATOMIC check using Lua script
  const rateKey = `audit_log_read:${userId}`;
  
  let rateLimitResult;
  try {
    rateLimitResult = await redis.checkRateLimit(
      rateKey, 
      MAX_REQUESTS_PER_MINUTE, 
      RATE_LIMIT_WINDOW
    );
  } catch (redisErr) {
    console.warn('[AuditLog] Redis rate limit check failed (non-fatal):', redisErr.message);
    rateLimitResult = { allowed: true, count: 0, ttl: RATE_LIMIT_WINDOW };
  }

  if (!rateLimitResult.allowed) {
    return jsonResponse(429, { 
      error: 'Too many requests. Please slow down.', 
      retryAfter: rateLimitResult.ttl 
    }, {
      'Retry-After': String(rateLimitResult.ttl)
    });
  }

  // 5. Authenticate & Check Admin Status
  let isAdmin = false;
  const currentUserId = String(userId).trim().toLowerCase();
  
  if (ADMIN_USER_IDS.includes(currentUserId)) {
    isAdmin = true;
    console.log(`[AuditLog] Admin access granted for user: ${currentUserId}`);
  } else {
    console.log(`[AuditLog] Non-admin access for user: ${currentUserId}. Showing only own logs.`);
  }

  // 6. Parse Query Params
  const { limit = '50', offset = '0', userId: filterUserId } = event.queryStringParameters || {};
  
  const safeLimit = Math.min(parseInt(limit, 10) || 50, 100);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const client = await pool.connect();
  try {
    let query;
    let params = [];

    if (!isAdmin) {
      // Regular users see ONLY their own logs
      query = `
        SELECT id, event_type, details, timestamp, ip_address 
        FROM public.audit_logs 
        WHERE user_id = $1 
        ORDER BY timestamp DESC 
        LIMIT $2 OFFSET $3
      `;
      params = [userId, safeLimit, safeOffset];
    } else {
      // Admins can filter by any user or see all logs
      if (filterUserId) {
        if (isNaN(parseInt(filterUserId))) {
          return jsonResponse(400, { error: 'Invalid user ID filter' });
        }
        query = `
          SELECT id, event_type, details, timestamp, ip_address, user_id 
          FROM public.audit_logs 
          WHERE user_id = $1 
          ORDER BY timestamp DESC 
          LIMIT $2 OFFSET $3
        `;
        params = [filterUserId, safeLimit, safeOffset];
      } else {
        query = `
          SELECT id, event_type, details, timestamp, ip_address, user_id 
          FROM public.audit_logs 
          ORDER BY timestamp DESC 
          LIMIT $1 OFFSET $2
        `;
        params = [safeLimit, safeOffset];
      }
    }

    const result = await client.query(query, params);

    // ✅ Rate limit already incremented by checkRateLimit - no manual increment needed

    const allowedOrigin = getAllowedOrigin(event.headers.origin);

    return jsonResponse(200, {
      success: true,
      count: result.rows.length,
      logs: result.rows.map(row => ({
        ...row,
        // Sanitize: Never expose IP addresses to non-admins
        ip_address: isAdmin ? row.ip_address : 'hidden',
        // Mask user_id for non-admin viewing other users' logs
        user_id: isAdmin ? row.user_id : undefined
      }))
    }, {
      'Access-Control-Allow-Origin': allowedOrigin || 'https://app.indoscient.in',
      'Access-Control-Allow-Credentials': 'true',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Origin'
    });

  } catch (error) {
    console.error('[AuditLog] Error fetching logs:', error);
    return jsonResponse(500, { error: 'Failed to retrieve audit logs' });
  } finally {
    client.release();
  }
};
