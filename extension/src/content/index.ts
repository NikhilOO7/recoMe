import '../styles/content.css';
import 'webextension-polyfill';
import { detectPlatform, initAdapter } from './observer';
import { YouTubeAdapter } from './adapters/YouTubeAdapter';
import { AmazonAdapter } from './adapters/AmazonAdapter';
import { TwitterAdapter } from './adapters/TwitterAdapter';
import { FacebookAdapter } from './adapters/FacebookAdapter';
import { InstagramAdapter } from './adapters/InstagramAdapter';
import { EbayAdapter } from './adapters/EbayAdapter';
import { WalmartAdapter } from './adapters/WalmartAdapter';
import { GenericAdapter } from './adapters/GenericAdapter';
import { createProactiveDwellTracker } from './DwellTracker';
import { createLogger } from '@shared/Logger';
import { showToast } from './ui/Toast';
import { showConfetti } from './ui/Confetti';
import type { BaseAdapter } from './adapters/BaseAdapter';
import type { Platform } from '@shared/types';

const log = createLogger('Content');

// ── Chat / messaging domains where RecoMe should never run ──────────────────
const CHAT_ONLY_DOMAINS = [
  'web.whatsapp.com',
  'web.telegram.org',
  'discord.com',
  'slack.com',
  'app.slack.com',
  'teams.microsoft.com',
  'meet.google.com',
  'zoom.us',
  'app.zoom.us',
  'mail.google.com',
  'outlook.live.com',
  'outlook.office.com',
  'messenger.com',
  'chat.google.com',
  'signal.group',
  'element.io',
  'app.element.io',
];

function isChatOnlySite(): boolean {
  const host = location.hostname.replace(/^www\./, '');
  return CHAT_ONLY_DOMAINS.some((d) => host === d || host.endsWith('.' + d));
}

interface Settings {
  enabled: boolean;
  platforms: Partial<Record<string, boolean>>;
}

async function getSettings(): Promise<Settings> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS', payload: null });
    return (response?.data as Settings) ?? { enabled: true, platforms: {} };
  } catch {
    return { enabled: true, platforms: {} };
  }
}

async function bootstrap(): Promise<void> {
  // Never run on pure chat/messaging sites
  if (isChatOnlySite()) {
    log.info(`Chat-only site detected (${location.hostname}), skipping`);
    return;
  }

  const platform = detectPlatform();
  log.info(`Platform detected: ${platform}`);

  const settings = await getSettings();
  if (!settings.enabled) {
    log.info('RecoMe disabled');
    return;
  }

  let adapter: BaseAdapter;
  let genericPlatform: Platform = platform === 'unknown' ? 'unknown' : platform;

  switch (platform) {
    case 'youtube':
      adapter = new YouTubeAdapter();
      break;
    case 'amazon':
      adapter = new AmazonAdapter();
      break;
    case 'twitter':
      adapter = new TwitterAdapter();
      break;
    case 'facebook':
      adapter = new FacebookAdapter();
      break;
    case 'instagram':
      adapter = new InstagramAdapter();
      break;
    case 'ebay':
      adapter = new EbayAdapter();
      break;
    case 'walmart':
      adapter = new WalmartAdapter();
      break;
    default: {
      // Unknown platform — use generic adapter so RecoMe works everywhere
      adapter = new GenericAdapter('unknown');
      genericPlatform = 'unknown';
      break;
    }
  }

  if (platform !== 'unknown' && settings.platforms[platform] === false) {
    log.info(`Platform ${platform} disabled in settings`);
    return;
  }

  await initAdapter(adapter);

  // Run a GenericAdapter as a supplement on known platforms to catch widgets,
  // carousels, video overlays, and other elements the specific adapter misses.
  // We share the same platform label so blocks/likes still apply.
  if (platform !== 'unknown') {
    const supplement = new GenericAdapter(genericPlatform);
    // Give the main adapter 2 seconds head-start before the generic one kicks in
    setTimeout(() => {
      supplement.init();
      log.info(`Generic supplement adapter started on ${platform}`);
    }, 2000);
  }

  // Proactive dwell tracking — observe cards the user lingers on
  setupDwellTracking(adapter, platform === 'unknown' ? 'unknown' : platform);

  // Search query monitoring — learn from what the user searches for
  setupSearchTracking(platform === 'unknown' ? 'unknown' : platform);
}

function setupDwellTracking(adapter: BaseAdapter, platform: Platform): void {
  const dwellTracker = createProactiveDwellTracker(platform, (el) =>
    (
      adapter as unknown as {
        extractMetadata: (e: Element) => import('@shared/types').ContentMetadata | null;
      }
    ).extractMetadata(el),
  );

  // Watch for processed cards (they get data-recome-id set) and start tracking them
  const cardObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'data-recome-id') {
        const el = mutation.target as Element;
        if (el.hasAttribute('data-recome-id')) {
          dwellTracker.observe(el);
        }
      }
    }
  });
  cardObserver.observe(document.body, {
    attributes: true,
    subtree: true,
    attributeFilter: ['data-recome-id'],
  });

  // Also observe any cards already processed at init time
  document.querySelectorAll('[data-recome-id]').forEach((el) => dwellTracker.observe(el));
}

// ── Search query monitoring ─────────────────────────────────────────────────
// Extracts search queries from URL params and search input fields,
// then sends them to the background to learn user interests.

/** Well-known URL query params that contain search terms */
const SEARCH_PARAMS = [
  'q',
  'query',
  'search_query',
  'k',
  'search',
  'keyword',
  'keywords',
  'term',
  'text',
  'field-keywords',
];

function extractSearchFromURL(): string {
  const params = new URLSearchParams(location.search);
  for (const key of SEARCH_PARAMS) {
    const val = params.get(key)?.trim();
    if (val && val.length >= 2) return val;
  }
  return '';
}

function setupSearchTracking(platform: Platform): void {
  let lastQuery = '';

  function checkAndSend(): void {
    const query = extractSearchFromURL();
    if (!query || query === lastQuery) return;
    lastQuery = query;
    log.info(`Search detected: "${query}"`);
    try {
      chrome.runtime.sendMessage({
        type: 'TRACK_SEARCH',
        payload: { query, platform },
      });
    } catch {
      /* extension context invalidated */
    }
  }

  // Check on init
  checkAndSend();

  // Re-check on SPA navigations (pushState / replaceState / popstate)
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = (...args: Parameters<typeof history.pushState>) => {
    origPush(...args);
    setTimeout(checkAndSend, 300);
  };
  history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
    origReplace(...args);
    setTimeout(checkAndSend, 300);
  };
  window.addEventListener('popstate', () => setTimeout(checkAndSend, 300));

  // Also watch for search form submissions
  document.addEventListener(
    'submit',
    (e) => {
      const form = e.target as HTMLFormElement;
      const input = form.querySelector(
        'input[type="search"], input[name="q"], input[name="query"], input[name="search_query"], input[name="k"]',
      ) as HTMLInputElement | null;
      if (input?.value?.trim()) {
        const query = input.value.trim();
        if (query.length >= 2 && query !== lastQuery) {
          lastQuery = query;
          log.info(`Search submitted: "${query}"`);
          try {
            chrome.runtime.sendMessage({
              type: 'TRACK_SEARCH',
              payload: { query, platform },
            });
          } catch {
            /* extension context invalidated */
          }
        }
      }
    },
    true,
  );
}

bootstrap().catch((err) => {
  log.error('Content script bootstrap failed', err);
});

// Listen for achievement/milestone toasts from the background service worker
chrome.runtime.onMessage.addListener(
  (message: { type: string; payload?: Record<string, unknown> }) => {
    if (message.type === 'ACHIEVEMENT_TOAST' && message.payload) {
      const { message: msg, kind } = message.payload as { message: string; kind: string };
      const isMilestone = kind === 'milestone';
      showToast(msg, isMilestone ? 'success' : 'info');
      if (isMilestone && /\b(100|500|1000)\b/.test(msg)) {
        showConfetti();
      }
    }

    // Proactive insights — show a toast when new insights are available
    if (message.type === 'INSIGHT_AVAILABLE' && message.payload) {
      const { count } = message.payload as { count: number };
      if (count > 0) {
        showInsightToast();
      }
    }
  },
);

async function showInsightToast(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_PENDING_INSIGHTS',
      payload: null,
    });
    const insights = response?.data as
      | Array<{ id: string; title: string; message: string; chatPrompt?: string }>
      | undefined;
    if (!insights || insights.length === 0) return;

    // Show the most recent insight as a toast
    const insight = insights[0]!;
    showToast(`💡 ${insight.message}`, 'info', {
      onUndo: () => {
        // "Undo" here means dismiss — don't show this insight again
        chrome.runtime
          .sendMessage({ type: 'INSIGHT_DISMISSED', payload: { insightId: insight.id } })
          .catch(() => undefined);
      },
    });

    // Mark as shown
    chrome.runtime
      .sendMessage({ type: 'INSIGHT_SHOWN', payload: { insightId: insight.id } })
      .catch(() => undefined);
  } catch {
    // Extension context invalidated or no insights
  }
}
