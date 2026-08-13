/**
 * AuthClient — JWT access + refresh token storage with rotation.
 *
 * The browser does NOT manage credentials. Login happens on the web app
 * (recome.app/login), which postMessages the token pair back into the
 * extension via the callback flow (LOGIN_WITH_TOKEN message). This module
 * just persists, reads, refreshes, and clears those tokens.
 *
 * Token TTLs (mirror cloud/src/auth/TokenService.ts):
 *   - access  : 15min
 *   - refresh : 30d, rotated on use
 */

import { STORAGE_KEYS, getCloudUrl } from './constants';
import { createLogger } from './Logger';

const log = createLogger('AuthClient');

export interface AuthUser {
  id: string;
  email?: string;
}

export interface AuthState {
  loggedIn: boolean;
  user?: AuthUser;
}

let refreshInFlight: Promise<string | null> | null = null;

export async function storeTokens(
  accessToken: string,
  refreshToken: string,
  user?: AuthUser,
): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.access_token]: accessToken,
    [STORAGE_KEYS.refresh_token]: refreshToken,
    ...(user ? { [STORAGE_KEYS.user]: user } : {}),
  });
}

export async function clearTokens(): Promise<void> {
  await chrome.storage.local.remove([
    STORAGE_KEYS.access_token,
    STORAGE_KEYS.refresh_token,
    STORAGE_KEYS.user,
  ]);
}

export async function getAuthState(): Promise<AuthState> {
  const r = await chrome.storage.local.get([STORAGE_KEYS.access_token, STORAGE_KEYS.user]);
  const token = r[STORAGE_KEYS.access_token] as string | undefined;
  if (!token) return { loggedIn: false };
  return {
    loggedIn: true,
    user: r[STORAGE_KEYS.user] as AuthUser | undefined,
  };
}

export async function getAccessToken(): Promise<string | null> {
  const r = await chrome.storage.local.get(STORAGE_KEYS.access_token);
  return (r[STORAGE_KEYS.access_token] as string | undefined) ?? null;
}

async function getRefreshToken(): Promise<string | null> {
  const r = await chrome.storage.local.get(STORAGE_KEYS.refresh_token);
  return (r[STORAGE_KEYS.refresh_token] as string | undefined) ?? null;
}

/** True when a refresh token exists — i.e. the user has a session, even if
 *  the access token is momentarily unavailable. */
export async function hasRefreshToken(): Promise<boolean> {
  return (await getRefreshToken()) !== null;
}

/**
 * Refresh the access token using the stored refresh token. De-duped: if a
 * refresh is already in flight, callers share that single promise.
 * Returns the new access token, or null if refresh failed (caller should
 * surface "logged out" state).
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const refresh = await getRefreshToken();
      if (!refresh) return null;

      const base = await getCloudUrl();
      const res = await fetch(`${base}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });

      if (!res.ok) {
        log.warn(`refresh failed: ${res.status}`);
        // Only an explicit rejection of the refresh token means the session
        // is dead. Transient failures — cold-start 502/503 from scale-to-zero,
        // 429 from the API's own rate limiter, any 5xx — must NOT clear
        // tokens: that silently signed users out on server blips.
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          await clearTokens();
        }
        return null;
      }

      const body = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
        user?: AuthUser;
      };
      await storeTokens(body.accessToken, body.refreshToken, body.user);
      return body.accessToken;
    } catch (e) {
      log.error('refresh error', e);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}
