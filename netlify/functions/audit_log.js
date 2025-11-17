/**
 * Netlify Function: audit_log
 *
 * Receives a JSON payload describing a user event and writes it to a
 * temporary log file (or forwards it to a real logging service).
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
const os   = require('os');

/**
 * Netlify injects environment variables into `process.env` at runtime.
 * Define the secret in the Netlify UI (Site Settings → Build & Deploy →
 * Environment → Environment variables) as `AUDIT_SECRET`.
 */
exports.handler = async (event, _context) => {
  // --------------------------------------------------------------
  // 1️⃣ Secret validation
  // --------------------------------------------------------------
  const expectedSecret = process.env.AUDIT_SECRET;
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

  // --------------------------------------------------------------
  // 2️⃣ Payload parsing
  // --------------------------------------------------------------
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

  // --------------------------------------------------------------
  // 3️⃣ Write to a **writable** location
  // --------------------------------------------------------------
  // Netlify guarantees that the directory returned by os.tmpdir()
  // (or the $TMPDIR env var) is writable for the lifetime of the
  // function invocation. We'll create a file called `audit.log`
  // inside that temp directory.
  const tmpDir   = os.tmpdir();                // e.g. /tmp
  const LOG_FILE = path.join(tmpDir, 'audit.log');

  const line = `${new Date().toISOString()} ${JSON.stringify(payload)}\n`;

  try {
    // Use the async API – Netlify will wait for the promise to settle.
    await fs.promises.appendFile(LOG_FILE, line, 'utf8');
  } catch (e) {
    console.error('Unable to write audit log file:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not write log' })
    };
  }

  // --------------------------------------------------------------
  // 4️⃣ Success response
  // --------------------------------------------------------------
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      message: 'Audit logged',
      // optional: echo the temporary file location for debugging
      // (remove in production!)
      logPath: LOG_FILE
    })
  };
};
