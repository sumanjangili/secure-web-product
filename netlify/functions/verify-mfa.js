// netlify/functions/verify-mfa.js
const { Pool } = require('pg');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME_SECONDS = 15 * 60;
const RATE_LIMIT_KEY_PREFIX = 'mfa_rate_limit:';

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // Extract JWT from Authorization header (NO AUDIT_SECRET NEEDED)
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

  const { mfaCode, backupCode, method } = payload;

  if ((!mfaCode && !backupCode) || !method) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  const client = await pool.connect();
  try {
    // Get User
    const userResult = await client.query('SELECT * FROM users WHERE id = $1', [userId]);

    if (userResult.rows.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid credentials' }) };
    }

    const user = userResult.rows[0];

    // Check Rate Limit
    const rateKey = `${RATE_LIMIT_KEY_PREFIX}${userId}`;
    const attempts = await redis.get(rateKey);

    if (attempts && parseInt(attempts) >= MAX_ATTEMPTS) {
      const ttl = await redis.ttl(rateKey);
      await logAuditEvent(client, userId, 'RATE_LIMIT_EXCEEDED', { method });
      return {
        statusCode: 429,
        body: JSON.stringify({ error: 'Too many attempts.', retryAfter: ttl }),
      };
    }

    let isValid = false;
    let matchedHashIndex = -1;

    // Verify Logic
    if (method === 'totp') {
      const { authenticator } = require('otplib');
      authenticator.options = { window: 1 };
      isValid = authenticator.check(mfaCode, user.mfa_secret);
    } else if (method === 'backup') {
      const storedHashes = user.backup_code_hashes || [];
      for (let i = 0; i < storedHashes.length; i++) {
        try {
          if (await argon2.verify(storedHashes[i], backupCode)) {
            isValid = true;
            matchedHashIndex = i;
            break;
          }
        } catch (err) {
          // Ignore hash verification errors
        }
      }
    }

    if (!isValid) {
      await redis.incr(rateKey);
      await redis.expire(rateKey, LOCKOUT_TIME_SECONDS);
      await logAuditEvent(client, userId, 'MFA_FAILED', { method });
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid code', requiresBackupCode: method === 'totp' }),
      };
    }

    // Success: Reset Rate Limit
    await redis.del(rateKey);

    // Invalidate Backup Code if used
    if (method === 'backup' && matchedHashIndex !== -1) {
      const newHashes = user.backup_code_hashes.filter((_, i) => i !== matchedHashIndex);
      const needsNew = newHashes.length === 0;
      await client.query(
        `UPDATE users SET backup_code_hashes = $1, needs_new_backup_codes = $2 WHERE id = $3`,
        [newHashes, needsNew, userId]
      );
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Log Success
    await logAuditEvent(client, userId, 'MFA_SUCCESS', { method });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, userId: user.id, sessionToken: token }),
    };

  } catch (error) {
    console.error('[VerifyMFA] Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  } finally {
    client.release();
  }
};

async function logAuditEvent(client, userId, eventType, details) {
  try {
    await client.query(
      `INSERT INTO audit_logs (user_id, event_type, details, timestamp) 
       VALUES ($1, $2, $3, NOW())`,
      [userId, eventType, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('[Audit Log] Failed:', err);
  }
}
