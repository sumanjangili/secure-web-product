// netlify/functions/_middleware/csrf-check.js

/**
 * Validates the Double-Submit Cookie pattern.
 * Robustly handles case-insensitivity and cookie parsing.
 */
const validateCsrf = (event) => {
  // 1. Get the CSRF token from the cookie
  const cookieHeader = event.headers.cookie;
  
  if (!cookieHeader) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'CSRF validation failed: No cookies found' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  // Parse cookies manually to handle spaces and special chars reliably
  const cookies = cookieHeader.split('; ');
  let cookieToken = null;

  for (const cookie of cookies) {
    if (cookie.startsWith('csrf_token=')) {
      const value = cookie.substring('csrf_token='.length);
      try {
        cookieToken = decodeURIComponent(value);
      } catch {
        cookieToken = value;
      }
      break;
    }
  }

  if (!cookieToken) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'CSRF validation failed: csrf_token cookie missing' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  // 2. Get the CSRF token from the header
  // Netlify normalizes all header names to lowercase
  const headerToken = event.headers['x-csrf-token'];

  if (!headerToken) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'CSRF validation failed: X-CSRF-Token header missing' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  // 3. Compare tokens
  // Decode header token just in case
  let decodedHeaderToken;
  try {
    decodedHeaderToken = decodeURIComponent(headerToken);
  } catch {
    decodedHeaderToken = headerToken;
  }

  if (decodedHeaderToken !== cookieToken) {
    console.warn(`[CSRF] Mismatch detected.`);
    console.warn(`  Header: ${decodedHeaderToken.substring(0, 10)}...`);
    console.warn(`  Cookie: ${cookieToken.substring(0, 10)}...`);
    
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'CSRF token mismatch' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  return null; // Valid
};

module.exports = { validateCsrf };
