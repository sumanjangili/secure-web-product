// frontend/src/lib/fetch-helper.ts

/**
 * SecureFetch Library
 * 
 * Handles authentication, CSRF, rate-limit awareness, and structured error handling
 * for all API communication with the backend.
 * 
 * Architecture Decision:
 * - Proxy all /api/* requests through netlify.toml redirects
 * - This makes cookies first-party (SameSite=Lax, no domain juggling)
 * - Eliminates third-party cookie restrictions (Safari ITP, Firefox partitioning)
 */

// --- Configuration ---
// Centralized API base URL - update ONE place for all environment changes
const API_BASE = import.meta.env?.VITE_API_BASE_URL ?? '/api';

// Network timeout (milliseconds) - prevents indefinite hangs
const DEFAULT_TIMEOUT_MS = 30_000;

// Max retries for transient errors (network glitches, 5xx)
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

// --- Debug Mode Control ---
/**
 * Debug mode is controlled by environment variables ONLY.
 * NEVER enable in production builds - logs sensitive auth data.
 */
const DEBUG_MODE = import.meta.env?.DEV === true || 
                   import.meta.env?.VITE_SECURE_FETCH_DEBUG === 'true';

function debug(...args: unknown[]) {
  if (DEBUG_MODE) {
    console.log('[SecureFetch]', ...args);
  }
}

function warn(...args: unknown[]) {
  console.warn('[SecureFetch]', ...args);
}

// --- Cookie Utilities ---

/**
 * Extracts a cookie value by name from document.cookie.
 * Uses character-based parsing (more reliable than regex).
 * 
 * @param name - Cookie name to search for
 * @returns Decoded cookie value, or null if not found
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined' || !document.cookie) {
    return null;
  }

  // Split by ';' delimiter (handles both '; ' and ';' variations)
  const cookies = document.cookie.split(';');
  
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    
    if (trimmed.startsWith(`${name}=`)) {
      const value = trimmed.substring(name.length + 1);
      
      try {
        return decodeURIComponent(value);
      } catch {
        // If decoding fails, return raw value
        return value;
      }
    }
  }
  
  return null;
}

/**
 * Checks if a cookie is present (used for auth state detection).
 * 
 * @returns true if user appears to be authenticated
 */
export function isAuthenticated(): boolean {
  // Only check auth_token visibility - csrf_token presence implies auth too
  return getCookie('auth_token') !== null;
}

// --- Rate Limit Detection ---

/**
 * Extracts Retry-After header value if present.
 * Can be seconds (integer) or HTTP-date (RFC 7231).
 * 
 * @param response - Fetch Response object
 * @returns Seconds to wait, or null if no Retry-After header
 */
function getRetryAfterSeconds(response: Response): number | null {
  const header = response.headers.get('Retry-After');
  if (!header) return null;
  
  // Try integer (seconds) first
  const seconds = parseInt(header, 10);
  if (!Number.isNaN(seconds)) {
    return seconds;
  }
  
  // RFC 7231 HTTP-date format (e.g., "Wed, 21 Oct 2015 07:28:00 GMT")
  const date = new Date(header);
  if (!Number.isNaN(date.getTime())) {
    const diffMs = date.getTime() - Date.now();
    return Math.max(1, Math.ceil(diffMs / 1000));
  }
  
  return null;
}

// --- Request Building ---

/**
 * Security context tracking for diagnostics.
 * Tracks whether we're in same-origin (proxy) mode vs cross-origin mode.
 */
const IS_SAME_ORIGIN = !API_BASE.startsWith('http');

/**
 * Prepares headers with CSRF token injection.
 * 
 * @param skipCsrf - Whether to skip CSRF validation (GET, initial login)
 * @param customHeaders - Additional headers to merge in
 * @returns Complete headers object
 */
function buildHeaders(
  skipCsrf: boolean,
  customHeaders?: Record<string, string>
): Record<string, string> {
  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders || {}),
  };

  if (!skipCsrf && IS_SAME_ORIGIN) {
    const csrfToken = getCookie('csrf_token');
    
    if (csrfToken) {
      // Backend expects lowercase header name (Netlify normalizes headers)
      finalHeaders['X-CSRF-Token'] = csrfToken;
      debug(`CSRF token injected (${csrfToken.substring(0, 8)}...)`);
    } else {
      // Warn only in development for non-login requests
      if (DEBUG_MODE) {
        warn('No CSRF token found - ensure endpoint allows CSRF bypass or user is not logged in');
      }
    }
  }

  return finalHeaders;
}

// --- Timeout Wrapper ---

/**
 * Wraps a promise with a timeout. Rejects if the operation takes too long.
 * 
 * @param promise - The operation to wrap
 * @param timeoutMs - Milliseconds before timeout
 * @param message - Custom timeout error message
 * @returns Original promise result, or timeout rejection
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout>;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

// --- Core Fetch Function ---

interface SecureFetchOptions extends RequestInit {
  /** Skip CSRF token injection (GET, initial login, webhooks) */
  skipCsrf?: boolean;
  /** Whether to retry on transient errors (default: true) */
  retryOnTransientError?: boolean;
  /** Override default timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Main secure fetch wrapper. Handles:
 * 1. CSRF token injection
 * 2. Credentials (cookies)
 * 3. Timeout protection
 * 4. Structured error responses
 * 5. Optional retry for transient errors
 * 
 * @param url - Relative path (will be prefixed with API_BASE) or absolute URL
 * @param options - Fetch options with secureFetch extensions
 * @returns Parsed JSON response
 * @throws ApiError with status code and error details
 */
export async function secureFetchJson<T = unknown>(
  url: string,
  options: SecureFetchOptions = {}
): Promise<T> {
  const {
    skipCsrf = false,
    retryOnTransientError = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headers = {},
    ...restOptions
  } = options;

  // Clean URL construction (legacy shim removed in Phase 2)
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}/${url.replace(/^\/+/, '')}`;
  const method = (restOptions.method || 'GET').toUpperCase();

  debug(`Request: ${method} ${fullUrl}`);

  // Build complete request config
  const requestConfig: RequestInit = {
    ...restOptions,
    headers: buildHeaders(skipCsrf, headers as Record<string, string>),
    credentials: 'include', // Essential for cookie-based auth
  };

  // Retry logic for transient failures
  let lastError: unknown = null;
  let attempts = 0;

  while (attempts <= MAX_RETRIES) {
    try {
      attempts++;
      
      debug(`Attempt ${attempts}/${MAX_RETRIES + 1}`);
      
      const response = await withTimeout(
        fetch(fullUrl, requestConfig),
        timeoutMs,
        `Request timed out after ${timeoutMs}ms`
      );

      // Handle auth/CSRF failures specially
      if ((response.status === 401 || response.status === 403) && retryOnTransientError) {
        const isCsrfFailure = response.status === 403;
        const retryAfter = getRetryAfterSeconds(response);

        warn(
          isCsrfFailure
            ? 'CSRF validation failed - token may be stale or blocked'
            : 'Authentication failed - session may be expired'
        );

        if (retryAfter) {
          debug(`Retry-After suggests waiting ${retryAfter}s before retrying`);
        }

        throw await buildApiError(response, {
          hint: isCsrfFailure
            ? 'Refresh the page to obtain a new CSRF token.'
            : 'Please log in again.',
          recoverable: true,
          retryAfter,
        });
      }

      // Success path
      if (!response.ok) {
        throw await buildApiError(response);
      }

      const responseData = (await response.json()) as T;
      debug('Response parsed successfully');
      return responseData;

    } catch (err) {
      lastError = err;
      
      // 401/403 are auth/CSRF failures — retrying cannot succeed and burns
      // rate-limit budget (e.g., a wrong password counts 3× against lockout)
      if (
        err instanceof ApiError &&
        (err.status === 400 || err.status === 401 || err.status === 403 ||
         err.status === 404 || err.status === 429)
      ) {
        debug('Skipping retry for client error:', err.status);
        break;
      }
      // Check if we should retry
      if (attempts <= MAX_RETRIES && retryOnTransientError) {
        debug('Retrying due to transient error...');
        await sleep(RETRY_DELAY_MS * attempts); // Exponential backoff
        continue;
      }

      // Out of retries or non-retryable error
      break;
    }
  }

  // All attempts exhausted
  if (lastError instanceof Error) {
    throw lastError;
  }
  
  throw new ApiError('Unknown error occurred', 0, { cause: lastError });
}

/** Sleep utility for retry delays */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Structured Error Types ---

/**
 * Structured API error carrying HTTP status and server-provided details.
 * Extends Error so it works with standard try/catch and instanceof checks.
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly data: Record<string, unknown>;
  public readonly recoverable: boolean;
  public readonly retryAfter?: number; // Seconds to wait before retry

  constructor(
    message: string,
    status: number,
    data: Record<string, unknown> = {},
    options: { recoverable?: boolean; retryAfter?: number } = {}
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.recoverable = options.recoverable ?? false;
    this.retryAfter = options.retryAfter;

    // Maintains proper prototype chain when targeting ES5
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

// --- Error Message Extraction ---

/**
 * Safely extracts a human-readable message from an ApiError data payload.
 *
 * Why this exists: `err.data.error` is typed `unknown` (ApiError.data is
 * Record<string, unknown>), so passing it straight to setError(string | null)
 * or template literals fails type-checking. `String(msg)` is wrong — it turns
 * `undefined` into the truthy string "undefined". This guard keeps the fix
 * type-safe AND runtime-safe, in one place, forever.
 *
 * @param data - The `data` property of an ApiError (shape unknown)
 * @param fallback - Message to use if no usable string is present
 * @returns Extracted error message, or the fallback
 */
export function getErrorMessage(data: unknown, fallback = ''): string {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const err = (data as { error?: unknown }).error;
    if (typeof err === 'string' && err) return err;
  }
  return fallback;
}

/**
 * Reads the response body and constructs a structured ApiError.
 * Handles non-JSON bodies gracefully.
 */
async function buildApiError(
  response: Response,
  extras: Record<string, unknown> = {}
): Promise<ApiError> {
  let errorData: Record<string, unknown> = { error: 'Unknown error' };
  const status = response.status;

  try {
    const errorText = await response.text();

    if (errorText) {
      try {
        const parsed = JSON.parse(errorText);
        errorData =
          parsed && typeof parsed === 'object'
            ? (parsed as Record<string, unknown>)
            : { error: String(parsed) };
      } catch {
        // Not JSON - likely an HTML error page or plain text
        errorData = { error: errorText.slice(0, 300) || response.statusText };
      }
    } else {
      errorData = { error: response.statusText || `HTTP ${status}` };
    }
  } catch {
    errorData = { error: response.statusText || `HTTP ${status}` };
  }

  const message = typeof errorData.error === 'string' ? errorData.error : `HTTP ${status}`;

  debug(`Request failed [${status}]:`, message);

  return new ApiError(message, status, { ...errorData, ...extras });
}

// --- Convenience Helpers ---

/**
 * GET request wrapper. CSRF is skipped by default for read-only operations.
 */
export function apiGet<T = unknown>(
  url: string,
  options?: Omit<SecureFetchOptions, 'skipCsrf'>
): Promise<T> {
  return secureFetchJson<T>(url, { method: 'GET', skipCsrf: true, ...options });
}

/**
 * POST request wrapper. CSRF is enabled by default for state-changing operations.
 */
export function apiPost<T = unknown>(
  url: string,
  body?: unknown,
  options?: Omit<SecureFetchOptions, 'skipCsrf' | 'body'>
): Promise<T> {
  return secureFetchJson<T>(url, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
    skipCsrf: false,
    ...options,
  });
}

/**
 * PUT request wrapper. CSRF is enabled by default.
 */
export function apiPut<T = unknown>(
  url: string,
  body?: unknown,
  options?: Omit<SecureFetchOptions, 'skipCsrf' | 'body'>
): Promise<T> {
  return secureFetchJson<T>(url, {
    method: 'PUT',
    body: body !== undefined ? JSON.stringify(body) : undefined,
    skipCsrf: false,
    ...options,
  });
}

/**
 * DELETE request wrapper. CSRF is enabled by default.
 */
export function apiDelete<T = unknown>(
  url: string,
  options?: Omit<SecureFetchOptions, 'skipCsrf'>
): Promise<T> {
  return secureFetchJson<T>(url, { method: 'DELETE', skipCsrf: false, ...options });
}

// --- Session Management ---

/**
 * Clears visible cookies (csrf_token) and reloads the page.
 * 
 * IMPORTANT: HttpOnly cookies (auth_token) CANNOT be cleared from JavaScript.
 * They must be cleared by the server via Set-Cookie with an expired date.
 * This means a proper logout requires calling the backend logout endpoint.
 */
export function resetSessionAndReload(): void {
  debug('Resetting session...');

  // Clear all visible cookies
  document.cookie.split(';').forEach((cookie) => {
    const cookieName = cookie.split('=')[0].trim();
    if (!cookieName) return;

    // Clear for current path
    document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;

    // Also attempt to clear for parent domain (if applicable)
    const hostParts = window.location.hostname.split('.');
    if (hostParts.length > 1) {
      const parentDomain = `.${hostParts.slice(-2).join('.')}`;
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${parentDomain}`;
    }
  });

  window.location.reload();
}

/**
 * Proper logout: calls backend to clear HttpOnly cookies, then redirects.
 * Falls back to client-side reset if the call fails.
 */
export async function logout(logoutEndpoint: string = '/logout'): Promise<void> {
  try {
    await secureFetchJson(logoutEndpoint, { method: 'POST' });
    // Wait for Set-Cookie to process
    await new Promise(r => setTimeout(r, 500));
  } catch (err) {
    warn('Server logout failed, falling back to client reset:', err);
  } finally {
    resetSessionAndReload();
  }
}

/**
 * Checks authentication status without making a network request.
 * Note: This is a local-only check - session could have expired server-side.
 */
export function checkAuthStatus(): { isAuthenticated: boolean; reason?: string } {
  const authToken = getCookie('auth_token');
  const csrfToken = getCookie('csrf_token');

  if (!authToken) {
    return { isAuthenticated: false, reason: 'No auth_token cookie found' };
  }

  // Basic JWT structure check (header.payload.signature)
  const jwtParts = authToken.split('.');
  if (jwtParts.length !== 3) {
    return { isAuthenticated: false, reason: 'Invalid JWT structure' };
  }

  // Decode JWT payload to check expiration (client-side best effort)
  try {
    const payloadBase64 = jwtParts[1];
    // JWT is base64url (RFC 7515); atob needs standard base64 with padding
    const b64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payloadJson = atob(padded);
    const payload = JSON.parse(payloadJson);

    // Check exp claim if present (Unix timestamp)
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return { isAuthenticated: false, reason: 'JWT has expired' };
    }
  } catch {
    // If JWT decoding fails, still report as authenticated
    // (server will reject invalid tokens on next request)
    debug('Warning: Could not decode JWT payload');
  }

  if (!csrfToken) {
    warn('auth_token exists but csrf_token is missing - possible session corruption');
  }

  return { isAuthenticated: true };
}

// --- Health Check ---

/**
 * Ping endpoint health without authentication.
 * Useful for checking if backend is reachable.
 */
export async function pingHealth(): Promise<boolean> {
  try {
    await fetch(`${API_BASE}/health`, {
      method: 'GET',
      credentials: 'omit', // No auth needed for health check
    });
    return true;
  } catch {
    return false;
  }
}

// --- Export Main Entry Point ---
export default secureFetchJson;
