/**
 * Netlify Function: audit‑log
 *
 * Receives a JSON payload describing a user event and writes it to a
 * simple log file (or forwards to a real logging service).
 *
 * Expected body:
 * {
 *   "event": "consent_given",
 *   "userId": "abc123",
 *   "timestamp": "2025-11-05T12:34:56Z",
 *   "details": { ... }
 * }
 */

const fs = require('fs');
const path = require('path');

// In production you would replace this with a DB or external log service.
const LOG_FILE = path.join(__dirname, 'audit.log');

exports.handler = async (event, context) => {
  // Simple secret check – set NETLIFY_AUDIT_SECRET in Netlify UI
  const secret = process.env.NETLIFY_AUDIT_SECRET;
  const provided = event.headers['x-audit-secret'] || event.headers['X-Audit-Secret'];

  if (!secret || secret !== provided) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Invalid secret' })
    };
  }

  try {
    const payload = JSON.parse(event.body);
    const line = `${new Date().toISOString()} ${JSON.stringify(payload)}\n`;
    fs.appendFileSync(LOG_FILE, line, 'utf8');

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };
  } catch (err) {
    console.error('Audit‑log error:', err);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Bad request' })
    };
  }
};
