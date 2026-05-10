// netlify/functions/_middleware/csrf-check.js

/**
 * Validates the Double-Submit Cookie pattern.
 * 
 * Requirements:
 * 1. Request must contain a cookie named 'csrf_token'
 * 2. Request must contain a header 'X-CSRF-Token' with the same value
 * 
 * @param {Object} event - The Netlify Function event object
 * @returns {Object|null} - Returns a 403 response object if invalid, null if valid
 */
const validateCsrf = (event) => {
  // 1. Get the CSRF token from the custom header (case-insensitive check)
  const headerToken = event.headers['x-csrf-token'] || event.headers['X-CSRF-Token'];
  
  // 2. Get the CSRF token from the non-HttpOnly cookie
  const cookieHeader = event.headers.cookie;
  
  if (!cookieHeader) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'CSRF validation failed: No cookies found' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  // Robust regex to handle "key=value" and "key=value; " (with space)
  const cookieMatch = cookieHeader.match(/(?:^|;\s*)csrf_token=([^;]*)/i);
  const cookieToken = cookieMatch ? cookieMatch[1] : null;

  if (!cookieToken) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'CSRF validation failed: csrf_token cookie missing' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  // 3. Validate presence of header
  if (!headerToken) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'CSRF validation failed: X-CSRF-Token header missing' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  // 4. Compare tokens strictly
  if (headerToken !== cookieToken) {
    console.warn(`[CSRF] Mismatch detected. Header: ${headerToken.substring(0, 8)}..., Cookie: ${cookieToken.substring(0, 8)}...`);
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'CSRF token mismatch' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  return null; // Valid
};

module.exports = { validateCsrf };
