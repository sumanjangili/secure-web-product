// netlify/functions/lib/redis.js
const { Redis } = require('@upstash/redis');

// --- Configuration ---
const restUrl = process.env.UPSTASH_REDIS_REST_URL;
const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;

/**
 * Production detection. NETLIFY is the reliable signal at function runtime;
 * NODE_ENV is frequently unset. Kept identical to the other handlers.
 */
function isProduction() {
  return process.env.NODE_ENV === 'production' || !!process.env.NETLIFY;
}

/**
 * Escape hatch for staging environments that legitimately run without Redis.
 * Without this, the production guard below would block such deploys.
 */
const ALLOW_MOCK_IN_PROD = process.env.ALLOW_MOCK_REDIS === 'true';

const hasCredentials = Boolean(restUrl && restToken);

// --- Fail-fast guard -------------------------------------------------------
// A missing credential must never silently degrade into "no rate limiting".
// Failing open on a brute-force control is a security regression, so we abort
// module load instead. This surfaces at deploy time rather than at 3am.
if (!hasCredentials && isProduction() && !ALLOW_MOCK_IN_PROD) {
  throw new Error(
    '[Redis] FATAL: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set ' +
    'in a production environment. Refusing to start with a non-functional rate ' +
    'limiter. Set the credentials, or set ALLOW_MOCK_REDIS=true to override ' +
    'deliberately (staging only).'
  );
}

const isMockMode = !hasCredentials;

// --- Lua: atomic fixed-window rate limiter ---------------------------------
// INCR is atomic; EXPIRE is applied only when the counter is created, so the
// window is not extended by subsequent attempts. Executed server-side as one
// atomic step (Upstash serialises EVAL), which closes the get/incr race.
const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

// --- Client construction ---------------------------------------------------
let redisClient;

if (hasCredentials) {
  try {
    redisClient = new Redis({
      url: restUrl,
      token: restToken,

      // Verified option (npm docs). Opt out of anonymous SDK telemetry —
      // appropriate for a security-oriented product.
      enableTelemetry: false,

      // NOTE: `enableAutoPipelining` and the `retry` object below were NOT
      // verifiable against current SDK docs. They are omitted deliberately
      // rather than carried forward unexamined. If you want retry behaviour,
      // confirm the option name against the installed @upstash/redis version
      // first — passing an unrecognised key is silently ignored, which is how
      // this kind of config rots unnoticed.
    });

    console.log('[Redis] Upstash client initialised.');
  } catch (err) {
    console.error('[Redis] Failed to initialise Upstash client:', err.message);

    // In production, a client that cannot be constructed is fatal.
    if (isProduction() && !ALLOW_MOCK_IN_PROD) {
      throw new Error(`[Redis] FATAL: client initialisation failed: ${err.message}`);
    }

    console.warn('[Redis] Falling back to mock client (non-production).');
    redisClient = createMockRedis();
  }
} else {
  console.warn(
    '[Redis] Upstash credentials absent. Using in-memory mock.\n' +
    '[Redis] Rate limits are per-process, non-persistent, and reset on cold start.\n' +
    '[Redis] This is acceptable for local development ONLY.'
  );
  redisClient = createMockRedis();
}

// --- Mock implementation ---------------------------------------------------
/**
 * Minimal in-memory stand-in for the Upstash client, for local development.
 *
 * Deliberate design choices:
 * - Unknown commands THROW. Returning invented values hides integration bugs
 *   and lets a broken limiter pass tests.
 * - Falsy-but-valid values (0, "", false) are preserved, matching Redis
 *   semantics where "0" is a stored value, not an absence.
 */
function createMockRedis() {
  /** @type {Map<string, string>} */
  const store = new Map();
  /** @type {Map<string, number>} epoch ms at which the key expires */
  const expiries = new Map();

  function isExpired(key) {
    const exp = expiries.get(key);
    return exp !== undefined && Date.now() > exp;
  }

  function reap(key) {
    if (isExpired(key)) {
      store.delete(key);
      expiries.delete(key);
      return true;
    }
    return false;
  }

  function currentTtl(key) {
    if (!store.has(key)) return -2;            // key does not exist
    if (!expiries.has(key)) return -1;         // exists, no expiry
    const remaining = Math.ceil((expiries.get(key) - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  return {
    async get(key) {
      if (reap(key)) return null;
      // Preserve stored falsy values; only a genuine miss yields null.
      return store.has(key) ? store.get(key) : null;
    },

    async set(key, value, options) {
      store.set(key, String(value));

      // Honour the { ex } form if a caller passes it, mirroring Redis SET EX.
      const ex = options && typeof options === 'object' ? options.ex : undefined;
      if (typeof ex === 'number' && ex > 0) {
        expiries.set(key, Date.now() + ex * 1000);
      } else {
        expiries.delete(key);
      }
      return 'OK';
    },

    async incr(key) {
      reap(key);
      const raw = store.has(key) ? store.get(key) : '0';
      const current = Number.parseInt(raw, 10);

      if (Number.isNaN(current)) {
        // Redis raises an error on INCR against a non-integer value.
        throw new Error('ERR value is not an integer or out of range');
      }

      const next = current + 1;
      store.set(key, String(next));
      // TTL is intentionally preserved, matching real Redis INCR behaviour.
      return next;
    },

    async expire(key, seconds) {
      if (!store.has(key)) return 0;
      expiries.set(key, Date.now() + seconds * 1000);
      return 1;
    },

    async del(key) {
      const existed = store.delete(key);
      expiries.delete(key);
      return existed ? 1 : 0;
    },

    async ttl(key) {
      reap(key);
      return currentTtl(key);
    },

    /**
     * Pipelines are supported for batching, but note that Upstash pipelines
     * are NOT atomic — commands from other clients may interleave. Use
     * checkRateLimit()/eval() where atomicity is required.
     */
    pipeline() {
      const commands = [];
      const api = {
        set: (k, v) => (commands.push(['set', k, v]), api),
        get: (k) => (commands.push(['get', k]), api),
        incr: (k) => (commands.push(['incr', k]), api),
        expire: (k, s) => (commands.push(['expire', k, s]), api),
        del: (k) => (commands.push(['del', k]), api),
        ttl: (k) => (commands.push(['ttl', k]), api),
        async exec() {
          const results = [];
          for (const [cmd, ...args] of commands) {
            switch (cmd) {
              case 'set': results.push(await this._self.set(args[0], args[1])); break;
              case 'get': results.push(await this._self.get(args[0])); break;
              case 'incr': results.push(await this._self.incr(args[0])); break;
              case 'expire': results.push(await this._self.expire(args[0], args[1])); break;
              case 'del': results.push(await this._self.del(args[0])); break;
              case 'ttl': results.push(await this._self.ttl(args[0])); break;
              default: throw new Error(`[Mock Redis] Unsupported pipeline command: ${cmd}`);
            }
          }
          return results;
        },
      };
      api._self = this;
      return api;
    },

    /**
     * Lua is not interpreted in the mock. Throwing is intentional: a mock that
     * fabricates a return value would let a broken atomic operation ship.
     * checkRateLimit() below branches around this for local development.
     */
    async eval() {
      throw new Error(
        '[Mock Redis] eval() is not implemented. Use checkRateLimit() for rate ' +
        'limiting, or run against a real Upstash instance to exercise Lua paths.'
      );
    },

    async ping() {
      return 'PONG';
    },

    // Compatibility stubs for ioredis-style call sites.
    on() {},
    async connect() {},
    async quit() {},

    /** Test helper — not part of the Redis API. */
    _clear() {
      store.clear();
      expiries.clear();
    },
  };
}

// --- Shared helpers --------------------------------------------------------

/**
 * Atomic fixed-window rate limit check.
 *
 * Replaces the get -> compare -> incr sequence used across the handlers, which
 * is racy: concurrent requests all observe the same counter and all increment,
 * so a burst of parallel guesses consumes a single attempt.
 *
 * @param {string} key             Redis key (already namespaced by caller)
 * @param {number} maxAttempts     Attempts permitted within the window
 * @param {number} windowSeconds   Window length in seconds
 * @returns {Promise<{allowed: boolean, count: number, ttl: number}>}
 */
async function checkRateLimit(key, maxAttempts, windowSeconds) {
  let count;

  if (isMockMode) {
    // In-process equivalent. Single-threaded JS makes this atomic within one
    // invocation; it is NOT shared across concurrent containers, which is
    // precisely why mock mode is unsuitable for production.
    count = await redisClient.incr(key);
    if (count === 1) {
      await redisClient.expire(key, windowSeconds);
    }
  } else {
    const raw = await redisClient.eval(RATE_LIMIT_SCRIPT, [key], [String(windowSeconds)]);
    count = Number(raw);
  }

  const allowed = count <= maxAttempts;
  const ttl = allowed ? windowSeconds : await redisClient.ttl(key).catch(() => windowSeconds);

  return { allowed, count, ttl: ttl > 0 ? ttl : windowSeconds };
}

/** Clears a rate-limit counter, e.g. after a successful login. */
async function resetRateLimit(key) {
  try {
    await redisClient.del(key);
  } catch (err) {
    console.warn('[Redis] resetRateLimit failed (non-fatal):', err.message);
  }
}

// --- Exports ---------------------------------------------------------------
// The client is exported directly to preserve existing call sites
// (`const redis = require('./lib/redis')` then `redis.get(...)`).
// Helpers are attached alongside it — non-breaking; typed via HybridRedis.

/** @typedef {import('@upstash/redis').Redis & {
 *   isMockMode: boolean,
 *   checkRateLimit: (key: string, maxAttempts: number, windowSeconds: number) =>
 *     Promise<{ allowed: boolean, count: number, ttl: number }>,
 *   resetRateLimit: (key: string) => Promise<void>,
 *   RATE_LIMIT_SCRIPT: string
 * }} HybridRedis */

const hybridClient = /** @type {HybridRedis} */ (redisClient);

hybridClient.isMockMode = isMockMode;
hybridClient.checkRateLimit = checkRateLimit;
hybridClient.resetRateLimit = resetRateLimit;
hybridClient.RATE_LIMIT_SCRIPT = RATE_LIMIT_SCRIPT;

module.exports = hybridClient;
