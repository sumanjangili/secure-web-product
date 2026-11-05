// netlify/functions/_middleware/require-mfa.js
const jwt = require('jsonwebtoken');

function jsonError(statusCode, message, extra = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private'
    },
    body: JSON.stringify({ error: message, ...extra })
  };
}

/**
 * Single source of truth for JWT extraction/verification.
 */
function verifyToken(event) {
  try {
    const cookies = event.headers.cookie;
    if (!cookies) {
      return { error: jsonError(401, 'Authentication required. No session cookie found.') };
    }

    const cookiePairs = cookies.split(';');
    const authTokenPair = cookiePairs.find(pair => pair.trim().startsWith('auth_token='));

    if (!authTokenPair) {
      return { error: jsonError(401, 'Authentication required. Session cookie missing.') };
    }

    const token = authTokenPair.split('=')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return { decoded };
  } catch (jwtErr) {
    console.error('[RequireMFA] JWT Verification Failed:', jwtErr.message);
    return {
      error: jsonError(
        401,
        jwtErr.name === 'TokenExpiredError'
          ? 'Session expired. Please log in again.'
          : 'Invalid session'
      )
    };
  }
}

/**
 * STRICT gate: token MUST carry mfaVerified: true.
 * Use for: admin operations, or anything ONLY reachable post-MFA-verification.
 * NEVER use on enrollment paths or endpoints that must serve non-MFA users.
 */
function requireMFA(event) {
  const { decoded, error } = verifyToken(event);
  if (error) return error;

  if (decoded.mfaVerified !== true) {
    return jsonError(403, 'Multi-factor authentication verification required.', { requiresMFA: true });
  }

  event.decoded = decoded;
  event.userId = decoded.userId;
  return null;
}

/**
 * CONDITIONAL gate (MFA is OPTIONAL in this product):
 * Denies ONLY users who have MFA ENABLED but whose current token lacks
 * mfaVerified (i.e., they skipped the MFA step at login). Users who never
 * enrolled pass normally — this preserves access for the non-MFA population.
 *
 * @param {Object}  event      Netlify function event
 * @param {boolean} mfaEnabled The user's mfa_enabled flag (fetch it from the
 *                             user row you already queried)
 */
function requireMFAIfEnrolled(event, mfaEnabled) {
  const { decoded, error } = verifyToken(event);
  if (error) return error;

  if (mfaEnabled === true && decoded.mfaVerified !== true) {
    return jsonError(403, 'Multi-factor authentication verification required.', { requiresMFA: true });
  }

  event.decoded = decoded;
  event.userId = decoded.userId;
  return null;
}

module.exports = { requireMFA, requireMFAIfEnrolled };
