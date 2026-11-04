// netlify/functions/_middleware/csrf-check.js

/**
 * Validates the Double-Submit Cookie pattern.
 * 
 * Security Properties:
 * 1. Case-insensitive cookie/header comparison (Netlify normalizes headers to lowercase)
 * 2. Robust cookie parsing (handles both '; ' and ';' delimiters)
 * 3. Timing-safe comparison to prevent side-channel attacks
 * 4. Token format validation (must be valid hex)
 * 5. Comprehensive logging for security monitoring
 */

const TOKEN_REGEX = /^[a-fA-F0-9]{32,64}$/; // Expect 32-64 char hex strings

/**
 * Parses cookies from the raw Cookie header.
 * Handles browser variations in delimiter format (';' vs '; ').
 * 
 * @param {string} cookieHeader - Raw Cookie header value
 * @returns {Map<string, string>} Map of cookie name to value
 */
function parseCookies(cookieHeader) {
  const cookies = new Map();
  
  if (!cookieHeader) {
    return cookies;
  }

  // Split by ';' or '; ' - handles all browser variations
  const pairs = cookieHeader.split(/;\s*/);
  
  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    
    const name = trimmed.substring(0, eqIndex);
    const value = trimmed.substring(eqIndex + 1);
    
    // Decode URI-encoded values
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      // If decoding fails, use raw value
      cookies.set(name, value);
    }
  }
  
  return cookies;
}

/**
 * Timing-safe string comparison to prevent side-channel attacks.
 * Compares all characters regardless of where mismatch occurs.
 * 
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} True if strings are equal
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  
  // Length mismatch is immediately detectable
  if (a.length !== b.length) {
    return false;
  }
  
  // Compare byte-by-byte to prevent early-exit timing attacks
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Validates CSRF token using the Double-Submit Cookie pattern.
 * 
 * Requirements:
 * - csrf_token cookie must exist
 * - X-CSRF-Token header must exist (case-insensitive)
 * - Both tokens must match exactly
 * 
 * @param {Object} event - Netlify function event object
 * @returns {Object|null} Error response object if validation fails, null if valid
 */
const validateCsrf = (event) => {
  const cookieHeader = event.headers.cookie;
  
  if (!cookieHeader) {
    console.warn('[CSRF] Validation failed: No cookies in request');
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'CSRF validation failed: No cookies found' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  // Parse cookies manually to handle all delimiter variations
  const cookies = parseCookies(cookieHeader);
  const cookieToken = cookies.get('csrf_token');

  if (!cookieToken) {
    console.warn('[CSRF] Validation failed: csrf_token cookie missing');
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'CSRF validation failed: csrf_token cookie missing' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  // Netlify normalizes all header names to lowercase
  const headerToken = event.headers['x-csrf-token'];

  if (!headerToken) {
    console.warn('[CSRF] Validation failed: X-CSRF-Token header missing');
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'CSRF validation failed: X-CSRF-Token header missing' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  // Decode header token (may be URL-encoded)
  let decodedHeaderToken;
  try {
    decodedHeaderToken = decodeURIComponent(headerToken);
  } catch {
    console.warn('[CSRF] Validation failed: Header token decoding error');
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'CSRF validation failed: Invalid token encoding' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  // Optional: Validate token format (should be hex, reasonable length)
  // This helps detect corrupted or malicious tokens early
  if (!TOKEN_REGEX.test(decodedHeaderToken)) {
    console.warn('[CSRF] Validation failed: Token format invalid');
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'CSRF validation failed: Invalid token format' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  // Timing-safe comparison to prevent side-channel attacks
  if (!timingSafeEqual(decodedHeaderToken, cookieToken)) {
    // Log first 8 chars for debugging (never log full tokens!)
    console.warn(
      `[CSRF] Mismatch detected for tokens starting with:`,
      `"${cookieToken.substring(0, 8)}..." vs "${decodedHeaderToken.substring(0, 8)}..."`
    );
    
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'CSRF token mismatch' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  // Success - optionally log for audit trail
  console.debug('[CSRF] Validation successful');
  
  return null; // Valid
};

/**
 * Optional: Validate CSRF without failing (for defensive logging).
 * Use this for read-only endpoints that don't require CSRF but should
 * still track validation status for monitoring.
 * 
 * @param {Object} event - Netlify function event object
 * @returns {boolean} True if CSRF token valid, false otherwise
 */
const validateCsrfNonBlocking = (event) => {
  const result = validateCsrf(event);
  return result === null;
};

module.exports = { 
  validateCsrf, 
  validateCsrfNonBlocking,
  parseCookies,           // Exported for testing purposes
  timingSafeEqual         // Exported for testing purposes
};
