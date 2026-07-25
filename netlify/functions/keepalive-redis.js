const redis = require('./lib/redis');

// Runs every 3 days at 00:00 UTC — well within Upstash's 14-day inactivity window
// Adjust the cron as needed: every 5 days = "0 0 */5 * *"
exports.schedule = "0 0 */3 * *";

exports.handler = async (event, context) => {
  const startedAt = Date.now();

  try {
    // Attempt a ping; fall back to a simple get/set if ping is unavailable
    let result;
    if (typeof redis.ping === 'function') {
      result = await redis.ping();
    } else {
      // Fallback: write a heartbeat key with a short TTL
      const now = new Date().toISOString();
      await redis.set('keepalive:last_ping', now);
      await redis.expire('keepalive:last_ping', 300); // 5-min TTL — auto-cleanup
      result = await redis.get('keepalive:last_ping');
    }

    console.log(`[KeepAlive] ✅ Redis ping successful. Response: ${result}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: 'ok',
        timestamp: startedAt,
        response: String(result),
        latencyMs: Date.now() - startedAt,
      }),
    };
  } catch (err) {
    console.error(`[KeepAlive] ❌ Redis ping failed: ${err.message}`);

    return {
      statusCode: 500,
      body: JSON.stringify({
        status: 'error',
        error: err.message,
        timestamp: startedAt,
      }),
    };
  }
};

