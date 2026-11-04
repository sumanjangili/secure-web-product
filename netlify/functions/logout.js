// netlify/functions/logout.js

/**
 * Logout Handler
 *
 * Strategy:
 * 1. CSRF validation is NON-BLOCKING - user must always be able to logout
 * 2. Clear both auth_token and csrf_token immediately with proper attributes
 */

const { validateCsrf } = require('./_middleware/csrf-check');

// --- Allowed Origins Configuration ---
const ALLOWED_ORIGINS = [
  'https://app.indoscient.in',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
];

function getAllowedOrigin(requestedOrigin) {
  if (!requestedOrigin) return null;

  const normalized = requestedOrigin.toLowerCase();
  for (const origin of ALLOWED_ORIGINS) {
    if (normalized === origin.toLowerCase()) return origin;
  }

  // Localhost variants permitted only outside Netlify
  if (normalized.includes('localhost') && !process.env.NETLIFY) {
    return requestedOrigin;
  }

  return null;
}

/**
 * Single source of truth for production detection.
 * NETLIFY is the reliable signal at function runtime; NODE_ENV often is not set.
 */
function isProduction() {
  return process.env.NODE_ENV === 'production' || !!process.env.NETLIFY;
}

function jsonResponse(statusCode, data, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(data),
  };
}

/**
 * Builds Set-Cookie strings that delete a cookie.
 * 
 * With the /api/* proxy in netlify.toml, cookies are SAME-ORIGIN, so we DON'T
 * need the Domain attribute. This simplifies cookie deletion significantly.
 * 
 * @param {string} name      Cookie name
 * @param {boolean} httpOnly Whether the original cookie was HttpOnly
 */
function buildDeletionCookies(name, { httpOnly }) {
  const isProd = isProduction();

  // Build attributes as discrete entries so we never emit empty slots
  const attrs = [];

  if (httpOnly) attrs.push('HttpOnly');
  attrs.push('Path=/');
  attrs.push(`Expires=${new Date(0).toUTCString()}`);
  attrs.push('Max-Age=0');
  if (isProd) attrs.push('Secure');

  // Mirror SameSite mode from login (None in prod, Lax in dev)
  // Even though we're now same-origin via proxy, this maintains consistency
  attrs.push(`SameSite=${isProd ? 'None' : 'Lax'}`);

  // ADD Domain attribute to match login.js!
  if (isProd) {
    return [`${name}=; ${attrs.join('; ')}; Domain=.indoscient.in`];
  }
  return [`${name}=; ${attrs.join('; ')}`];
}

exports.handler = async (event) => {
  // 1. CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    const allowedOrigin = getAllowedOrigin(event.headers.origin);

    return jsonResponse(204, {}, {
      'Access-Control-Allow-Origin': allowedOrigin || '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Authorization',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    });
  }

  // 2. Method Check
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  // 3. CSRF Check — NON-BLOCKING (nuisance-class protection only)
  const csrfError = validateCsrf(event);
  if (csrfError) {
    console.warn('[Logout] CSRF validation failed; clearing cookies anyway.');
  }

  // 4. Build deletion cookies
  const deletions = [
    ...buildDeletionCookies('auth_token', { httpOnly: true }),
    ...buildDeletionCookies('csrf_token', { httpOnly: false }),
  ];

  // 5. Resolve origin
  const allowedOrigin = getAllowedOrigin(event.headers.origin);

  return jsonResponse(200, {
    success: true,
    message: 'Logged out successfully',
  }, {
    'Set-Cookie': deletions,
    'Access-Control-Allow-Origin': allowedOrigin || 'https://app.indoscient.in',
    'Access-Control-Allow-Credentials': 'true',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin',
  });
};
