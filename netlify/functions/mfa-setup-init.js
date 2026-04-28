// netlify/functions/mfa-setup-init.js
const { authenticator } = require('otplib');
const { Pool } = require('pg');
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
    if (jwtErr.name === 'JsonWebTokenError') {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token format' }) };
    }
    if (jwtErr.name === 'TokenExpiredError') {
      return { statusCode: 401, body: JSON.stringify({ error: 'Token expired' }) };
    }
    console.error('[MFA Init] JWT Verification Error:', jwtErr.message);
    return { statusCode: 401, body: JSON.stringify({ error: 'Authentication failed' }) };
  }

  try {
    // Generate TOTP Secret
    const secret = authenticator.generateSecret();
    
    // Generate QR Code URL
    const label = encodeURIComponent("SecureProduct");
    const issuer = encodeURIComponent("SecureProduct");
    const otpAuthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpAuthUrl)}`;

    // Log Init Event
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO audit_logs (user_id, event_type, details, timestamp) 
         VALUES ($1, 'MFA_INITIATED', $2, NOW())`,
        [userId, JSON.stringify({ method: 'totp' })]
      );
    } finally {
      client.release();
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        secret, 
        qrUrl,
        message: 'Scan the QR code with your authenticator app.'
      }),
    };

  } catch (error) {
    console.error('[MFA Init] Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to generate MFA secret' }) };
  }
};
