// netlify/functions/lib/db.js
const { Pool } = require('pg');

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('FATAL: DATABASE_URL environment variable is missing.');
}

const isProd = process.env.NODE_ENV === 'production' || !!process.env.NETLIFY;

let pool;
if (dbUrl) {
  // Cache on globalThis so dev hot-reload / bundler re-evaluation doesn't
  // spawn duplicate pools, and so ALL function files in the same warm
  // Lambda container share one physical connection pool.
  if (!globalThis.__secureProductPool) {
    globalThis.__secureProductPool = new Pool({
      connectionString: dbUrl,
      ssl: isProd ? { rejectUnauthorized: false } : false,
      // Cloud Postgres cold-resume can take ~10s (measured: psql connect = 9.2s).
      // 8s keeps connect + one query inside the 10s function race with headroom.
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 300_000, // 5 min — keep warm connections alive
      max: 5,
    });

    globalThis.__secureProductPool.on('error', (err) => {
      console.error('[DB] Idle client error:', err.message);
    });

    // DEV-ONLY keep-alive: ping every 60s so a suspended cloud Postgres
    // compute resumes once at startup instead of on the user's first login.
    // MUST live inside this block — outside it, every module re-evaluation
    // (hot reload, per-function bundling) would stack duplicate intervals.
    // Immediate first ping: resume the suspended compute NOW, at server
    // startup, instead of paying the ~9s cold connect on the first login.
    globalThis.__secureProductPool.query('SELECT 1').catch(() => {});

    if (!isProd && process.env.NETLIFY_DEV_KEEPALIVE !== 'false') {
      setInterval(() => {
        globalThis.__secureProductPool.query('SELECT 1').catch(() => {});
      }, 60_000).unref();
    }

    console.log('[DB] Shared pool created.');
  }
  pool = globalThis.__secureProductPool;
}

module.exports = { pool };
