import 'webextension-polyfill';
import { handleMessage } from './messageHandler';
import { registerSignalUploader, handleAlarm as handleSignalAlarm } from './SignalUploader';
import { registerInboxPoller, handleAlarm as handleInboxAlarm } from './InboxPoller';
import { getWebAppUrl, STORAGE_KEYS, DEFAULT_SETTINGS } from '@shared/constants';
import { getAuthState } from '@shared/AuthClient';
import type { RecoMeMessage, MessageResponse } from '@shared/messages';
import { createLogger } from '@shared/Logger';

const log = createLogger('Background');

// ── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  log.info(`installed: reason=${details.reason}`);

  if (details.reason === 'install') {
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
  }

  // On update from v1.x → v2.x, wipe legacy keys. Login is required after upgrade.
  if (details.reason === 'update') {
    await chrome.storage.local.remove([
      'recome_api_keys_encrypted',
      'recome_encryption_salt',
      'recome_brain_state',
      'recome_stats',
      'recome_storage_version',
      'recome_cloud_access_token',
      'recome_first_action_done',
    ]);
  }

  await registerSignalUploader();
  await registerInboxPoller();
});

chrome.runtime.onStartup.addListener(async () => {
  log.info('startup');
  await registerSignalUploader();
  await registerInboxPoller();
});

// ── Message routing ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: RecoMeMessage, sender, sendResponse: (r: MessageResponse) => void) =>
    handleMessage(message, sender, sendResponse),
);

// ── Alarms ───────────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  handleSignalAlarm(alarm.name);
  handleInboxAlarm(alarm.name);
});

// ── Keyboard shortcuts ───────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle_overlay') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' });
      }
    } catch (e) {
      log.warn('toggle_overlay failed', e);
    }
    return;
  }

  if (command === 'toggle_extension') {
    const r = await chrome.storage.local.get(STORAGE_KEYS.settings);
    const cur = (r[STORAGE_KEYS.settings] as { enabled?: boolean }) ?? DEFAULT_SETTINGS;
    const next = { ...cur, enabled: !cur.enabled };
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: next });
    await chrome.action.setBadgeText({ text: next.enabled ? '' : 'OFF' });
    await chrome.action.setBadgeBackgroundColor({ color: '#888888' });
  }
});

// ── Action button — open web app or popup ───────────────────────────────────

chrome.action.onClicked.addListener(async () => {
  const base = await getWebAppUrl();
  const auth = await getAuthState();
  // Signed out → the extension sign-in handoff (login page forwards tokens
  // to callback.html, including for already-signed-in web sessions).
  // Signed in → straight to the dashboard.
  const url = auth.loggedIn
    ? `${base}/dashboard`
    : `${base}/login?return=extension&ext_id=${chrome.runtime.id}`;
  await chrome.tabs.create({ url });
});

log.info('background service worker registered');
