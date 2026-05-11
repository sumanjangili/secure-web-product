// netlify/functions/mfa-setup-verify.js
const { authenticator } = require('otplib');
const { Pool } = require('pg');
const argon2 = require('argon2');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { validateCsrf } = require('./_middleware/csrf-check'); // Import CSRF validator

// Set options once globally
authenticator.options = { window: 1 };

// --- Configuration ---
const dbUrl = process.env.DATABASE_URL;

// Initialize Pool with SSL for Neon/Cloud Postgres
const pool = new Pool({ 
  connectionString: dbUrl,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false } // Required for Neon/Supabase/AWS RDS in serverless
    : false  // Disable SSL for local dev
});

exports.handler = async (event, context) => {
  // 1. Method Check
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // 2. CSRF Check (CRITICAL)
  // Prevents Cross-Site Request Forgery attacks
  const csrfError = validateCsrf(event);
  if (csrfError) return csrfError;

  // 3. Authenticate via Cookie (HttpOnly)
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
    
    // Verify JWT
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
  if (!code || typeof code !== 'string' || code.length !== 6) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid code format. Expected 6 digits.' }) };
  }

  const client = await pool.connect();
  try {
    // 5. Fetch User MFA Secret
    const userResult = await client.query('SELECT mfa_secret FROM users WHERE id = $1', [userId]);
    
    if (userResult.rows.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }) };
    }

    const user = userResult.rows[0];
    if (!user.mfa_secret) {
      return { statusCode: 400, body: JSON.stringify({ error: 'MFA not initiated. Please run the init step first.' }) };
    }

    // 6. Verify TOTP Code
    const isValid = authenticator.check(code, user.mfa_secret);

    if (!isValid) {
      // Note: Rate limiting for MFA verification should ideally be handled here as well
      // to prevent brute-forcing the 6-digit code.
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid code. Please try again.' }) };
    }

    // 7. Generate Backup Codes
    const backupCodes = [];
    const backupCodeHashes = [];
    const COUNT = 10;

    for (let i = 0; i < COUNT; i++) {
      // Generate 12-character alphanumeric code (6 bytes = 12 hex chars)
      const codeStr = crypto.randomBytes(6).toString('hex').toUpperCase();
      backupCodes.push(codeStr);
      
      // Hash the code for storage using Argon2
      const hash = await argon2.hash(codeStr);
      backupCodeHashes.push(hash);
    }

    // 8. Update User Record
    // Ensure 'backup_code_hashes' column exists in 'users' table (TEXT[] or JSONB)
    await client.query(
      `UPDATE users 
       SET mfa_enabled = TRUE, 
           backup_code_hashes = $1, 
           needs_new_backup_codes = FALSE,
           mfa_verified_at = NOW()
       WHERE id = $2`,
      [backupCodeHashes, userId]
    );

    // 9. Log Audit Event (FIXED: Ensuring details structure matches DB constraint)
    const ipAddress = context.identity?.sourceIp || 'unknown';
    const auditTimestamp = new Date().toISOString();

    // ✅ FIX: Explicitly include event_type and timestamp in the details object
    const safeDetails = {
      event_type: 'MFA_SETUP_COMPLETE',
      timestamp: auditTimestamp,
      backupCodesCount: COUNT,
      method: 'totp'
    };

    await client.query(
      `INSERT INTO audit_logs (user_id, event_type, details, timestamp, ip_address) 
       VALUES ($1, $2, $3, NOW(), $4)`,
      [userId, 'MFA_SETUP_COMPLETE', JSON.stringify(safeDetails), ipAddress]
    );

    // 10. Return Response
    // ⚠️ CRITICAL: Return plaintext backup codes ONLY ONCE.
    // The frontend must display these immediately. They are never stored in the DB.
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private'
      },
      body: JSON.stringify({ 
        success: true, 
        backupCodes, 
        message: 'MFA enabled successfully. Save these codes immediately. They will not be shown again.' 
      }),
    };

  } catch (error) {
    console.error('[MFA Verify] Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Verification failed. Please try again.' }) };
  } finally {
    client.release();
  }
};
