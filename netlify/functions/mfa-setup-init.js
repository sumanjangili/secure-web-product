// netlify/functions/mfa-setup-init.js
const { authenticator } = require('otplib');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const { validateCsrf } = require('./_middleware/csrf-check'); // ✅ Import CSRF validator

// Set options once globally
authenticator.options = { window: 1 };

// --- Configuration ---
const dbUrl = process.env.DATABASE_URL;

// Initialize Pool with SSL for Neon/Cloud Postgres
const pool = new Pool({ 
  connectionString: dbUrl,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false } // Required for Neon/Supabase/AWS RDS in serverless
    : false // Disable SSL for local dev
});

exports.handler = async (event, context) => {
  // 1. Method Check
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // 2. CSRF Check (CRITICAL)
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
    console.error('[MFA Init] JWT Verification Failed:', jwtErr.message);
    if (jwtErr.name === 'TokenExpiredError') {
      return { statusCode: 401, body: JSON.stringify({ error: 'Session expired. Please log in again.' }) };
    }
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) };
  }

  try {
    // 4. Generate MFA Secret
    const secret = authenticator.generateSecret();
    
    // 5. Generate QR Code URL
    // Format: otpauth://totp/ISSUER:LABEL?secret=SECRET&issuer=ISSUER
    const label = encodeURIComponent("SecureProduct"); 
    const issuer = encodeURIComponent("SecureProduct");
    
    // Construct the otpauth URI
    const otpAuthUrl = `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
    
    // Generate QR Code image URL
    // The frontend will use this URL to display the QR code.
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpAuthUrl)}`;

    const client = await pool.connect();
    try {
      // 6. Log Audit Event (FIXED: Ensuring details structure matches DB constraint)
      const ipAddress = context.identity?.sourceIp || 'unknown';
      const auditTimestamp = new Date().toISOString();
      
      // ✅ FIX: Explicitly include event_type and timestamp in the details object
      const safeDetails = {
        event_type: 'MFA_INITIATED',
        timestamp: auditTimestamp,
        method: 'totp'
      };

      await client.query(
        `INSERT INTO audit_logs (user_id, event_type, details, timestamp, ip_address) 
         VALUES ($1, $2, $3, NOW(), $4)`,
        [userId, 'MFA_INITIATED', JSON.stringify(safeDetails), ipAddress]
      );
      
      // 7. Store Secret in Database
      // Ensure 'users' table has a 'mfa_secret' column (TEXT or VARCHAR)
      await client.query(
        `UPDATE users SET mfa_secret = $1, mfa_enabled = false WHERE id = $2`,
        [secret, userId]
      );
    } finally {
      client.release();
    }

    // 8. Return Response
    // ⚠️ CRITICAL: DO NOT return 'secret' in the JSON body.
    // Returning the raw secret allows an XSS attacker to steal it and generate valid TOTP codes.
    // We only return the QR URL and the otpAuthUrl (which the frontend uses to render the image).
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private'
      },
      body: JSON.stringify({ 
        success: true, 
        // secret removed!
        qrUrl,
        otpAuthUrl, // Frontend uses this to generate the QR image, but should not expose the raw string
        message: 'Scan the QR code with your authenticator app.'
      }),
    };

  } catch (error) {
    console.error('[MFA Init] Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to generate MFA secret' }) };
  }
};
