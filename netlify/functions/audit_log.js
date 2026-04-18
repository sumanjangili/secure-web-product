// netlify/functions/audit_log.js

// Netlify injects env vars prefixed with `NETLIFY_` automatically.
// You can also define a custom variable in Site Settings → Build & deploy → Environment.
const EXPECTED_SECRET = process.env.AUDIT_SECRET;

// Security Check: Fail immediately if the secret is not configured
if (!EXPECTED_SECRET) {
  console.error('[AuditLog] CRITICAL: AUDIT_SECRET environment variable is not set.');
  // Return 500 to indicate server misconfiguration, not a client error
  exports.handler = async () => ({
    statusCode: 500,
    body: JSON.stringify({ error: 'Server configuration error' })
  });
  return;
}

exports.handler = async (event, context) => {
  // -------------------------------------------------
  // Enforce POST
  // -------------------------------------------------
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // -------------------------------------------------
  // Validate the secret header (Case-insensitive check)
  // -------------------------------------------------
  // Normalize header keys to lowercase to prevent bypass via casing
  const headers = Object.keys(event.headers).reduce((acc, key) => {
    acc[key.toLowerCase()] = event.headers[key];
    return acc;
  }, {});

  const providedSecret = headers['x-audit-secret'];
  
  if (!providedSecret || providedSecret !== EXPECTED_SECRET) {
    // Do NOT reveal which part failed – just a generic unauthorized response
    // Log the attempt without revealing the secret or the provided value
    console.warn('[AuditLog] Unauthorized access attempt detected.');
    return { statusCode: 401, body: 'Unauthorized' };
  }

  // -------------------------------------------------
  // Parse JSON payload safely
  // -------------------------------------------------
  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    console.warn('[AuditLog] Invalid JSON payload received.');
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // -------------------------------------------------
  // Your audit‑logging logic
  // -------------------------------------------------
  // ⚠️ SECURITY: Do NOT log the payload content.
  // Only log metadata (timestamp, event type if safe, or a hash) if debugging is needed.
  // Example of safe logging:
  console.info(`[AuditLog] Event processed successfully at ${new Date().toISOString()}.`);
  
  // ...insert whatever persistence you need here (DB, KV, etc)...
  // Ensure your database logic also sanitizes data before writing.

  // -------------------------------------------------
  // Success response
  // -------------------------------------------------
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ received: true })
  };
};
