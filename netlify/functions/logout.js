// netlify/functions/logout.js

/**
 * Logout Handler
 * 
 * Strategy:
 * 1. Attempt CSRF validation (defense in depth).
 * 2. If CSRF fails, LOG WARNING but CONTINUE to clear cookies.
 *    (We must ensure the user can log out even if their session is corrupted).
 * 3. Clear both auth_token and csrf_token immediately.
 */
const { validateCsrf } = require('./_middleware/csrf-check');

exports.handler = async (event, context) => {
  // 1. Method Check
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // 2. CSRF Check (Non-blocking)
  const csrfError = validateCsrf(event);
  if (csrfError) {
    // Log the failure but DO NOT return the error.
    // We still want to clear the cookies to force a logout.
    console.warn('[Logout] CSRF validation failed, but proceeding to clear cookies.');
  }

  // 3. Clear Cookies
  const isProd = process.env.NODE_ENV === 'production';
  const secureFlag = isProd ? 'Secure' : '';
  const samesiteFlag = isProd ? 'Strict' : 'Lax'; // Match login
  const expires = new Date(0).toUTCString(); // Expire immediately (1970-01-01)

  return {
    statusCode: 200,
    headers: {
      'Set-Cookie': [
        // Clear Auth Token
        `auth_token=; HttpOnly; ${secureFlag}; SameSite=Strict; Path=/; Expires=${expires}; Max-Age=0`,
        // Clear CSRF Token
        `csrf_token=; ${secureFlag}; SameSite=Strict; Path=/; Expires=${expires}; Max-Age=0`
      ],
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Content-Type-Options': 'nosniff'
    },
    body: JSON.stringify({ success: true, message: 'Logged out successfully' })
  };
};
