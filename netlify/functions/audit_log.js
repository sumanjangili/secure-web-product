// netlify/functions/audit_log.js

// Netlify injects env vars prefixed with `NETLIFY_` automatically.
// You can also define a custom variable in Site Settings → Build & deploy → Environment.
const EXPECTED_SECRET = process.env.AUDIT_SECRET;   // e.g. set to "supsecret"

exports.handler = async (event, context) => {
  // -------------------------------------------------
  // Enforce POST
  // -------------------------------------------------
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // -------------------------------------------------
  // Validate the secret header
  // -------------------------------------------------
  const providedSecret = event.headers['x-audit-secret'] || event.headers['X-Audit-Secret'];
  if (!providedSecret || providedSecret !== EXPECTED_SECRET) {
    // Do NOT reveal which part failed – just a generic unauthorized response
    return { statusCode: 401, body: 'Unauthorized' };
  }

  // -------------------------------------------------
  // Parse JSON payload safely
  // -------------------------------------------------
  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // -------------------------------------------------
  // Your audit‑logging logic (e.g. write to a DB, Cloudflare KV, etc.)
  // -------------------------------------------------
  console.log('✅ Authenticated audit event:', payload);
  // …insert whatever persistence you need here…

  // -------------------------------------------------
  // Success response
  // -------------------------------------------------
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ received: true })
  };
};
