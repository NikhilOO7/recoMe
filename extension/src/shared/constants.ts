/**
 * Cloud + web URLs. Override locally by setting in chrome.storage.local:
 *   chrome.storage.local.set({ recome_cloud_url: 'http://localhost:8080' })
 */
export const CLOUD_URL_DEFAULT = 'https://api.recome.app';
export const WEB_APP_URL_DEFAULT = 'https://recome.app';

export async function getCloudUrl(): Promise<string> {
  const r = await chrome.storage.local.get('recome_cloud_url');
  return (r['recome_cloud_url'] as string | undefined) ?? CLOUD_URL_DEFAULT;
}

export async function getWebAppUrl(): Promise<string> {
  const r = await chrome.storage.local.get('recome_web_app_url');
  return (r['recome_web_app_url'] as string | undefined) ?? WEB_APP_URL_DEFAULT;
}

// IDB
export const DB_NAME = 'recome_db';
export const DB_VERSION = 3; // bumped from 2 — old object stores wiped on upgrade

// Alarms (only two now — capture upload + inbox poll)
export const ALARM_NAMES = {
  signal_flush: 'recome_signal_flush',
  inbox_poll: 'recome_inbox_poll',
} as const;

export const ALARM_INTERVALS_MIN = {
  signal_flush: 0.5, // 30s
  inbox_poll: 2,
} as const;

// chrome.storage.local keys we own
export const STORAGE_KEYS = {
  access_token: 'recome_access_token',
  refresh_token: 'recome_refresh_token',
  user: 'recome_user',
  settings: 'recome_settings',
  inbox_cursor: 'recome_inbox_cursor',
  inbox_cache: 'recome_inbox_cache',
  theme: 'recome_theme',
  cloud_url: 'recome_cloud_url',
  web_app_url: 'recome_web_app_url',
  // Onboarding flags — set once, persisted to suppress repeat first-run UI.
  welcome_popup_dismissed: 'recome_welcome_popup_dismissed',
  welcome_card_shown: 'recome_welcome_card_shown',
} as const;

// Default user settings (written on install)
export const DEFAULT_SETTINGS = {
  enabled: true,
  platforms: {
    youtube: true,
    amazon: true,
    reddit: true,
    twitter: true,
    facebook: false,
    instagram: false,
    ebay: true,
    walmart: true,
    linkedin: true,
    tiktok: false,
    indeed: true,
    glassdoor: true,
    udemy: true,
    coursera: true,
    edx: true,
  },
} as const;
