// netlify/functions/github-webhook.js
const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod === 'GET') {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const signature = event.headers['x-hub-signature-256'];

  let bodyString = event.body;
  if (typeof bodyString !== 'string') {
    bodyString = JSON.stringify(bodyString);
  }

  // --- Fail-Closed Signature Verification ---
  // FIX: previously, a request with NO signature header while a secret was
  // configured fell through both branches and was processed unsigned.
  if (!secret) {
    console.error('[GitHubWebhook] CRITICAL: GITHUB_WEBHOOK_SECRET is not set.');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  if (!signature) {
    console.warn('[GitHubWebhook] Missing signature header — rejecting.');
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  try {
    const hmac = crypto.createHmac('sha256', secret);
    const computed = Buffer.from('sha256=' + hmac.update(bodyString).digest('hex'), 'utf8');
    const received = Buffer.from(signature, 'utf8');

    // FIX: timing-safe comparison replaces plain string equality
    const lengthsDiffer = computed.length !== received.length;
    const valid = !lengthsDiffer && crypto.timingSafeEqual(computed, received);

    if (!valid) {
      console.warn('[GitHubWebhook] Invalid signature detected.');
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid request' }) };
    }
  } catch (err) {
    console.error('[GitHubWebhook] Signature verification error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }

  // --- Parse Payload Safely ---
  let payload;
  try {
    payload = JSON.parse(bodyString);
  } catch (e) {
    console.warn('[GitHubWebhook] Malformed JSON payload received.');
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  const eventType = payload.action || payload.event || 'unknown';
  console.info(`[GitHubWebhook] Received event: ${eventType} at ${new Date().toISOString()}`);

  // TODO: business logic — sanitize anything extracted from payload
  return { statusCode: 200, body: 'OK' };
};
