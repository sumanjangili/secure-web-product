// netlify/functions/mfa-setup-verify.js
const { authenticator } = require('otplib');
const { Pool } = require('pg');
const argon2 = require('argon2');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

authenticator.options = { window: 1 };

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // Extract JWT from Authorization header
  let userId;
  try {
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Missing authorization token' }) };
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.userId;
  } catch (jwtErr) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired token' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { code } = payload;
  if (!code || code.length !== 6) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid code format' }) };
  }

  const client = await pool.connect();
  try {
    // Get User to retrieve the pending secret
    const userResult = await client.query('SELECT mfa_secret FROM users WHERE id = $1', [userId]);
    
    if (userResult.rows.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }) };
    }

    const user = userResult.rows[0];
    if (!user.mfa_secret) {
      return { statusCode: 400, body: JSON.stringify({ error: 'MFA not initiated. Run init first.' }) };
    }

    // Verify TOTP Code
    const isValid = authenticator.check(code, user.mfa_secret);

    if (!isValid) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid code' }) };
    }

    // Generate Backup Codes
    const backupCodes = [];
    const backupCodeHashes = [];
    const COUNT = 10;

    for (let i = 0; i < COUNT; i++) {
      const codeStr = crypto.randomBytes(8).toString('hex').toUpperCase();
      backupCodes.push(codeStr);
      const hash = await argon2.hash(codeStr);
      backupCodeHashes.push(hash);
    }

    // Update User Record
    await client.query(
      `UPDATE users 
       SET mfa_enabled = TRUE, 
           mfa_secret = NULL, 
           backup_code_hashes = $1, 
           needs_new_backup_codes = FALSE 
       WHERE id = $2`,
      [backupCodeHashes, userId]
    );

    // Log Success
    await client.query(
      `INSERT INTO audit_logs (user_id, event_type, details, timestamp) 
       VALUES ($1, 'MFA_SETUP_COMPLETE', $2, NOW())`,
      [userId, JSON.stringify({ backupCodesCount: COUNT })]
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        backupCodes, 
        message: 'Save these codes immediately. They will not be shown again.' 
      }),
    };

  } catch (error) {
    console.error('[MFA Verify] Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Verification failed' }) };
  } finally {
    client.release();
  }
};
