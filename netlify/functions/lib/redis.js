// netlify/functions/lib/redis.js
const { Redis } = require('@upstash/redis');

const restUrl = process.env.UPSTASH_REDIS_REST_URL;
const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;

let redisClient;

// 1. PRODUCTION MODE: Use Upstash HTTP Client
if (restUrl && restToken) {
  console.log('[Redis] Initializing Upstash Client (Production Mode)');
  
  redisClient = new Redis({
    url: restUrl,
    token: restToken,
    // Enable automatic retries for network blips
    enableAutoPipelining: false, 
  });

} 
// 2. LOCAL DEVELOPMENT MODE: Use Mock Client
else {
  console.warn('[Redis] Upstash credentials not found. Using MOCK Redis for local development.');
  console.warn('[Redis] Rate limiting and caching will be disabled/in-memory only.');

  // A simple in-memory mock that mimics the ioredis/upstash API
  const store = new Map();
  
  redisClient = {
    get: async (key) => store.get(key) || null,
    set: async (key, value) => { store.set(key, value); return 'OK'; },
    incr: async (key) => {
      const val = parseInt(store.get(key) || 0) + 1;
      store.set(key, val.toString());
      return val;
    },
    expire: async (key, seconds) => {
      // In a real mock, we'd set a timeout, but for simple local testing, 
      // we just ignore expiration or implement a simple TTL map if needed.
      // For now, just return 1 to satisfy the code flow.
      return 1; 
    },
    del: async (key) => {
      store.delete(key);
      return 1;
    },
    ttl: async (key) => {
      // Mock TTL returns -1 (no expiry) or a random number
      return -1; 
    },
    // Required for event listeners (even if dummy)
    on: (event, callback) => {}, 
    connect: async () => {},
    quit: async () => {}
  };
}

module.exports = redisClient;
