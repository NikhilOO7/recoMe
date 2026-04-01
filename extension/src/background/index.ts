import 'webextension-polyfill';
import { registerAlarms, handleAlarm } from './alarms';
import { handleMessage } from './messageHandler';
import { registerEventListeners } from './eventListeners';
import { getIntelligenceService } from '@intelligence/index';
import { createLogger } from '@shared/Logger';
import type { RecoMeMessage } from '@shared/messages';
import { safeStorageSyncGet, safeStorageSyncSet } from '@shared/storageSync';

const log = createLogger('Background');

// ── Storage Schema Versioning ────────────────────────────────────────────────
// Tracks the version of chrome.storage.local / chrome.storage.sync flags.
// IDB versioning is handled separately via DB_VERSION in constants.ts.
const STORAGE_SCHEMA_VERSION = 2;

/**
 * Run storage migrations when the extension updates and the schema version
 * has changed. Each migration is idempotent and runs exactly once.
 */
async function migrateStorageSchema(): Promise<void> {
  try {
    const result = await chrome.storage.local.get('recome_storage_version');
    const currentVersion = (result.recome_storage_version as number) ?? 0;

    if (currentVersion >= STORAGE_SCHEMA_VERSION) return;

    log.info(`Storage migration: v${currentVersion} → v${STORAGE_SCHEMA_VERSION}`);

    // Migration v0/v1 → v2: Ensure instagram is in platform settings
    if (currentVersion < 2) {
      const syncData = await safeStorageSyncGet('recome_settings');
      const settings = syncData.recome_settings as Record<string, unknown> | undefined;
      if (settings?.platforms) {
        const platforms = settings.platforms as Record<string, boolean>;
        if (platforms.instagram === undefined) {
          platforms.instagram = true;
          await safeStorageSyncSet({ recome_settings: settings });
          log.info('Migration v2: added instagram to platform settings');
        }
      }
    }

    // Stamp the new version
    await chrome.storage.local.set({
      recome_storage_version: STORAGE_SCHEMA_VERSION,
      recome_last_migration: new Date().toISOString(),
    });

    log.info('Storage migration complete');
  } catch (err) {
    log.error('Storage migration failed', err);
  }
}

// ── Service Worker Lifecycle ──────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  log.info(`Extension installed: reason=${details.reason}`);

  // Initialize intelligence service (seeds graph etc.)
  try {
    await getIntelligenceService().initialize();
    log.info('Intelligence service initialized on install');
  } catch (err) {
    log.error('Failed to initialize intelligence service', err);
  }

  // Register periodic alarms
  await registerAlarms();

  // Set default settings on fresh install
  if (details.reason === 'install') {
    await safeStorageSyncSet({
      recome_settings: {
        enabled: true,
        aggressiveness: 0.5,
        train_platform_algo: false,
        platforms: {
          youtube: true,
          amazon: true,
          twitter: true,
          facebook: true,
          instagram: true,
          ebay: true,
          walmart: true,
          linkedin: true,
        },
      },
    });
    // Version stamp for storage migration support
    await chrome.storage.local.set({
      recome_storage_version: STORAGE_SCHEMA_VERSION,
      recome_installed_at: new Date().toISOString(),
    });
    log.info('Default settings written');
  }

  // Storage migration on update
  if (details.reason === 'update') {
    await migrateStorageSchema();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  log.info('Browser started — reinitializing');
  try {
    // Reset init state in case IDB connections were terminated during SW sleep
    getIntelligenceService().resetInitState();
    await getIntelligenceService().initialize();
    // Re-register alarms (they may have been cleared)
    await registerAlarms();
  } catch (err) {
    log.error('Startup init failed', err);
  }
});

// ── Message Routing ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: RecoMeMessage, sender, sendResponse) => {
  return handleMessage(message, sender, sendResponse);
});

// ── Alarm Handling ────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(handleAlarm);

// ── EventBus Listeners ───────────────────────────────────────────────────────

registerEventListeners();

// ── Monitoring (QA Tool) ─────────────────────────────────────────────────────

import { registerMonitoring } from './monitoring/MonitoringCollector';
registerMonitoring();

// ── Keyboard Shortcuts ──────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  log.info(`Command received: ${command}`);

  if (command === 'quick_block') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'RECOME_QUICK_BLOCK' });
    }
  }

  if (command === 'toggle_overlay') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' }).catch(() => undefined);
    }
  }

  if (command === 'toggle_extension') {
    const result = await chrome.storage.local.get('recome_enabled');
    const newState = result.recome_enabled === false ? true : false;
    await chrome.storage.local.set({ recome_enabled: newState });

    if (newState) {
      chrome.action.setBadgeText({ text: '' });
    } else {
      chrome.action.setBadgeText({ text: 'OFF' });
      chrome.action.setBadgeBackgroundColor({ color: '#888888' });
    }
    log.info(`Extension toggled: enabled=${newState}`);
  }
});

log.info('Background service worker registered');
