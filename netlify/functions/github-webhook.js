// netlify/functions/github-webhook.js
const crypto = require('crypto');

exports.handler = async (event, context) => {
  // Verify the request method
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Optional: verify the HMAC signature
  const signature = event.headers['x-hub-signature-256'];
  const secret = process.env.GITHUB_WEBHOOK_SECRET; // set in Netlify UI
  const body = event.body; // raw JSON string

  if (secret && signature) {
    const hmac = crypto.createHmac('sha256', secret);
    const expected = 'sha256=' + hmac.update(body).digest('hex');
    if (signature !== expected) {
      return { statusCode: 401, body: 'Invalid signature' };
    }
  }

  // Parse the payload (GitHub sends JSON)
  const payload = JSON.parse(body);

  // Do whatever you need with the payload (log, store, trigger CI, etc.)
  console.log('Received GitHub Sponsors event:', payload);

  // Respond with 200 so GitHub knows it succeeded
  return { statusCode: 200, body: 'OK' };
};
