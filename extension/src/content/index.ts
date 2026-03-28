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
import { createProactiveDwellTracker, createSmartPromptTrackers } from './DwellTracker';
import { PlatformIntelligenceEngine } from './intelligence/PlatformIntelligenceEngine';
import { migrateLegacyCache } from './adapters/SelectorDiscovery';
import { buildPathPattern, loadPathAwareCache } from './adapters/PathPatternCache';
import { checkPageEligibility, getMinCardThreshold, publishDebugSnapshot } from './PageEligibility';
import type { DebugSnapshot } from './PageEligibility';
import { createLogger } from '@shared/Logger';
import { showToast } from './ui/Toast';
import { showConfetti } from './ui/Confetti';
import { FloatingOverlay } from './overlay/FloatingOverlay';
import type { BaseAdapter } from './adapters/BaseAdapter';
import type { Platform, ContentMetadata } from '@shared/types';

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
    if (!response?.success) return { enabled: false, platforms: {} }; // fail closed
    return (response.data as Settings) ?? { enabled: false, platforms: {} };
  } catch {
    // If we can't reach the background script, fail closed — don't run
    return { enabled: false, platforms: {} };
  }
}

// ── Overlay reference (for toggle command) ──────────────────────────────────
let overlayInstance: import('./overlay/FloatingOverlay').FloatingOverlay | null = null;

async function bootstrap(): Promise<void> {
  // Never run on pure chat/messaging sites
  if (isChatOnlySite()) {
    log.info(`Chat-only site detected (${location.hostname}), skipping`);
    return;
  }

  // ── P0 Fix: Page eligibility gate ─────────────────────────────────────────
  // Run strict checks BEFORE creating any adapter, overlay, or UI.
  // Blocks: CAPTCHA, anti-bot, login/signup, logged-out social, error pages.
  const eligibility = checkPageEligibility();
  if (!eligibility.eligible) {
    log.info(`Page ineligible: ${eligibility.reason} — suppressing all RecoMe UI`);
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
    case 'linkedin':
      adapter = new GenericAdapter('linkedin');
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

  // Pre-load cached discovered selectors before init (V2: path-aware)
  const domain = location.hostname.replace(/^www\./, '');
  const pathPattern = buildPathPattern(new URL(location.href));
  let cached = await loadPathAwareCache(domain, pathPattern);
  // One-time V1 -> V2 migration
  if (!cached) cached = await migrateLegacyCache(domain);
  if (cached) adapter.applyCachedSelectors(cached);

  await initAdapter(adapter);

  // ── P1 Fix: Per-platform health threshold ─────────────────────────────────
  // After adapter init, check if enough cards were found. If not, wait a bit
  // and recheck before showing the overlay. This prevents "activation without
  // usable controls" — the core P0 issue from the QA report.
  const minCards = getMinCardThreshold(platform);
  const cardCount = countDetectedCards(adapter);
  let overlayDeferred = false;

  if (cardCount < minCards) {
    log.info(`Only ${cardCount} cards found (need ${minCards}) — deferring overlay, will recheck`);
    overlayDeferred = true;
  }

  // Show first-action nudge only when we have cards to act on
  if (!overlayDeferred) {
    showFirstActionNudge();
  }

  // Run a GenericAdapter as a supplement on known platforms to catch widgets,
  // carousels, video overlays, and other elements the specific adapter misses.
  // Lifecycle is coupled to the primary adapter — destroyed when it is.
  if (platform !== 'unknown') {
    const supplement = new GenericAdapter(genericPlatform);
    const origDestroy = adapter.destroy.bind(adapter);
    adapter.destroy = () => {
      supplement.destroy();
      origDestroy();
    };
    // Give the main adapter 2 seconds head-start before the generic one kicks in
    setTimeout(() => {
      supplement.init();
      log.info(`Generic supplement adapter started on ${platform}`);
    }, 2000);
  }

  const resolvedPlatform: Platform = platform === 'unknown' ? 'unknown' : platform;
  const extractMeta = (el: Element): ContentMetadata | null =>
    (
      adapter as unknown as { extractMetadata: (e: Element) => ContentMetadata | null }
    ).extractMetadata(el);

  // Proactive dwell tracking — observe cards the user lingers on
  setupDwellTracking(adapter, resolvedPlatform);

  // Smart prompt tracking — scroll-back, comparison, cart hover detection
  setupSmartPromptTracking(adapter, resolvedPlatform, extractMeta);

  // Search query monitoring — learn from what the user searches for
  setupSearchTracking(resolvedPlatform);

  // ── Overlay injection with health gating ──────────────────────────────────
  // If cards were found immediately, inject overlay right away.
  // Otherwise, wait up to 5 seconds for cards to appear (MutationObserver may
  // detect them async). If still nothing, stay hidden — the extension is active
  // but there's nothing useful to show on this page.
  if (!overlayDeferred) {
    injectOverlay(resolvedPlatform, adapter);
    setupPlatformIntelligence(resolvedPlatform);
  } else {
    // Recheck at 2s, 5s, and 8s intervals — cards may load asynchronously
    const recheckIntervals = [2000, 5000, 8000];
    let injected = false;

    for (const delay of recheckIntervals) {
      setTimeout(() => {
        if (injected) return;
        const currentCount = countDetectedCards(adapter);

        // Also re-run eligibility check (page may have changed via SPA)
        const recheck = checkPageEligibility();
        if (!recheck.eligible) {
          log.info(`Page became ineligible during recheck: ${recheck.reason}`);
          return;
        }

        if (currentCount >= minCards) {
          log.info(`Recheck: ${currentCount} cards found (need ${minCards}) — activating overlay`);
          injected = true;
          injectOverlay(resolvedPlatform, adapter);
          setupPlatformIntelligence(resolvedPlatform);
          showFirstActionNudge();
        } else if (delay === recheckIntervals[recheckIntervals.length - 1]) {
          log.info(
            `Final recheck: ${currentCount} cards found (need ${minCards}) — staying hidden. ` +
              `Extension is running but no usable controls on this page.`,
          );
          // Still inject the overlay so the user can access the dashboard/agent,
          // but DON'T show the first-action nudge (nothing actionable on the page).
          injectOverlay(resolvedPlatform, adapter);
          setupPlatformIntelligence(resolvedPlatform);
        }
      }, delay);
    }
  }

  // ── Debug snapshot — dev-only diagnostics ─────────────────────────────────
  // Set `recome_debug: true` in chrome.storage.local to enable.
  // Then inspect `window.__RECOME_DEBUG` in the console for a full status report.
  publishDebugSnapshot({
    url: location.href,
    timestamp: new Date().toISOString(),
    eligibility,
    platform,
    pageType:
      (adapter as unknown as { detectPageType?: () => string }).detectPageType?.() ?? 'unknown',
    activeCardSelector: adapter.getCardSelector(),
    detectedCards: cardCount,
    minCardThreshold: minCards,
    overlayInjected: !overlayDeferred,
    checks: {
      isChatOnly: false,
      isEnabled: settings.enabled,
      isPlatformEnabled: settings.platforms[platform] !== false,
      hasEnoughCards: cardCount >= minCards,
    },
  } satisfies DebugSnapshot);
}

/**
 * Count how many cards the adapter has detected on the current page.
 * Uses the adapter's active card selector to query the DOM.
 */
function countDetectedCards(adapter: BaseAdapter): number {
  const selector = adapter.getCardSelector();
  if (!selector) return 0;
  try {
    return document.querySelectorAll(selector).length;
  } catch {
    return 0;
  }
}

function setupDwellTracking(adapter: BaseAdapter, platform: Platform): void {
  const dwellTracker = createProactiveDwellTracker(platform, (el) =>
    (
      adapter as unknown as {
        extractMetadata: (e: Element) => ContentMetadata | null;
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

function setupSmartPromptTracking(
  adapter: BaseAdapter,
  platform: Platform,
  extractMeta: (el: Element) => ContentMetadata | null,
): void {
  const { scrollBackTracker, comparisonDetector, cartHoverDetector } = createSmartPromptTrackers(
    platform,
    extractMeta,
  );

  // Watch for processed cards and wire up smart prompt trackers
  const smartObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'data-recome-id') {
        const el = mutation.target as Element;
        if (el.hasAttribute('data-recome-id')) {
          scrollBackTracker.observe(el);
          cartHoverDetector.watch(el);

          // Record view for comparison detection
          const meta = extractMeta(el);
          if (meta) {
            comparisonDetector.recordView(el, meta);
          }
        }
      }
    }
  });
  smartObserver.observe(document.body, {
    attributes: true,
    subtree: true,
    attributeFilter: ['data-recome-id'],
  });

  // Also process already-existing cards
  document.querySelectorAll('[data-recome-id]').forEach((el) => {
    scrollBackTracker.observe(el);
    cartHoverDetector.watch(el);
    const meta = extractMeta(el);
    if (meta) comparisonDetector.recordView(el, meta);
  });
}

async function injectOverlay(platform: Platform, adapter: BaseAdapter): Promise<void> {
  try {
    const overlay = new FloatingOverlay(platform);
    overlayInstance = overlay;

    // Give the overlay access to extract product candidates from the page
    overlay.setGetCandidates(() => {
      const candidates: unknown[] = [];

      // Try PDP extraction first (e.g., Amazon product page)
      const pdpMethod = (adapter as unknown as Record<string, unknown>)['extractPdpCandidate'];
      if (typeof pdpMethod === 'function') {
        const pdp = pdpMethod.call(adapter) as unknown;
        if (pdp) candidates.push(pdp);
      }

      // If no PDP candidate, try extracting from visible cards on the page
      if (candidates.length === 0) {
        const sel = adapter.getCardSelector();
        const cards = document.querySelectorAll(sel);
        for (const card of Array.from(cards).slice(0, 5)) {
          const candidate = adapter.extractCandidate(card);
          if (candidate) candidates.push(candidate);
        }
      }

      return candidates;
    });

    await overlay.inject();
    log.info('Floating overlay injected');
  } catch (e) {
    log.error('Failed to inject overlay', e);
  }
}

// ── Platform Intelligence ───────────────────────────────────────────────────

function setupPlatformIntelligence(platform: Platform): void {
  // Delay to let the page finish loading and the adapter settle
  setTimeout(async () => {
    try {
      const engine = new PlatformIntelligenceEngine(platform);

      // Wire badge updates to the overlay
      engine.onBadgeUpdate((count) => {
        overlayInstance?.setInsightCount(count);
      });

      await engine.analyze();
    } catch (e) {
      log.error('Platform intelligence failed', e);
    }
  }, 3000);
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

    // Toggle overlay from keyboard command
    if (message.type === 'TOGGLE_OVERLAY') {
      overlayInstance?.toggle();
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
    showToast(`${insight.message}`, 'info', {
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

function showFirstActionNudge(): void {
  chrome.storage.local
    .get('recome_first_action_done')
    .then((r) => {
      if (r['recome_first_action_done']) return;
      // Delay so it doesn't compete with page load
      setTimeout(() => {
        showToast(
          'RecoMe is active! Click the RecoMe button on any card to start training your feed.',
          'info',
        );
        // Set the flag so we only show this once
        chrome.storage.local.set({ recome_first_action_done: true }).catch(() => undefined);
      }, 3000);
    })
    .catch(() => undefined);
}
