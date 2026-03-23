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
        train_platform_algo: false,
        platforms: {
          youtube: true,
          amazon: true,
          twitter: true,
          facebook: true,
          ebay: true,
          walmart: true,
          linkedin: true,
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
