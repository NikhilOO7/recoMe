import 'webextension-polyfill';
import { registerAlarms, handleAlarm } from './alarms';
import { handleMessage } from './messageHandler';
import { registerEventListeners } from './eventListeners';
import { getIntelligenceService } from '@intelligence/index';
import { createLogger } from '@shared/Logger';
import type { RecoMeMessage } from '@shared/messages';

const log = createLogger('Background');

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
  registerAlarms();

  // Set default settings on fresh install
  if (details.reason === 'install') {
    await chrome.storage.sync.set({
      recome_settings: {
        enabled: true,
        aggressiveness: 0.5,
        platforms: {
          youtube: true,
          amazon: true,
          twitter: true,
          facebook: true,
          ebay: true,
          walmart: true,
        },
      },
    });
    log.info('Default settings written');
  }
});

chrome.runtime.onStartup.addListener(async () => {
  log.info('Browser started — reinitializing');
  try {
    // Reset init state in case IDB connections were terminated during SW sleep
    getIntelligenceService().resetInitState();
    await getIntelligenceService().initialize();
    // Re-register alarms (they may have been cleared)
    registerAlarms();
  } catch (err) {
    log.error('Startup init failed', err);
  }
});

// ── Message Routing ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: RecoMeMessage, sender, sendResponse) => {
    return handleMessage(message, sender, sendResponse);
  },
);

// ── Alarm Handling ────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(handleAlarm);

// ── EventBus Listeners ───────────────────────────────────────────────────────

registerEventListeners();

log.info('Background service worker registered');
