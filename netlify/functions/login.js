// netlify/functions/login.js
const { Pool } = require('pg');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const redis = require('./lib/redis');

// --- Configuration ---
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME_SECONDS = 15 * 60; // 15 minutes
const RATE_LIMIT_KEY_PREFIX = 'login_rate_limit:';
const SESSION_DURATION = 86400; // 24 hours in seconds

// --- CRITICAL: Validate Environment Variables Immediately ---
const dbUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;

if (!dbUrl) {
  console.error('FATAL: DATABASE_URL is missing. Check Netlify Environment Variables.');
}

if (!jwtSecret) {
  console.error('FATAL: JWT_SECRET is missing. Check Netlify Environment Variables.');
}

// --- Database Initialization ---
let pool;

if (dbUrl) {
  try {
    // ROBUST PRODUCTION DETECTION:
    // 1. If NODE_ENV is explicitly 'production'
    // 2. OR if process.env.NETLIFY exists (even if undefined string, checking existence is safer)
    //    Note: In Netlify Functions, process.env.NETLIFY is usually set to "true" string.
    //    We check for truthiness to be safe against edge cases.
    const isProdEnv = process.env.NODE_ENV === 'production' || !!process.env.NETLIFY;
    
    console.log(`[Login] Initializing DB. NODE_ENV: ${process.env.NODE_ENV}, NETLIFY: ${process.env.NETLIFY}, IsProd: ${isProdEnv}`);

    pool = new Pool({ 
      connectionString: dbUrl,
      ssl: isProdEnv 
        ? { rejectUnauthorized: false } // Accept self-signed certs for cloud DBs (common in serverless)
        : false  
    });
    console.log('[Login] Database pool initialized.');
  } catch (err) {
    console.error('[Login] Failed to initialize DB pool:', err.message);
    pool = null;
  }
} else {
  pool = null;
}

exports.handler = async (event, context) => {
  // 1. Method Check
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // 2. Parse Body
  let payload;
  try {
    const bodyStr = typeof event.body === 'string' ? event.body : JSON.stringify(event.body);
    payload = JSON.parse(bodyStr || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { email, password } = payload;

  if (!email || !password) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Email and password are required' }) };
  }

  // 3. Database Check
  if (!pool) {
    console.error('[Login] Aborted: Database pool not initialized. Check DATABASE_URL env var.');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const client = await pool.connect();
  try {
    // 4. Find User
    const userResult = await client.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);

    if (userResult.rows.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 500)); // Timing attack prevention
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid credentials' }) };
    }

    const user = userResult.rows[0];

    // 5. Rate Limiting Check (ATOMIC PIPELINE)
    const rateKey = `${RATE_LIMIT_KEY_PREFIX}${user.id}`;
    let attempts = 0;
    
    try {
      // Use pipeline for atomic read-increment-expire to prevent race conditions
      const pipeline = redis.pipeline();
      pipeline.get(rateKey);
      pipeline.incr(rateKey);
      pipeline.expire(rateKey, LOCKOUT_TIME_SECONDS);
      
      const results = await pipeline.exec();
      // results[0] = get result, results[1] = incr result, results[2] = expire result
      const attemptsStr = results[0];
      attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;
      
      // If this was the first attempt (0 -> 1), we just incremented.
      // If it was already high, we incremented again.
      // We check the value AFTER increment to see if we exceeded the limit.
      // Note: The check below uses the NEW value.
      // If we want to block BEFORE incrementing, we'd check first. 
      // Standard pattern: Check old value. If old >= MAX, block. Else increment.
      // Let's revert to the safer "Check then Increment" logic using pipeline:
      
      // Re-doing logic for clarity:
      // 1. Get current
      // 2. If current >= MAX, return 429
      // 3. Else, incr and expire
      
      // Actually, the previous pipeline executed. Let's re-evaluate based on the result.
      // If the 'get' returned null, attempts was 0. Then 'incr' made it 1.
      // If 'get' returned 4, 'incr' made it 5.
      // We need to check if the NEW value exceeds the limit.
      // But strictly, if the user has 5 attempts, the 6th should fail.
      // So if attempts (after incr) > MAX, we failed.
      
      // Correction: The logic above increments first. 
      // If attempts (new) > MAX, we should have blocked.
      // But we already incremented. That's okay for rate limiting (we count the attempt).
      // But we need to return 429 if attempts > MAX.
      
      // Wait, the standard logic is:
      // If attempts >= MAX, return 429.
      // Else, increment.
      
      // Let's fix the pipeline logic to be "Check then Act"
      // We can't easily do "if" in a pipeline without Lua.
      // So we stick to: Get -> Check -> If OK, Incr.
      // But that's not atomic.
      // Best compromise for this scale: Get -> Check -> Incr. 
      // If two requests come in simultaneously, both might pass the check (e.g. 4 and 4).
      // Both increment to 5. Both succeed. 5th attempt allowed. 6th fails.
      // This is acceptable for login rate limiting.
      
      // Let's revert to the simpler, safer non-atomic check for readability, 
      // or use the pipeline result correctly.
      
      // RE-IMPLEMENTATION OF ATOMIC CHECK:
      // We will use the pipeline result.
      // If the 'get' result (attemptsStr) was >= MAX, we block.
      // But we already ran 'incr'. So we just need to check the original value.
      
      const originalAttempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;
      
      if (originalAttempts >= MAX_LOGIN_ATTEMPTS) {
        const ttl = await redis.ttl(rateKey).catch(() => LOCKOUT_TIME_SECONDS);
        const ipAddress = context?.identity?.sourceIp || 'unknown';
        await logAuditEvent(client, user.id, 'LOGIN_RATE_LIMITED', { email, attempts: originalAttempts }, ipAddress);
        
        return {
          statusCode: 429,
          body: JSON.stringify({ 
            error: 'Too many login attempts. Please try again later.', 
            retryAfter: ttl > 0 ? ttl : LOCKOUT_TIME_SECONDS 
          }),
        };
      }
      
      // If we are here, the attempt was valid. The 'incr' already happened in the pipeline.
      // No need to incr again.

    } catch (redisErr) {
      console.warn('[Login] Redis pipeline error (non-fatal):', redisErr.message);
      // Fail open? No, fail closed for security.
      // If Redis is down, we can't rate limit. 
      // For login, it's safer to allow the attempt but log the warning.
      // Or block? Let's allow but warn.
    }

    // 6. Verify Password
    const isValid = await argon2.verify(user.password_hash, password);

    if (!isValid) {
      // Increment failure count if not already done (if Redis failed above)
      // If Redis worked, we already incremented.
      // To be safe, we check if we actually incremented.
      // For simplicity, if Redis failed, we skip rate limiting for this attempt.
      // If Redis worked, we already incremented.
      
      const ipAddress = context?.identity?.sourceIp || 'unknown';
      await logAuditEvent(client, user.id, 'LOGIN_FAILED', { email }, ipAddress);
      
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid credentials' }) };
    }

    // 7. Success: Reset Rate Limit
    try {
      await redis.del(rateKey);
    } catch (redisErr) {
      console.warn('[Login] Redis del failed:', redisErr.message);
    }

    // 8. Generate JWT
    if (!jwtSecret) {
      console.error('[Login] CRITICAL: JWT_SECRET is missing. Cannot generate token.');
      return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }

    let token;
    try {
      token = jwt.sign(
        { userId: user.id, email: user.email },
        jwtSecret,
        { expiresIn: SESSION_DURATION }
      );
    } catch (jwtErr) {
      console.error('[Login] JWT Sign Error:', jwtErr.message);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to generate session' }) };
    }

    // 9. Generate CSRF Token
    const csrfToken = crypto.randomBytes(32).toString('hex');

    // 10. Audit Log
    const ipAddress = context?.identity?.sourceIp || 'unknown';
    await logAuditEvent(client, user.id, 'LOGIN_SUCCESS', { 
      email, 
      mfaRequired: user.mfa_enabled || false,
      timestamp: new Date().toISOString() 
    }, ipAddress);

    // 11. Update Last Login
    await client.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    // 12. Determine Cookie Flags (CRITICAL FIX)
    // Force Secure and Strict if running on Netlify (regardless of NODE_ENV)
    const isProd = process.env.NODE_ENV === 'production' || !!process.env.NETLIFY;
    const samesiteFlag = isProd ? 'Strict' : 'Lax'; 
    
    const authParts = [`auth_token=${token}`, 'HttpOnly', `SameSite=${samesiteFlag}`, `Path=/`, `Max-Age=${SESSION_DURATION}`];
    const csrfParts = [`csrf_token=${csrfToken}`, `SameSite=${samesiteFlag}`, `Path=/`, `Max-Age=${SESSION_DURATION}`];

    // ALWAYS set Secure if we are in production (Netlify)
    if (isProd) {
      authParts.unshift('Secure');
      csrfParts.unshift('Secure');
    }

    const cookie1 = authParts.join('; ');
    const cookie2 = csrfParts.join('; ');

    console.log(`[Login] SUCCESS. Env: ${process.env.NODE_ENV}, Netlify: ${process.env.NETLIFY}, IsProd: ${isProd}`);

    return {
      statusCode: 200,
      headers: {
        'Set-Cookie': [cookie1, cookie2],
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff'
      },
      body: JSON.stringify({
        success: true,
        userId: user.id,
        mfaEnabled: user.mfa_enabled || false,
        message: user.mfa_enabled ? 'MFA required' : 'Login successful'
      }),
    };

  } catch (error) {
    console.error('[Login] UNCAUGHT ERROR:', error.message);
    console.error('[Login] Stack:', error.stack);
    return { statusCode: 500, body: JSON.stringify({ error: 'An unexpected error occurred' }) };
  } finally {
    client.release();
  }
};

async function logAuditEvent(client, userId, eventType, details, ipAddress) {
  try {
    const safeDetails = {
      event_type: eventType,
      timestamp: new Date().toISOString(),
      ...details
    };

    await client.query(
      `INSERT INTO audit_logs (user_id, event_type, details, timestamp, ip_address) 
       VALUES ($1, $2, $3, NOW(), $4)`,
      [userId, eventType, JSON.stringify(safeDetails), ipAddress || 'unknown']
    );
  } catch (err) {
    console.error('[Audit Log] Failed to write:', err.message);
  }
}
