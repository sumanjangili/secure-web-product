// frontend/src/lib/fetch-helper.ts

export const getCsrfToken = (): string | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  return match ? match[1] : null;
};

// Base fetch function that adds CSRF token and credentials
export const secureFetch = async (
  url: string, 
  options: RequestInit = {}
): Promise<Response> => {
  const csrfToken = getCsrfToken();
  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (csrfToken) {
    baseHeaders['X-CSRF-Token'] = csrfToken;
  }
  const finalOptions: RequestInit = {
    ...options,
    headers: baseHeaders,
    credentials: 'include',
  };
  try {
    const response = await fetch(url, finalOptions);
    return response;
  } catch (error) {
    console.error(`Network error fetching ${url}:`, error);
    throw error;
  }
};

// Typed JSON wrapper that parses responses and handles errors
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
