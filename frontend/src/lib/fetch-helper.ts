// frontend/src/lib/fetch-helper.ts

/**
 * Safely extracts a cookie value by name.
 * Uses split logic to avoid regex edge cases with special characters.
 * Includes debug logging to trace cookie transmission issues.
 */
function getCookie(name: string): string | null {
  // Safety check: Must run in browser environment
  if (typeof document === 'undefined') {
    console.warn('[Cookie Debug] Not running in browser environment (document undefined)');
    return null;
  }
  
  const cookieString = document.cookie;
  
  // Debug: Show all available cookies (truncated for readability)
  console.log(`[Cookie Debug] All cookies: ${cookieString ? cookieString.substring(0, 200) + (cookieString.length > 200 ? '...' : '') : '(empty)'}`);
  console.log(`[Cookie Debug] Looking for cookie: "${name}"`);
  
  if (!cookieString) {
    console.log(`[Cookie Debug] document.cookie is empty - returning null`);
    return null;
  }

  // Split by ';' to handle both '; ' and ';' (browser variations)
  const cookies = cookieString.split(';');
  console.log(`[Cookie Debug] Parsed ${cookies.length} cookie(s)`);
  
  for (let i = 0; i < cookies.length; i++) {
    const cookie = cookies[i];
    const trimmed = cookie.trim();
    
    console.log(`[Cookie Debug] Checking cookie[${i}]: "${trimmed.substring(0, 50)}${trimmed.length > 50 ? '...' : ''}"`);
    
    if (trimmed.startsWith(`${name}=`)) {
      const value = trimmed.substring(name.length + 1);
      console.log(`[Cookie Debug] Found ${name} = "${value.substring(0, 30)}${value.length > 30 ? '...' : ''}"`);
      
      try {
        const decoded = decodeURIComponent(value);
        console.log(`[Cookie Debug] Successfully decoded ${name}: "${decoded.substring(0, 30)}${decoded.length > 30 ? '...' : ''}"`);
        return decoded;
      } catch (decodeError) {
        console.log(`[Cookie Debug] Decoding failed for ${name}, returning raw value`);
        console.log(`[Cookie Debug] Raw value: "${value.substring(0, 30)}${value.length > 30 ? '...' : ''}"`);
        return value;
      }
    }
  }
  
  // Cookie not found - this is expected on login page (no csrf yet)
  console.log(`[Cookie Debug] ${name} NOT FOUND in cookies`);
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
 * 
 * DEBUG: Enables extensive logging when SECURE_FETCH_DEBUG env var is true
 */
export async function secureFetchJson<T = any>(
  url: string,
  options: SecureFetchOptions = {}
): Promise<T> {
  const { skipCsrf = false, headers = {}, ...restOptions } = options;

  // Enable debug mode via environment variable (set in .env.local or build)
  const isDebugEnabled = import.meta.env?.VITE_SECURE_FETCH_DEBUG === 'true';
  if (isDebugEnabled) {
    console.log('[SecureFetch] DEBUG MODE ENABLED');
    console.log('[SecureFetch] URL:', url);
    console.log('[SecureFetch] Method:', restOptions.method || 'GET');
  }

  // 1. Prepare Headers - Use Record<string, string> to allow dynamic property assignment
  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  // 2. Inject CSRF Token if not skipped
  if (!skipCsrf) {
    const csrfToken = getCookie('csrf_token');
    
    if (csrfToken) {
      // CRITICAL: Use the exact header name the backend expects
      // Backend middleware checks 'x-csrf-token' (lowercase)
      finalHeaders['X-CSRF-Token'] = csrfToken;
      console.debug('[SecureFetch] CSRF token injected:', `${csrfToken.substring(0, 8)}...`);
      
      if (isDebugEnabled) {
        console.log('[SecureFetch] Headers after CSRF injection:', finalHeaders);
      }
    } else {
      // Only warn if we are not on the login page (where CSRF might not be set yet)
      // Login is the first step - no csrf_token exists yet
      if (!url.includes('/login')) {
        console.warn('[SecureFetch] No CSRF token found in cookies for:', url);
        console.warn('[SecureFetch] This may indicate:');
        console.warn('[SecureFetch]  1. Not logged in yet (auth_token cookie missing)');
        console.warn('[SecureFetch]  2. CSRF cookie blocked by SameSite/Secure settings');
        console.warn('[SecureFetch]  3. Frontend domain mismatch with cookie domain');
        
        // Optional: Trigger debug info dump
        if (isDebugEnabled) {
          console.log('[SecureFetch] Document cookie full content:', document.cookie);
        }
      }
    }
  }

  // 3. Execute Request
  if (isDebugEnabled) {
    console.log('[SecureFetch] Final request config:', {
      url,
      method: restOptions.method || 'GET',
      headers: finalHeaders,
      credentials: 'include'
    });
  }

  const response = await fetch(url, {
    ...restOptions,
    headers: finalHeaders,
    credentials: 'include', // CRITICAL: Sends cookies with cross-origin requests
  });

  // Debug: Show response details
  if (isDebugEnabled) {
    console.log('[SecureFetch] Response status:', response.status);
    console.log('[SecureFetch] Response headers:', [...response.headers.entries()]);
  }

  // 4. Handle Errors
  if (!response.ok) {
    let errorData: any = { error: 'Unknown error' };
    const errorStatus = response.status;
    
    try {
      const errorText = await response.text();
      console.error('[SecureFetch] Raw error response:', errorText.substring(0, 500));
      
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || response.statusText };
      }
    } catch {
      errorData = { error: response.statusText };
    }

    const error: any = new Error(errorData.error || `HTTP ${errorStatus}`);
    error.status = errorStatus;
    error.data = errorData;
    
    console.error('[SecureFetch] Error thrown:', {
      message: error.message,
      status: error.status,
      data: errorData
    });
    
    throw error;
  }

  // 5. Parse JSON
  try {
    const responseData = await response.json();
    if (isDebugEnabled) {
      console.log('[SecureFetch] Response parsed successfully');
    }
    return responseData;
  } catch (parseError) {
    console.error('[SecureFetch] Failed to parse JSON response:', parseError);
    throw new Error('Invalid JSON response');
  }
}

// ===========================================
// UTILITY: Force reload page to reset session
// Useful when CSRF/auth token issues occur
// ===========================================
export function resetSessionAndReload(): void {
  console.log('[FetchHelper] Resetting session and reloading...');
  // Optional: Clear cookies before reload
  document.cookie.split(';').forEach(cookie => {
    const cookieName = cookie.split('=')[0].trim();
    document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
  window.location.reload();
}
