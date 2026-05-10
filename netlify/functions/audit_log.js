// netlify/functions/audit_log.js
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');
const { validateCsrf } = require('./_middleware/csrf-check');

// --- Configuration ---
const dbUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
const RATE_LIMIT_KEY_PREFIX = 'audit_log_read:';
const MAX_REQUESTS_PER_MINUTE = 30;
const RATE_LIMIT_WINDOW = 60;

// Initialize Pool with conditional SSL
const pool = new Pool({ 
  connectionString: dbUrl,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false }
    : false // Disable SSL for local dev
});

// Robust parsing of ADMIN_USER_IDS
// 1. Check if variable exists
// 2. Split by comma
// 3. Trim whitespace from each ID
// 4. Convert to lowercase for case-insensitive comparison
const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS 
  ? process.env.ADMIN_USER_IDS.split(',').map(id => id.trim().toLowerCase()) 
  : [];

exports.handler = async (event, context) => {
  // 1. Method Check
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed. Use GET to view logs.' }) };
  }

  // 2. CSRF Check
  const csrfError = validateCsrf(event);
  if (csrfError) return csrfError;

  // 3. Rate Limiting Check
  let userId;
  try {
    const cookies = event.headers.cookie;
    if (!cookies) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Authentication required' }) };
    }

    const cookiePairs = cookies.split(';');
    const authTokenPair = cookiePairs.find(pair => pair.trim().startsWith('auth_token='));
    
    if (!authTokenPair) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Session cookie missing' }) };
    }

    const token = authTokenPair.split('=')[1];
    const decoded = jwt.verify(token, jwtSecret);
    userId = decoded.userId;
  } catch (err) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) };
  }

  const rateKey = `${RATE_LIMIT_KEY_PREFIX}${userId}`;
  let attempts = 0;
  
  try {
    const attemptsStr = await redis.get(rateKey);
    attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;
  } catch (redisErr) {
    console.warn('[AuditLog] Redis error (non-fatal):', redisErr.message);
  }

  if (attempts >= MAX_REQUESTS_PER_MINUTE) {
    const ttl = await redis.ttl(rateKey).catch(() => RATE_LIMIT_WINDOW);
    return {
      statusCode: 429,
      body: JSON.stringify({ 
        error: 'Too many requests. Please slow down.', 
        retryAfter: ttl > 0 ? ttl : RATE_LIMIT_WINDOW 
      }),
    };
  }

  // 4. Authenticate & Check Admin Status
  // Ensure comparison is robust
  let isAdmin = false;
  const currentUserId = String(userId).trim().toLowerCase();
  
  if (ADMIN_USER_IDS.includes(currentUserId)) {
    isAdmin = true;
    console.log(`[AuditLog] Admin access granted for user: ${currentUserId}`);
  } else {
    console.log(`[AuditLog] Non-admin access for user: ${currentUserId}. Showing only own logs.`);
  }

  // 5. Parse Query Params
  const { limit = '50', offset = '0', userId: filterUserId } = event.queryStringParameters || {};
  
  const safeLimit = Math.min(parseInt(limit, 10) || 50, 100);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const client = await pool.connect();
  try {
    let query;
    let params = [];

    if (!isAdmin) {
      // Non-admin: Only see own logs
      query = `
        SELECT id, event_type, details, timestamp, ip_address 
        FROM audit_logs 
        WHERE user_id = $1 
        ORDER BY timestamp DESC 
        LIMIT $2 OFFSET $3
      `;
      params = [userId, safeLimit, safeOffset];
    } else {
      // Admin: See all logs, optionally filtered
      if (filterUserId) {
        // Validate filterUserId
        if (isNaN(parseInt(filterUserId))) {
          return { statusCode: 400, body: JSON.stringify({ error: 'Invalid user ID filter' }) };
        }
        query = `
          SELECT id, event_type, details, timestamp, ip_address, user_id 
          FROM audit_logs 
          WHERE user_id = $1 
          ORDER BY timestamp DESC 
          LIMIT $2 OFFSET $3
        `;
        params = [filterUserId, safeLimit, safeOffset];
      } else {
        query = `
          SELECT id, event_type, details, timestamp, ip_address, user_id 
          FROM audit_logs 
          ORDER BY timestamp DESC 
          LIMIT $2 OFFSET $3
        `;
        params = [safeLimit, safeOffset];
      }
    }

    const result = await client.query(query, params);

    // Increment rate limit
    try {
      await redis.incr(rateKey);
      await redis.expire(rateKey, RATE_LIMIT_WINDOW);
    } catch (redisErr) {
      console.warn('[AuditLog] Redis incr failed:', redisErr.message);
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'X-Content-Type-Options': 'nosniff',
      },
      body: JSON.stringify({
        success: true,
        count: result.rows.length,
        logs: result.rows
      }),
    };

  } catch (error) {
    console.error('[AuditLog] Error fetching logs:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to retrieve audit logs' }),
    };
  } finally {
    client.release();
  }
};
