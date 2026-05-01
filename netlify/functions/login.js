// netlify/functions/login.js
const { Pool } = require('pg');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const redis = require('./lib/redis'); 

// --- DEBUG START: Check Environment Variable ---
const dbUrl = process.env.DATABASE_URL;

console.log('=== DEBUG: DATABASE_URL CHECK ===');
console.log('1. Variable exists?', !!dbUrl);
console.log('2. Value length:', dbUrl ? dbUrl.length : 0);
if (dbUrl) {
  // Log only the protocol and host to avoid leaking passwords in logs
  try {
    const urlObj = new URL(dbUrl);
    console.log('3. Host detected:', urlObj.hostname);
    console.log('4. Port:', urlObj.port);
  } catch (e) {
    console.log('3. Invalid URL format:', e.message);
  }
} else {
  console.log('3. CRITICAL: DATABASE_URL is MISSING or EMPTY!');
}
console.log('=== DEBUG END ===');
// ----------------------------------------------

// Only initialize Pool if URL exists to prevent "base" error
let pool;
if (dbUrl) {
  pool = new Pool({ connectionString: dbUrl });
} else {
  console.error('FATAL: Cannot create DB pool. Aborting handler.');
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME_SECONDS = 15 * 60;
const RATE_LIMIT_KEY_PREFIX = 'login_rate_limit:';

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { email, password } = payload;

  if (!email || !password) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Email and password required' }) };
  }

  // Safety check: If pool wasn't initialized, fail fast
  if (!pool) {
    console.error('Handler aborted: Database pool not initialized.');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const client = await pool.connect();
  try {
    const userResult = await client.query('SELECT * FROM users WHERE email = $1', [email]);

    if (userResult.rows.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid credentials' }) };
    }

    const user = userResult.rows[0];

    // Check Rate Limit
    const rateKey = `${RATE_LIMIT_KEY_PREFIX}${user.id}`;
    const attempts = await redis.get(rateKey);

    if (attempts && parseInt(attempts) >= MAX_LOGIN_ATTEMPTS) {
      const ttl = await redis.ttl(rateKey);
      await logAuditEvent(client, user.id, 'LOGIN_RATE_LIMITED', { email });
      return {
        statusCode: 429,
        body: JSON.stringify({ error: 'Too many login attempts. Try again later.', retryAfter: ttl }),
      };
    }

    // Verify Password
    const isValid = await argon2.verify(user.password_hash, password);

    if (!isValid) {
      await redis.incr(rateKey);
      await redis.expire(rateKey, LOCKOUT_TIME_SECONDS);
      await logAuditEvent(client, user.id, 'LOGIN_FAILED', { email });
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid credentials' }) };
    }

    // Success: Reset Rate Limit
    await redis.del(rateKey);

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Log Success
    await logAuditEvent(client, user.id, 'LOGIN_SUCCESS', { 
      email, 
      mfaRequired: user.mfa_enabled || false,
      timestamp: new Date().toISOString() 
    });

    // Update Last Login
    await client.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        userId: user.id,
        mfaEnabled: user.mfa_enabled || false,
        sessionToken: token,
        message: user.mfa_enabled ? 'MFA required' : 'Login successful'
      }),
    };

  } catch (error) {
    console.error('[Login] Error:', error);
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
    console.error('[Audit Log] Failed to write:', err);
  }
}
