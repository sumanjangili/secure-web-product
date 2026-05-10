// netlify/functions/delete-user.js
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const { validateCsrf } = require('./_middleware/csrf-check'); // ✅ Import CSRF validator

// --- Configuration ---
const dbUrl = process.env.DATABASE_URL;

// Initialize Pool with SSL for Neon/Cloud Postgres
const pool = new Pool({ 
  connectionString: dbUrl,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false }
    : false  // Disable SSL for local dev
});

// Helper to sanitize input for audit logs (prevent XSS in logs)
const sanitizeLogInput = (str) => {
  if (typeof str !== 'string') return '';
  // Remove HTML tags and control characters
  return str.replace(/[<>]/g, '').replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
};

exports.handler = async (event, context) => {
  // 1. Method Check
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // 2. CSRF Check (CRITICAL)
  // Prevents Cross-Site Request Forgery attacks on this destructive endpoint
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
    
    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.userId;
  } catch (jwtErr) {
    console.error('[DeleteUser] JWT Verification Failed:', jwtErr.message);
    if (jwtErr.name === 'TokenExpiredError') {
      return { statusCode: 401, body: JSON.stringify({ error: 'Session expired. Please log in again.' }) };
    }
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) };
  }

  // 4. Parse Body
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const client = await pool.connect();
  try {
    // Start Transaction
    await client.query('BEGIN');

    // 5. Log the Deletion Request (Before deletion)
    const reason = sanitizeLogInput(payload.reason || 'GDPR Right to Erasure');
    const timestamp = payload.timestamp ? new Date(payload.timestamp).toISOString() : new Date().toISOString();

    await client.query(
      `INSERT INTO audit_logs (user_id, event_type, details, timestamp, ip_address) 
       VALUES ($1, 'USER_ERASURE_REQUESTED', $2, NOW(), $3)`,
      [userId, JSON.stringify({ reason, timestamp }), context.identity?.sourceIp || 'unknown']
    );

    // 6. Log Completion (BEFORE deleting the user to ensure FK validity)
    // This ensures the audit log entry is valid even if the user row is deleted immediately after.
    await client.query(
      `INSERT INTO audit_logs (user_id, event_type, details, timestamp, ip_address) 
       VALUES ($1, 'USER_ERASURE_COMPLETED', $2, NOW(), $3)`,
      [userId, JSON.stringify({ deletedAt: new Date().toISOString() }), context.identity?.sourceIp || 'unknown']
    );

    // 7. Hard Delete User Data
    // NOTE: Ensure your DB schema has ON DELETE CASCADE for foreign keys (secure_data, etc.)
    // If not, you must manually delete child records here before deleting the user.
    const deleteResult = await client.query('DELETE FROM users WHERE id = $1', [userId]);

    if (deleteResult.rowCount === 0) {
      // User not found. This could mean they were already deleted.
      // To prevent information leakage, we treat this as a success or a specific error.
      // Here we return success to avoid revealing if the user existed.
      await client.query('ROLLBACK'); // No changes made, but we need to clean up
      return {
        statusCode: 200,
        headers: {
          'Set-Cookie': 'auth_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, private'
        },
        body: JSON.stringify({ 
          success: true, 
          message: 'Account and associated data have been permanently erased (or did not exist).' 
        }),
      };
    }

    // Commit Transaction
    await client.query('COMMIT');

    // Clear the session cookie in the response
    return {
      statusCode: 200,
      headers: {
        'Set-Cookie': 'auth_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private'
      },
      body: JSON.stringify({ 
        success: true, 
        message: 'Account and associated data have been permanently erased.' 
      }),
    };

  } catch (error) {
    // Rollback on any error
    await client.query('ROLLBACK');
    console.error('[DeleteUser] Critical Error:', error);
    
    // Attempt to log failure (Best effort, might fail if DB is in bad state)
    try {
      await client.query(
        `INSERT INTO audit_logs (user_id, event_type, details, timestamp, ip_address) 
         VALUES ($1, 'USER_ERASURE_FAILED', $2, NOW(), $3)`,
        [userId, JSON.stringify({ error: sanitizeLogInput(error.message) }), context.identity?.sourceIp || 'unknown']
      );
    } catch (logErr) {
      console.error('[DeleteUser] Failed to log error:', logErr);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error during erasure process' }),
    };
  } finally {
    client.release();
  }
};
