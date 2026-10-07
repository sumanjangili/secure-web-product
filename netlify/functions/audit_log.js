// netlify/functions/audit_log.js
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');
const { validateCsrf } = require('./_middleware/csrf-check');

const dbUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
const RATE_LIMIT_KEY_PREFIX = 'audit_log_read:';
const MAX_REQUESTS_PER_MINUTE = 30;
const RATE_LIMIT_WINDOW = 60;

const pool = new Pool({ 
  connectionString: dbUrl,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false }
    : false
});

const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS 
  ? process.env.ADMIN_USER_IDS.split(',').map(id => id.trim().toLowerCase()) 
  : [];

exports.handler = async (event, context) => {
  // 1. Handle CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    const origin = event.headers.origin || '*';
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    };
  }

  // 2. Method Check
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // 3. CSRF Check (READ-ONLY - may consider relaxing this)
  const csrfError = validateCsrf(event);
  if (csrfError) {
    console.warn('[AuditLog] CSRF validation failed:', csrfError.body);
    return csrfError;
  }

  // 4. Rate Limiting Check
  let userId;
  try {
    const cookies = event.headers.cookie;
    if (!cookies) {
      console.error('[AuditLog] No cookies in request');
      return { statusCode: 401, body: JSON.stringify({ error: 'Authentication required' }) };
    }

    const cookiePairs = cookies.split(';');
    const authTokenPair = cookiePairs.find(pair => pair.trim().startsWith('auth_token='));
    
    if (!authTokenPair) {
      console.error('[AuditLog] auth_token cookie missing');
      return { statusCode: 401, body: JSON.stringify({ error: 'Session cookie missing' }) };
    }

    const token = authTokenPair.split('=')[1];
    const decoded = jwt.verify(token, jwtSecret);
    userId = decoded.userId;
  } catch (err) {
    console.error('[AuditLog] JWT verification failed:', err.message);
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) };
  }

  // Debug logging for cookie issues
  console.log('[AuditLog] Authenticated user:', userId);
  console.log('[AuditLog] Cookies received:', event.headers.cookie?.substring(0, 100) + '...');

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
      query = `
        SELECT id, event_type, details, timestamp, ip_address 
        FROM public.audit_logs 
        WHERE user_id = $1 
        ORDER BY timestamp DESC 
        LIMIT $2 OFFSET $3
      `;
      params = [userId, safeLimit, safeOffset];
    } else {
      if (filterUserId) {
        if (isNaN(parseInt(filterUserId))) {
          return { statusCode: 400, body: JSON.stringify({ error: 'Invalid user ID filter' }) };
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

    try {
      await redis.incr(rateKey);
      await redis.expire(rateKey, RATE_LIMIT_WINDOW);
    } catch (redisErr) {
      console.warn('[AuditLog] Redis incr failed:', redisErr.message);
    }

    const origin = event.headers.origin;
    const allowedOrigin = origin && (origin.includes('indoscient.in') || origin.includes('localhost')) 
      ? origin 
      : 'https://app.indoscient.in';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Credentials': 'true',
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
