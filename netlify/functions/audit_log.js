/**
 * Netlify Function: audit_log
 *
 * Receives a JSON payload describing a user event and writes it to a simple
 * log file (or forwards it to a real logging service).
 *
 * Expected body (example):
 * {
 *   "event": "consent_given",
 *   "userId": "abc123",
 *   "timestamp": "2025-11-05T12:34:56Z",
 *   "details": { ... }
 * }
 */

const fs   = require('fs');
const path = require('path');

/**
 * In production you would replace this with a DB or external log service.
 * For a quick demo we just append to a file inside the function bundle.
 */
const LOG_FILE = path.join(__dirname, 'audit.log');

/**
 * Netlify injects environment variables into `process.env` at runtime.
 * The secret must be defined in the Netlify UI (Site Settings → Build & Deploy →
 * Environment → Environment variables) as `AUDIT_SECRET`.
 */
exports.handler = async (event, _context) => {
  // -------------------------------------------------------------------------
  // 1️⃣  Secret validation
  // -------------------------------------------------------------------------
  const expectedSecret = process.env.AUDIT_SECRET;               // <- set in Netlify UI
  // Netlify normalises header names to lower‑case, but we accept both just in case
  const providedSecret = event.headers['x-audit-secret'] ||
                         event.headers['X-Audit-Secret'];

  if (!expectedSecret) {
    console.error('AUDIT_SECRET is not defined in the Netlify environment.');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server misconfiguration' })
    };
  }

  if (providedSecret !== expectedSecret) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Invalid secret' })
    };
  }

  // -------------------------------------------------------------------------
  // 2️⃣  Payload parsing & logging
  // -------------------------------------------------------------------------
  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    console.error('Failed to parse JSON payload:', e);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON body' })
    };
  }

  // Append a line to the log file: ISO‑timestamp + JSON payload
  const line = `${new Date().toISOString()} ${JSON.stringify(payload)}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (e) {
    console.error('Unable to write audit log file:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not write log' })
    };
  }

  // -------------------------------------------------------------------------
  // 3️⃣  Success response
  // -------------------------------------------------------------------------
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, message: 'Audit logged' })
  };
};
