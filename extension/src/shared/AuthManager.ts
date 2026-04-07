/**
 * AuthManager — centralized auth state for the extension.
 *
 * Architecture role: the extension is a lightweight execution layer.
 * Auth is managed by the web app; the extension stores tokens locally
 * and uses them for API calls and config sync.
 *
 * Token flow:
 *   1. User signs up/logs in on web app (recome-web.vercel.app)
 *   2. Web app redirects to chrome-extension://<id>/callback.html with tokens
 *   3. callback.html stores tokens in chrome.storage.local
 *   4. AuthManager reads tokens and exposes session state
 */

import { CLOUD_URL, WEB_APP_URL } from './constants';
import { createLogger } from './Logger';

const log = createLogger('AuthManager');

export interface UserProfile {
  email: string;
  displayName?: string;
  tier: string;
  avatarUrl?: string;
}

export interface AuthState {
  authenticated: boolean;
  profile: UserProfile | null;
  token: string | null;
}

const STORAGE_KEYS = {
  token: 'recome_cloud_access_token',
  refresh: 'recome_cloud_refresh_token',
  profile: 'recome_user_profile',
  authTimestamp: 'recome_auth_timestamp',
} as const;

/**
 * Get the current auth state from local storage.
 */
export async function getAuthState(): Promise<AuthState> {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.token, STORAGE_KEYS.profile]);

    const token = result[STORAGE_KEYS.token] as string | undefined;
    const profile = result[STORAGE_KEYS.profile] as UserProfile | undefined;

    if (!token) {
      return { authenticated: false, profile: null, token: null };
    }

    return {
      authenticated: true,
      profile: profile ?? null,
      token,
    };
  } catch {
    return { authenticated: false, profile: null, token: null };
  }
}

/**
 * Check if user is authenticated.
 */
export async function isAuthenticated(): Promise<boolean> {
  const state = await getAuthState();
  return state.authenticated;
}

/**
 * Get the stored access token (or null).
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.token);
    return (result[STORAGE_KEYS.token] as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * Clear all auth data (logout).
 */
export async function logout(): Promise<void> {
  await chrome.storage.local.remove([
    STORAGE_KEYS.token,
    STORAGE_KEYS.refresh,
    STORAGE_KEYS.profile,
    STORAGE_KEYS.authTimestamp,
  ]);
  log.info('User logged out');
}

/**
 * Open the web app login page in a new tab.
 */
export function openLogin(): void {
  const extId = chrome.runtime.id;
  chrome.tabs.create({
    url: `${WEB_APP_URL}/login?return=extension&ext_id=${extId}`,
  });
}

/**
 * Open the web app signup page in a new tab.
 */
export function openSignup(): void {
  const extId = chrome.runtime.id;
  chrome.tabs.create({
    url: `${WEB_APP_URL}/signup?return=extension&ext_id=${extId}`,
  });
}

/**
 * Open the web app settings page.
 */
export function openSettings(): void {
  chrome.tabs.create({ url: `${WEB_APP_URL}/settings` });
}

/**
 * Open the web app privacy report page.
 */
export function openPrivacy(): void {
  chrome.tabs.create({ url: `${WEB_APP_URL}/privacy` });
}

/**
 * Refresh user profile from the API.
 */
export async function refreshProfile(): Promise<UserProfile | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const res = await fetch(`${CLOUD_URL}/user/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if (res.status === 401) {
        // Token expired — clear auth
        await logout();
      }
      return null;
    }

    const data = await res.json();
    const profile: UserProfile = {
      email: data.email,
      displayName: data.displayName,
      tier: data.tier ?? 'FREE',
      avatarUrl: data.avatarUrl,
    };

    await chrome.storage.local.set({ [STORAGE_KEYS.profile]: profile });
    return profile;
  } catch (err) {
    log.warn('Profile refresh failed', err);
    return null;
  }
}
