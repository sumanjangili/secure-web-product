// frontend/src/lib/fetch-helper.ts

/**
 * Safely extracts a cookie value by name.
 * Uses split logic to avoid regex edge cases with special characters.
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  
  const cookieString = document.cookie;
  if (!cookieString) return null;

  // Split by '; ' to get individual cookies
  const cookies = cookieString.split('; ');
  
  for (const cookie of cookies) {
    // Check if this cookie starts with the name
    if (cookie.startsWith(`${name}=`)) {
      // Extract the value part
      const value = cookie.substring(name.length + 1);
      // Decode in case it was URL-encoded (e.g., spaces became %20)
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

interface SecureFetchOptions extends RequestInit {
  skipCsrf?: boolean;
}

/**
 * Wrapper for fetch that automatically handles:
 * 1. Credentials (include cookies)
 * 2. CSRF Token injection (Double-Submit pattern)
 * 3. Error parsing
 */
export async function secureFetchJson<T = any>(
  url: string,
  options: SecureFetchOptions = {}
): Promise<T> {
  const { skipCsrf = false, headers = {}, ...restOptions } = options;

  // 1. Prepare Headers
  const finalHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...headers,
  };

  // 2. Inject CSRF Token if not skipped
  if (!skipCsrf) {
    const csrfToken = getCookie('csrf_token');
    
    if (csrfToken) {
      // CRITICAL: Use the exact header name the backend expects
      // Backend middleware checks 'x-csrf-token' (lowercase)
      finalHeaders['X-CSRF-Token'] = csrfToken;
      console.debug('[SecureFetch] CSRF token injected:', csrfToken.substring(0, 8) + '...');
    } else {
      // Only warn if we are not on the login page (where CSRF might not be set yet)
      // But for MFA/Profile, this is critical.
      if (!url.includes('/login')) {
        console.warn('[SecureFetch] No CSRF token found in cookies for:', url);
      }
    }
  }

  // 3. Execute Request
  const response = await fetch(url, {
    ...restOptions,
    headers: finalHeaders,
    credentials: 'include', // CRITICAL: Sends cookies
  });

  // 4. Handle Errors
  if (!response.ok) {
    let errorData: any = { error: 'Unknown error' };
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: response.statusText };
    }

    const error: any = new Error(errorData.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.data = errorData;
    throw error;
  }

  // 5. Parse JSON
  try {
    return await response.json();
  } catch {
    throw new Error('Invalid JSON response');
  }
}
