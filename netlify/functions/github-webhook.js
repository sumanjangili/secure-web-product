// netlify/functions/github-webhook.js
const crypto = require('crypto');

exports.handler = async (event, context) => {
  // Verify the request method
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const signature = event.headers['x-hub-signature-256'] || event.headers['X-Hub-Signature-256'];
  
  // Ensure body is a string for HMAC calculation
  // Netlify may parse body as an object if Content-Type is application/json
  let bodyString = event.body;
  if (typeof bodyString !== 'string') {
    bodyString = JSON.stringify(bodyString);
  }

  // --- Signature Verification ---
  if (secret && signature) {
    try {
      const hmac = crypto.createHmac('sha256', secret);
      const expected = 'sha256=' + hmac.update(bodyString).digest('hex');
      
      // Use timing-safe comparison if possible, though string comparison is often acceptable for webhooks
      // Here we use simple equality, but ensure we don't log the signature
      if (signature !== expected) {
        console.warn('[GitHubWebhook] Invalid signature detected.');
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid request' }) };
      }
    } catch (err) {
      console.error('[GitHubWebhook] Signature verification error:', err.message);
      return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
  } else if (!secret) {
    // Fail-safe: If no secret is configured, reject the request to prevent unauthenticated access
    console.error('[GitHubWebhook] CRITICAL: GITHUB_WEBHOOK_SECRET is not set.');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  // --- Parse Payload Safely ---
  let payload;
  try {
    payload = JSON.parse(bodyString);
  } catch (e) {
    console.warn('[GitHubWebhook] Malformed JSON payload received.');
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  // --- Process Payload ---
  // ⚠️ SECURITY: Do NOT log the full payload.
  // Only log safe metadata (e.g., event type) if debugging is required.
  const eventType = payload.action || payload.event || 'unknown';
  console.info(`[GitHubWebhook] Received event: ${eventType} at ${new Date().toISOString()}`);

  // TODO: Implement your business logic here (e.g., trigger CI, update DB)
  // Ensure any data extracted from 'payload' is sanitized before being used elsewhere.

  // Respond with 200 so GitHub knows it succeeded
  return { statusCode: 200, body: 'OK' };
};
