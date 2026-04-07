/**
 * Web app auth helper — handles token storage and auto-refresh.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://recome-api.fly.dev';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('recome_token');
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('recome_refresh');
}

export function clearTokens(): void {
  localStorage.removeItem('recome_token');
  localStorage.removeItem('recome_refresh');
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem('recome_token', access);
  localStorage.setItem('recome_refresh', refresh);
}

/**
 * Fetch with auto-refresh: if the access token is expired (401),
 * try refreshing it using the refresh token, then retry the original request.
 */
export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);

  let res = await fetch(`${API_URL}${path}`, { ...options, headers });

  // If 401, try refreshing the token
  if (res.status === 401) {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearTokens();
      throw new Error('Session expired');
    }

    const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!refreshRes.ok) {
      clearTokens();
      throw new Error('Session expired');
    }

    const refreshData = await refreshRes.json();
    setTokens(refreshData.accessToken, refreshData.refreshToken);

    // Retry original request with new token
    headers.set('Authorization', `Bearer ${refreshData.accessToken}`);
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  }

  return res;
}
