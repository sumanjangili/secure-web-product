// netlify/functions/save-secure-data.js
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

  const { ciphertext, salt, iv } = payload;
  
  if (!ciphertext || !salt || !iv) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing encryption components' }) };
  }

  const client = await pool.connect();
  try {
    // Insert Encrypted Blob
    await client.query(
      `INSERT INTO secure_data (user_id, ciphertext, salt, iv, created_at) 
       VALUES ($1, $2, $3, $4, NOW())`,
      [userId, ciphertext, salt, iv]
    );

    // Log Event
    await client.query(
      `INSERT INTO audit_logs (user_id, event_type, details, timestamp) 
       VALUES ($1, $2, $3, NOW())`,
      [userId, 'SECURE_TICKET_CREATED', JSON.stringify({ 
        size: ciphertext.length, 
        type: 'contact_form',
        timestamp: new Date().toISOString()
      })]
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        message: 'Secure ticket created successfully. Data is encrypted and stored.'
      }),
    };

  } catch (error) {
    console.error('[Save Secure Data] Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to store data' }) };
  } finally {
    client.release();
  }
};
