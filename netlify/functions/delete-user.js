// netlify/functions/delete-user.js
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Log the Deletion Request
    await client.query(
      `INSERT INTO audit_logs (user_id, event_type, details, timestamp) 
       VALUES ($1, 'USER_ERASURE_REQUESTED', $2, NOW())`,
      [userId, JSON.stringify({ reason: payload.reason, timestamp: payload.timestamp })]
    );

    // Hard Delete User Data
    const deleteResult = await client.query('DELETE FROM users WHERE id = $1', [userId]);

    if (deleteResult.rowCount === 0) {
      throw new Error('User not found');
    }

    await client.query('COMMIT');

    // Log Success
    await client.query(
      `INSERT INTO audit_logs (user_id, event_type, details, timestamp) 
       VALUES ($1, 'USER_ERASURE_COMPLETED', $2, NOW())`,
      [userId, JSON.stringify({ deletedAt: new Date().toISOString() })]
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        message: 'Account and associated data have been permanently erased.' 
      }),
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[DeleteUser] Critical Error:', error);
    
    try {
      await client.query(
        `INSERT INTO audit_logs (user_id, event_type, details, timestamp) 
         VALUES ($1, 'USER_ERASURE_FAILED', $2, NOW())`,
        [userId, JSON.stringify({ error: error.message })]
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
