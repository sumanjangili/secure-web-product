// frontend/src/lib/fetch-helper.ts

/**
 * Extracts the CSRF token from the non-HttpOnly 'csrf_token' cookie.
 * 
 * This cookie must be set by the backend with:
 * - SameSite=Strict (or Lax)
 * - Secure (in production)
 * - NOT HttpOnly (so JS can read it)
 */
export const getCsrfToken = (): string | null => {
  if (typeof document === 'undefined') return null; // SSR safety

  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : null;
};

/**
 * Standardized fetch wrapper with automatic CSRF protection.
 * 
 * Features:
 * 1. Automatically attaches 'X-CSRF-Token' header if a token exists.
 * 2. Enforces 'credentials: include' to send/receive cookies.
 * 3. Merges custom headers safely.
 * 4. Defaults Content-Type to JSON (can be overridden).
 * 
 * @param url - The endpoint URL
 * @param options - Standard fetch options (method, body, headers, etc.)
 * @returns Promise<Response>
 */
export const secureFetch = async (
  url: string, 
  options: RequestInit = {}
): Promise<Response> => {
  const csrfToken = getCsrfToken();

  // Prepare headers
  const baseHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  // Inject CSRF token if available
  // Note: We cast to 'any' temporarily to allow dynamic key assignment, 
  // but the resulting object is compatible with HeadersInit.
  if (csrfToken) {
    (baseHeaders as Record<string, string>)['X-CSRF-Token'] = csrfToken;
  }

  // Merge options
  const finalOptions: RequestInit = {
    ...options,
    headers: baseHeaders,
    credentials: 'include', // ✅ CRITICAL: Ensures cookies are sent and received
  };

  try {
    const response = await fetch(url, finalOptions);
    return response;
  } catch (error) {
    // Network errors (e.g., offline) are thrown here
    console.error(`Network error fetching ${url}:`, error);
    throw error;
  }
};

/**
 * Convenience wrapper for JSON responses that automatically parses the body.
 * Throws an error if the response is not OK (4xx/5xx).
 */
export const secureFetchJson = async <T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> => {
  const response = await secureFetch(url, options);

  if (!response.ok) {
    let errorData: any = { error: 'Unknown error' };
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: response.statusText };
    }
    
    const error = new Error(errorData.error || `HTTP ${response.status}`);
    (error as any).status = response.status;
    (error as any).data = errorData;
    throw error;
  }

  return response.json();
};
