// netlify/functions/save-consent.js
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // Verify JWT token
  let userId;
  try {
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Missing authorization token' }) };
    }
    
    const jwt = require('jsonwebtoken');
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.userId; // This is already a UUID string from the JWT
  } catch (jwtErr) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired token' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { essential, analytics, timestamp, version } = payload;
  
  if (typeof essential !== 'boolean' || typeof analytics !== 'boolean' || !version) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required consent fields' }) };
  }

  const client = await pool.connect();
  try {
    // Store consent record
    await client.query(
      `INSERT INTO consent_records (user_id, essential, analytics, version, timestamp, created_at) 
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [userId, essential, analytics, version, timestamp]
    );

    // Also log to audit trail
    await client.query(
      `INSERT INTO audit_logs (user_id, event_type, details, timestamp) 
       VALUES ($1, $2, $3, NOW())`,
      [userId, 'CONSENT_UPDATED', JSON.stringify({ 
        essential, 
        analytics, 
        version,
        timestamp 
      })]
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        message: 'Consent saved successfully' 
      }),
    };

  } catch (error) {
    console.error('[Save Consent] Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save consent' }) };
  } finally {
    client.release();
  }
};
