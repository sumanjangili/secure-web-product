// netlify/functions/generate-backup-codes.js
const { Pool } = require('pg');
const argon2 = require('argon2');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const CODE_COUNT = 10;

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

  const client = await pool.connect();
  try {
    // Verify User Exists
    const userResult = await client.query('SELECT id, mfa_enabled FROM users WHERE id = $1', [userId]);
    
    if (userResult.rows.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }) };
    }

    // Generate Codes
    const codes = [];
    const hashes = [];

    for (let i = 0; i < CODE_COUNT; i++) {
      const code = crypto.randomBytes(8).toString('hex').toUpperCase();
      const hash = await argon2.hash(code);
      codes.push(code);
      hashes.push(hash);
    }

    // Update Database
    await client.query(
      `UPDATE users 
       SET backup_code_hashes = $1, needs_new_backup_codes = FALSE 
       WHERE id = $2`,
      [hashes, userId]
    );

    // Log Event
    await client.query(
      `INSERT INTO audit_logs (user_id, event_type, details, timestamp) 
       VALUES ($1, 'BACKUP_CODES_GENERATED', $2, NOW())`,
      [userId, JSON.stringify({ count: CODE_COUNT })]
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        codes: codes,
        message: 'Save these codes securely. They will not be shown again.'
      }),
    };

  } catch (error) {
    console.error('[GenerateBackupCodes] Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to generate codes' }) };
  } finally {
    client.release();
  }
};
