import '../styles/content.css';
import 'webextension-polyfill';

// ── Extension context invalidation guard ───────────────────────────────────
// When the extension is reloaded/updated, old content scripts on open tabs
// lose their connection to the background. All chrome.runtime calls throw
// "Extension context invalidated". Detect this early and bail out.
function isContextValid(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

import { detectPlatform, initAdapter } from './observer';
import { YouTubeAdapter } from './adapters/YouTubeAdapter';
import { AmazonAdapter } from './adapters/AmazonAdapter';
import { TwitterAdapter } from './adapters/TwitterAdapter';
import { FacebookAdapter } from './adapters/FacebookAdapter';
import { InstagramAdapter } from './adapters/InstagramAdapter';
import { RedditAdapter } from './adapters/RedditAdapter';
import { EbayAdapter } from './adapters/EbayAdapter';
import { WalmartAdapter } from './adapters/WalmartAdapter';
import { GenericAdapter } from './adapters/GenericAdapter';
import { LinkedInAdapter } from './adapters/LinkedInAdapter';
import { TikTokAdapter } from './adapters/TikTokAdapter';
import { IndeedAdapter } from './adapters/IndeedAdapter';
import { GlassdoorAdapter } from './adapters/GlassdoorAdapter';
import { UdemyAdapter } from './adapters/UdemyAdapter';
import { CourseraAdapter } from './adapters/CourseraAdapter';
import { EdxAdapter } from './adapters/EdxAdapter';
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

// ── Incognito detection ─────────────────────────────────────────────────────
function isIncognito(): boolean {
  try {
    return chrome.extension?.inIncognitoContext === true;
  } catch {
    return false;
  }
}

// ── Offline / degraded mode detection ───────────────────────────────────────
let contentOfflineMode = !navigator.onLine;
window.addEventListener('online', () => {
  contentOfflineMode = false;
  log.info('Back online — AI features available');
});
window.addEventListener('offline', () => {
  contentOfflineMode = true;
  log.info('Offline — running in degraded mode (local scoring only)');
});

/** Check if AI features should be gated (incognito or offline) */
function isAIGated(): boolean {
  return isIncognito() || contentOfflineMode;
}

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
  if (!isContextValid()) return { enabled: false, platforms: {} };
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

// ── P3.1: Lifecycle manager — centralized cleanup for SPA navigation ────────
import { getLifecycle, resetLifecycle } from './LifecycleManager';
import { cleanupAllPrompts } from './prompts/PromptRenderer';
import { injectResearchCard, removeResearchCard, type ResearchCardData } from './ui/ResearchCard';

/** Active adapter reference — used by overlay callbacks to avoid stale closures */
let activeAdapter: BaseAdapter | null = null;

/** Legacy compat wrappers — delegate to LifecycleManager */
function trackTimeout(fn: () => void, delay: number): ReturnType<typeof setTimeout> {
  return getLifecycle().trackTimeout(fn, delay);
}

function clearPendingTimers(): void {
  cleanupAllPrompts();
  removeResearchCard();
  resetLifecycle();
}

// ── Tab context state (for popup synchronization) ─────────────────────────
let contentState = {
  platform: 'unknown',
  adapterActive: false,
  cardsDetected: 0,
  controlsInjected: 0,
  pageEligible: false,
  eligibilityReason: undefined as string | undefined,
};

/** Update content state — called from bootstrap and adapter callbacks */
function updateContentState(patch: Partial<typeof contentState>): void {
  Object.assign(contentState, patch);
}

/** Expose content state for overlay components running in the same context */
export function getContentState(): typeof contentState {
  return contentState;
}

// Listen for tab context queries from the background script.
// Responds with the most complete state available — prefers __RECOME_DEBUG
// (set after full bootstrap + eligibility + card detection) over contentState
// (set incrementally during bootstrap, may be stale due to race condition).
chrome.runtime.onMessage.addListener(
  (message: { type: string }, _sender, sendResponse: (response: unknown) => void) => {
    if (message.type === 'RECOME_GET_CONTENT_STATE') {
      const debug = window.__RECOME_DEBUG;
      if (debug) {
        // Use the authoritative debug snapshot
        sendResponse({
          platform: debug.platform ?? contentState.platform,
          adapterActive: debug.overlayInjected || contentState.adapterActive,
          cardsDetected: debug.detectedCards ?? contentState.cardsDetected,
          controlsInjected: contentState.controlsInjected,
          pageEligible: debug.eligibility?.eligible ?? contentState.pageEligible,
          eligibilityReason: debug.eligibility?.reason ?? contentState.eligibilityReason,
        });
      } else {
        sendResponse(contentState);
      }
      return true;
    }
    return false;
  },
);

async function bootstrap(): Promise<void> {
  // Bail if extension context is invalidated (extension reloaded while page open)
  if (!isContextValid()) return;

  // Never run on pure chat/messaging sites
  if (isChatOnlySite()) {
    log.info(`Chat-only site detected (${location.hostname}), skipping`);
    return;
  }

  // ── Incognito gating ────────────────────────────────────────────────────────
  // In incognito: skip storage writes, disable AI features, run in read-only mode
  if (isIncognito()) {
    log.info('Incognito mode — running in privacy-safe mode (no storage writes, no AI)');
  }

  // ── Offline awareness ───────────────────────────────────────────────────────
  if (contentOfflineMode) {
    log.info('Offline — AI scoring disabled, local-only mode');
  }

  // ── P0 Fix: Page eligibility gate ─────────────────────────────────────────
  // Run strict checks BEFORE creating any adapter, overlay, or UI.
  // Blocks: CAPTCHA, anti-bot, login/signup, logged-out social, error pages.
  const eligibility = checkPageEligibility();
  if (!eligibility.eligible) {
    log.info(`Page ineligible: ${eligibility.reason} — suppressing all RecoMe UI`);
    updateContentState({ pageEligible: false, eligibilityReason: eligibility.reason });
    return;
  }

  const platform = detectPlatform();
  log.info(`Platform detected: ${platform}`);
  updateContentState({ platform, pageEligible: true, eligibilityReason: undefined });

  const settings = await getSettings();
  if (!settings.enabled) {
    log.info('RecoMe disabled');
    return;
  }

  // P3.1: Clear stale timers from previous SPA navigation
  clearPendingTimers();

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
    case 'reddit':
      adapter = new RedditAdapter();
      break;
    case 'ebay':
      adapter = new EbayAdapter();
      break;
    case 'walmart':
      adapter = new WalmartAdapter();
      break;
    case 'linkedin':
      adapter = new LinkedInAdapter();
      break;
    case 'tiktok':
      adapter = new TikTokAdapter();
      break;
    case 'indeed':
      adapter = new IndeedAdapter();
      break;
    case 'glassdoor':
      adapter = new GlassdoorAdapter();
      break;
    case 'udemy':
      adapter = new UdemyAdapter();
      break;
    case 'coursera':
      adapter = new CourseraAdapter();
      break;
    case 'edx':
      adapter = new EdxAdapter();
      break;
    default: {
      // Unknown platform — use generic adapter so RecoMe works everywhere
      adapter = new GenericAdapter('unknown');
      genericPlatform = 'unknown';
      break;
    }
  }

  // P3.1: Store active adapter and register with lifecycle for SPA cleanup
  activeAdapter = adapter;
  getLifecycle().register(adapter);
  updateContentState({ adapterActive: true });

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

  await initAdapter(adapter, () => {
    // SPA navigation: clear stale timers and rebind overlay with fresh adapter ref
    clearPendingTimers();

    // ── Re-trigger page-level signal capture after SPA navigation ──────
    // This is critical: YouTube and Reddit are SPAs. When the user navigates
    // from home→watch or feed→post, capturePageResearchSignal() must re-fire
    // for the NEW page. Without this, signals are only captured on the initial
    // page load and missed on all subsequent SPA navigations.
    if (platform === 'youtube' && location.pathname.startsWith('/watch')) {
      trackTimeout(() => capturePageResearchSignal(platform, adapter), 3000);
    } else if (platform === 'reddit' && location.pathname.includes('/comments/')) {
      trackTimeout(() => capturePageResearchSignal(platform, adapter), 2000);
    } else if (
      platform === 'reddit' &&
      location.pathname.startsWith('/r/') &&
      !location.pathname.includes('/comments/')
    ) {
      trackTimeout(() => capturePageResearchSignal(platform, adapter), 2000);
    }

    // Re-trigger Research Card injection on Amazon PDP after SPA navigation
    if (
      platform === 'amazon' &&
      (location.pathname.includes('/dp/') || location.pathname.includes('/gp/product/'))
    ) {
      trackTimeout(() => injectResearchCardOnPDP(), 1500);
    }

    // Update card count for the new page
    const newCardCount = countDetectedCards(adapter);
    updateContentState({ cardsDetected: newCardCount });

    if (overlayInstance) {
      overlayInstance.onNavigate(() => {
        // P3.1: Use activeAdapter (module-level) to avoid stale closure
        const current = activeAdapter;
        if (!current) return [];
        const candidates: unknown[] = [];
        const pdpMethod = (current as unknown as Record<string, unknown>)['extractPdpCandidate'];
        if (typeof pdpMethod === 'function') {
          const pdp = pdpMethod.call(current) as unknown;
          if (pdp) candidates.push(pdp);
        }
        if (candidates.length === 0) {
          const sel = current.getCardSelector();
          const cards = document.querySelectorAll(sel);
          for (const card of Array.from(cards).slice(0, 5)) {
            const candidate = current.extractCandidate(card);
            if (candidate) candidates.push(candidate);
          }
        }
        return candidates;
      });
    }
  });

  // ── P1 Fix: Per-platform health threshold ─────────────────────────────────
  // After adapter init, check if enough cards were found. If not, wait a bit
  // and recheck before showing the overlay. This prevents "activation without
  // usable controls" — the core P0 issue from the QA report.
  const minCards = getMinCardThreshold(platform);
  const cardCount = countDetectedCards(adapter);
  updateContentState({ cardsDetected: cardCount });
  let overlayDeferred = false;

  if (cardCount < minCards) {
    log.info(`Only ${cardCount} cards found (need ${minCards}) — deferring overlay, will recheck`);
    overlayDeferred = true;
  }

  // Show first-action nudge only when we have cards to act on
  if (!overlayDeferred) {
    showFirstActionNudge();
  }

  // ── Phase 0: Page-level research signal capture ──────────────────────────
  // On content pages (YouTube watch, Reddit posts), capture the page's topic
  // as a research signal. This is distinct from DwellTracker (which tracks
  // individual card interactions) — this captures "you visited this page".
  if (platform === 'youtube' && location.pathname.startsWith('/watch')) {
    trackTimeout(() => capturePageResearchSignal(platform, adapter), 3000);
  } else if (platform === 'reddit' && location.pathname.includes('/comments/')) {
    trackTimeout(() => capturePageResearchSignal(platform, adapter), 2000);
  } else if (
    platform === 'reddit' &&
    location.pathname.startsWith('/r/') &&
    !location.pathname.includes('/comments/')
  ) {
    // Subreddit pages — capture the subreddit as a topic
    trackTimeout(() => capturePageResearchSignal(platform, adapter), 2000);
  }

  // P0.2: Inject "Research Detected" card on Amazon product detail pages
  if (
    platform === 'amazon' &&
    (location.pathname.includes('/dp/') || location.pathname.includes('/gp/product/'))
  ) {
    trackTimeout(() => injectResearchCardOnPDP(), 1500);
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

  // In incognito mode, skip tracking and storage writes
  if (!isIncognito()) {
    // Proactive dwell tracking — observe cards the user lingers on
    setupDwellTracking(adapter, resolvedPlatform);

    // Smart prompt tracking — scroll-back, comparison, cart hover detection
    setupSmartPromptTracking(adapter, resolvedPlatform, extractMeta);

    // Search query monitoring — learn from what the user searches for
    setupSearchTracking(resolvedPlatform);
  } else {
    log.info('Incognito: skipping dwell/search/smart-prompt tracking');
  }

  // ── Overlay injection with health gating ──────────────────────────────────
  // If cards were found immediately, inject overlay right away.
  // Otherwise, wait up to 5 seconds for cards to appear (MutationObserver may
  // detect them async). If still nothing, stay hidden — the extension is active
  // but there's nothing useful to show on this page.
  if (!overlayDeferred) {
    injectOverlay(resolvedPlatform);
    setupPlatformIntelligence(resolvedPlatform);
  } else {
    // Recheck at 2s, 5s, and 8s intervals — cards may load asynchronously
    const recheckIntervals = [2000, 5000, 8000];
    let injected = false;

    for (const delay of recheckIntervals) {
      trackTimeout(() => {
        if (injected) return;
        const currentCount = countDetectedCards(adapter);
        updateContentState({ cardsDetected: currentCount });

        // Also re-run eligibility check (page may have changed via SPA)
        const recheck = checkPageEligibility();
        if (!recheck.eligible) {
          log.info(`Page became ineligible during recheck: ${recheck.reason}`);
          return;
        }

        if (currentCount >= minCards) {
          log.info(`Recheck: ${currentCount} cards found (need ${minCards}) — activating overlay`);
          injected = true;
          injectOverlay(resolvedPlatform);
          setupPlatformIntelligence(resolvedPlatform);
          showFirstActionNudge();
        } else if (delay === recheckIntervals[recheckIntervals.length - 1]) {
          log.info(
            `Final recheck: ${currentCount} cards found (need ${minCards}) — staying hidden. ` +
              `Extension is running but no usable controls on this page.`,
          );
          // Still inject the overlay so the user can access the dashboard/agent,
          // but DON'T show the first-action nudge (nothing actionable on the page).
          injectOverlay(resolvedPlatform);
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
/**
 * P0.2: Inject "Research Detected" card on Amazon product detail pages.
 *
 * Matching strategy (Phase 0 — production-ready):
 * 1. Extract product title + brand + category from the Amazon PDP DOM
 * 2. Query KnowledgeGraph for ALL entities with interested_in relations
 * 3. Query MemoryStore active_entries for platform-attributed signals
 * 4. Match using: exact entity name match, substring containment,
 *    and multi-word phrase overlap (not single-word tokenization)
 * 5. Deduplicate and rank by weight, attribute platforms
 */
async function injectResearchCardOnPDP(): Promise<void> {
  try {
    // ── 1. Extract product context from Amazon DOM ──────────────────────
    const titleEl = document.querySelector('#productTitle') ?? document.querySelector('h1#title');
    const productTitle = titleEl?.textContent?.trim() ?? '';
    if (!productTitle) return;

    const brandEl = document.querySelector('#bylineInfo') ?? document.querySelector('#brand');
    const brandText =
      brandEl?.textContent
        ?.trim()
        ?.replace(/^(Visit the |Brand: )/i, '')
        ?.replace(/ Store$/, '') ?? '';

    const categoryEls = document.querySelectorAll('#wayfinding-breadcrumbs_feature_div a');
    const categories = Array.from(categoryEls)
      .map((el) => el.textContent?.trim() ?? '')
      .filter(Boolean);

    // Build a set of product keywords: title words, brand, categories
    const titleLower = productTitle.toLowerCase();
    // Extract meaningful phrases (2-3 word sequences) alongside single words
    const titleTokens = titleLower.split(/[\s,\-–—/|]+/).filter((w) => w.length > 2);
    // Also keep full title for broad matching
    const searchTerms = new Set<string>([
      ...titleTokens,
      ...(brandText ? [brandText.toLowerCase()] : []),
      ...categories.map((c) => c.toLowerCase()),
    ]);
    // Remove noise words
    const NOISE = new Set([
      'the',
      'and',
      'for',
      'with',
      'from',
      'that',
      'this',
      'new',
      'best',
      'pack',
      'set',
      'size',
      'color',
      'black',
      'white',
      'blue',
      'red',
      'green',
      'inch',
      'count',
    ]);
    for (const n of NOISE) searchTerms.delete(n);

    // ── 2. Query graph + memory ─────────────────────────────────────────
    const graphRes = await chrome.runtime.sendMessage({ type: 'GET_GRAPH_SUMMARY', payload: null });

    const graph = graphRes?.data as
      | {
          topInterests?: Array<{
            name: string;
            type: string;
            weight: number;
            metadata?: Record<string, unknown>;
          }>;
          recentEntities?: Array<{
            name: string;
            type: string;
            updated_at: number;
            metadata?: Record<string, unknown>;
          }>;
        }
      | undefined;

    // ── 3. Build platform-attributed topic index from graph entity metadata ──
    // The recordImplicitSignalWithGraphBridge() stores source_platform in entity metadata.
    // This is more reliable than MemoryStore context_bucket (which stores 'general'/'shopping', not platform name).
    const platformIndex = new Map<string, Set<string>>(); // topic → platforms

    // Index platforms from graph entities (topInterests + recentEntities).
    // Read BOTH source_platforms (array, accumulated) and source_platform (string, latest).
    for (const entity of [...(graph?.topInterests ?? []), ...(graph?.recentEntities ?? [])]) {
      const name = entity.name.toLowerCase();
      if (!platformIndex.has(name)) platformIndex.set(name, new Set());
      const platSet = platformIndex.get(name)!;

      // Accumulated platforms array (set by upsertEntity merge)
      const platforms = (entity.metadata?.source_platforms as string[]) ?? [];
      for (const p of platforms) {
        if (p && p !== 'unknown') platSet.add(p);
      }
      // Fallback: single source_platform field
      const singlePlat = (entity.metadata?.source_platform as string) ?? '';
      if (singlePlat && singlePlat !== 'unknown') platSet.add(singlePlat);
    }

    // ── 4. Match graph entities against product context ──────────────────
    const signals: ResearchCardData['signals'] = [];
    const seenTopics = new Set<string>();

    const allInterests = graph?.topInterests ?? [];
    const allRecent = graph?.recentEntities ?? [];
    // Combine both lists for matching
    const candidateEntities = [
      ...allInterests.map((i) => ({ name: i.name, weight: i.weight, type: i.type })),
      ...allRecent.map((e) => ({ name: e.name, weight: 0.4, type: e.type })),
    ];

    for (const entity of candidateEntities) {
      const entityLower = entity.name.toLowerCase();
      if (seenTopics.has(entityLower)) continue;

      // Skip creator entities ONLY if they don't match the product context.
      // Brands like "Sony" might be tagged as 'creator' from YouTube (channel-name heuristic)
      // but still need to match against product titles. Only skip creators that are clearly
      // channel names — they won't appear in the product title anyway, so the match check
      // below handles this naturally. No blanket skip needed.

      // Match: entity name appears in product title, OR product keywords appear in entity name
      const matchesTitle = titleLower.includes(entityLower) || entityLower.includes(titleLower);
      const matchesToken =
        !matchesTitle &&
        // Entity name matches any search term (bidirectional substring)
        [...searchTerms].some(
          (term) =>
            (term.length >= 3 && entityLower.includes(term)) ||
            (entityLower.length >= 3 && term.includes(entityLower)),
        );

      if (!matchesTitle && !matchesToken) continue;
      seenTopics.add(entityLower);

      // Find platform attribution from MemoryStore
      const platforms = new Set<string>();
      for (const [topic, plats] of platformIndex) {
        if (topic.includes(entityLower) || entityLower.includes(topic)) {
          for (const p of plats) platforms.add(p);
        }
      }

      // Also check graph entity metadata for source_platform
      const recentMatch = allRecent.find((e) => e.name.toLowerCase() === entityLower);

      // Use first non-amazon platform for display, prefer youtube/reddit
      const platformArr = [...platforms].filter((p) => p !== 'amazon');
      signals.push({
        platform: platformArr[0] ?? [...platforms][0] ?? 'amazon',
        topic: entity.name,
        signalCount: Math.max(platforms.size, 1),
        lastSeen: recentMatch?.updated_at ?? Date.now(),
      });
    }

    // ── 5. Also check MemoryStore topics directly (may have topics not yet in graph) ──
    for (const [topic, platforms] of platformIndex) {
      if (seenTopics.has(topic)) continue;
      const matchesTitle = titleLower.includes(topic) || topic.includes(titleLower);
      const matchesToken =
        !matchesTitle &&
        [...searchTerms].some(
          (term) =>
            (term.length >= 3 && topic.includes(term)) ||
            (topic.length >= 3 && term.includes(topic)),
        );
      if (!matchesTitle && !matchesToken) continue;
      seenTopics.add(topic);

      signals.push({
        platform: [...platforms][0] ?? 'amazon',
        topic,
        signalCount: platforms.size,
        lastSeen: Date.now(),
      });
    }

    if (signals.length === 0) return;

    // ── 6. Rank and build card data ─────────────────────────────────────
    // Sort: more platforms first, then by signal count
    signals.sort((a, b) => b.signalCount - a.signalCount);

    const allPlatforms = [
      ...new Set(
        signals.flatMap((s) => {
          const plats: string[] = [s.platform];
          // Also include all platforms from platformIndex for this topic
          const topicPlats = platformIndex.get(s.topic.toLowerCase());
          if (topicPlats) plats.push(...topicPlats);
          return plats;
        }),
      ),
    ].filter((p) => p !== 'amazon'); // Exclude amazon from "researched on" list

    const topTopics = signals.slice(0, 3).map((s) => s.topic);

    const matchReason =
      allPlatforms.length > 0
        ? `You've been researching ${topTopics.join(', ')} on ${allPlatforms.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' and ')}. This product connects to your research.`
        : `Based on your interest in ${topTopics.join(', ')}, this product matches your research trail.`;

    // Calculate match score: base from graph weights + cross-platform bonus
    const avgWeight =
      signals.slice(0, 4).reduce((sum, s) => {
        const interest = allInterests.find((i) => i.name.toLowerCase() === s.topic.toLowerCase());
        return sum + (interest?.weight ?? 0.3);
      }, 0) / Math.min(signals.length, 4);

    // Cross-platform bonus: having research from 2+ platforms is a strong
    // confidence signal (the core thesis). 1 platform = 1.5x, 2+ = 2x.
    // Also: 3+ matched entities is strong even with 1 platform.
    const platformMultiplier = allPlatforms.length >= 2 ? 2.0 : signals.length >= 3 ? 1.8 : 1.5;
    const matchScore = Math.min(avgWeight * platformMultiplier, 1);

    injectResearchCard({
      productTitle,
      matchScore,
      signals: signals.slice(0, 4),
      matchReason,
    });
  } catch (err) {
    // Silently fail — research card is non-critical
    void err;
  }
}

/**
 * Phase 0: Capture a page-level research signal from the current page.
 * Unlike DwellTracker (which observes individual card interactions), this
 * captures the topic of the page the user is actively viewing:
 * - YouTube /watch → video title keywords
 * - Reddit /r/xxx/comments/ → post title + subreddit
 * - Reddit /r/xxx → subreddit name as topic
 */
function capturePageResearchSignal(platform: Platform, _adapter: BaseAdapter): void {
  // Known brands — extracted as entities (type: brand), not topics
  const KNOWN_BRANDS = new Set([
    'sony',
    'bose',
    'apple',
    'samsung',
    'google',
    'microsoft',
    'amazon',
    'sennheiser',
    'jabra',
    'beats',
    'jbl',
    'anker',
    'soundcore',
    'shure',
    'audio-technica',
    'beyerdynamic',
    'hifiman',
    'audeze',
    'focal',
    'akg',
    'dell',
    'hp',
    'lenovo',
    'asus',
    'acer',
    'razer',
    'logitech',
    'corsair',
    'nvidia',
    'amd',
    'intel',
    'lg',
    'panasonic',
    'philips',
    'yamaha',
    'nike',
    'adidas',
    'dyson',
    'ikea',
    'nintendo',
    'playstation',
    'xbox',
  ]);

  // Product categories — extracted as topics for cross-platform matching.
  // Includes both generic keywords AND known model-name patterns so that
  // "Sony WH-1000XM5 Review" matches 'headphones' even without the word.
  const PRODUCT_CATEGORIES = new Map([
    [
      /headphones?|headsets?|over-?ears?|on-?ears?|wh-?1000|xm[345]|momentum|qc[234]|qc\s?ultra|px[78]|hd\s?[456]\d\d|dt\s?\d{3}/i,
      'headphones',
    ],
    [
      /earbuds?|in-?ears?|iems?|earphones?|airpods?|wf-?1000|galaxy\s?buds|freebuds|linkbuds/i,
      'earbuds',
    ],
    [/laptops?|notebooks?|ultrabooks?/i, 'laptops'],
    [/phones?|smartphones?|iphones?|androids?|pixels?|galaxy/i, 'smartphones'],
    [/tablets?|ipads?/i, 'tablets'],
    [/monitors?|displays?/i, 'monitors'],
    [/keyboards?|keycaps?|mechanical/i, 'keyboards'],
    [/mouse|mice|trackpads?/i, 'mouse'],
    [/cameras?|dslrs?|mirrorless/i, 'cameras'],
    [/speakers?|soundbars?/i, 'speakers'],
    [/tvs?|televisions?|oleds?/i, 'tvs'],
    [/routers?|wi-?fi|mesh/i, 'routers'],
    [/watches?|smartwatches?|wearables?/i, 'smartwatches'],
    [/shoes?|sneakers?|boots?|running/i, 'shoes'],
    [/vacuums?|robot\s*vacuums?/i, 'vacuums'],
  ]);

  try {
    const topics: string[] = [];
    const entities: string[] = [];
    let contentId = location.href;
    let contentTitle = document.title;

    if (platform === 'youtube') {
      // Extract from YouTube watch page
      const titleEl =
        document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ??
        document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string') ??
        document.querySelector('#title h1 yt-formatted-string') ??
        document.querySelector('h1.style-scope.ytd-watch-metadata');
      const videoTitle =
        titleEl?.textContent?.trim() ?? document.title.replace(' - YouTube', '').trim();

      const channelEl =
        document.querySelector('ytd-channel-name yt-formatted-string a') ??
        document.querySelector('#channel-name a');
      const channel = channelEl?.textContent?.trim();

      const titleLower = videoTitle.toLowerCase();

      // 1. Extract known brands from the title as entities
      for (const brand of KNOWN_BRANDS) {
        if (titleLower.includes(brand)) {
          // Capitalize brand name
          entities.push(brand.charAt(0).toUpperCase() + brand.slice(1));
        }
      }

      // 2. Extract product categories from the title
      for (const [pattern, category] of PRODUCT_CATEGORIES) {
        if (pattern.test(titleLower) && !topics.includes(category)) {
          topics.push(category);
        }
      }

      // 3. Extract meaningful keywords (skip noise, model numbers, short words)
      const NOISE = new Set([
        'the',
        'and',
        'for',
        'with',
        'this',
        'that',
        'you',
        'are',
        'was',
        'how',
        'why',
        'what',
        'best',
        'top',
        'new',
        'review',
        'unboxing',
        'video',
        'later',
        'years',
        'months',
        'weeks',
        'days',
        'worth',
        'still',
        'after',
        'before',
        'should',
        'buy',
        'buying',
        'guide',
        'ultimate',
        'complete',
        'first',
        'look',
        'hands',
        'here',
        'my',
        'thoughts',
        'opinion',
        'honest',
        'real',
        'truth',
        'tier',
        'list',
      ]);
      const titleWords = titleLower
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter(
          (w) =>
            w.length > 3 &&
            !NOISE.has(w) &&
            !KNOWN_BRANDS.has(w) &&
            !/^\d+$/.test(w) && // skip pure numbers
            !/^[a-z]{1,2}\d+/i.test(w), // skip model numbers like wh1000xm5
        );

      const seen = new Set<string>(topics);
      for (const word of titleWords) {
        if (!seen.has(word) && seen.size < 5) {
          seen.add(word);
          topics.push(word);
        }
      }

      if (channel) entities.push(channel);
      contentId = new URLSearchParams(location.search).get('v') ?? location.href;
      contentTitle = videoTitle;
    } else if (platform === 'reddit') {
      // Extract from Reddit post page or subreddit
      const subredditMatch = location.pathname.match(/^\/r\/([^/]+)/);
      const subreddit = subredditMatch?.[1];

      if (subreddit) {
        // Don't push raw subreddit name as a topic — it creates noise like "HeadphoneAdvice".
        // Instead, check if the subreddit name contains a product category.
        let subredditMatchedCategory = false;
        for (const [pattern, category] of PRODUCT_CATEGORIES) {
          if (pattern.test(subreddit) && !topics.includes(category)) {
            topics.push(category);
            subredditMatchedCategory = true;
          }
        }
        // Only keep the raw subreddit name if no category was extracted from it
        if (!subredditMatchedCategory) {
          topics.push(subreddit);
        }
      }

      if (location.pathname.includes('/comments/')) {
        // Post page — extract post title
        const postTitleEl =
          document.querySelector('shreddit-post h1') ??
          document.querySelector('[data-testid="post-container"] h1') ??
          document.querySelector('h1') ??
          document.querySelector('a.title'); // old reddit
        const postTitle = postTitleEl?.textContent?.trim() ?? '';

        if (postTitle) {
          const postLower = postTitle.toLowerCase();

          // Extract brands from post title
          for (const brand of KNOWN_BRANDS) {
            if (postLower.includes(brand)) {
              entities.push(brand.charAt(0).toUpperCase() + brand.slice(1));
            }
          }

          // Extract product categories from post title
          for (const [pattern, category] of PRODUCT_CATEGORIES) {
            if (pattern.test(postLower) && !topics.includes(category)) {
              topics.push(category);
            }
          }

          // Extract keywords from post title
          const NOISE = new Set([
            'the',
            'and',
            'for',
            'with',
            'this',
            'that',
            'you',
            'are',
            'was',
            'just',
            'got',
            'anyone',
            'does',
            'have',
            'help',
            'question',
            'which',
            'should',
            'looking',
            'need',
            'want',
            'between',
            'better',
            'best',
            'good',
            'worth',
            'opinions',
            'thoughts',
            'advice',
            'recommendation',
          ]);
          const titleWords = postLower
            .replace(/[^a-z0-9\s-]/g, ' ')
            .split(/\s+/)
            .filter(
              (w) =>
                w.length > 3 &&
                !NOISE.has(w) &&
                !KNOWN_BRANDS.has(w) &&
                !/^\d+$/.test(w) &&
                !/^[a-z]{1,2}\d+/i.test(w),
            );

          for (const word of titleWords) {
            if (topics.length < 8 && !topics.includes(word)) {
              topics.push(word);
            }
          }
          contentTitle = postTitle;
        }

        // Extract flair as a topic
        const flairEl =
          document.querySelector('[data-click-id="flair"]') ??
          document.querySelector('span.linkflairlabel');
        const flair = flairEl?.textContent?.trim();
        if (flair && !topics.includes(flair.toLowerCase())) {
          topics.push(flair.toLowerCase());
        }
      }
    }

    if (topics.length === 0 && entities.length === 0) return;

    // Step 1: Offline signal — fires immediately, no latency
    chrome.runtime
      .sendMessage({
        type: 'IMPLICIT_SIGNAL',
        payload: {
          topics,
          entities,
          platform,
          signalType: 'dwell_extended', // page visit = extended dwell
          contentId,
          contentTitle,
        },
      })
      .catch(() => undefined);

    log.info(`Page research signal captured on ${platform}: ${topics.join(', ')}`);

    // Step 2: AI enrichment — async, only if user has LLM key configured.
    // Extracts cleaner entities (brands, categories) and merges into graph
    // with higher confidence. No-op if no API key is set.
    chrome.runtime
      .sendMessage({
        type: 'ENRICH_PAGE_SIGNAL',
        payload: {
          title: contentTitle,
          platform,
          url: location.href,
          ...(platform === 'youtube' && {
            channel:
              document
                .querySelector('ytd-channel-name yt-formatted-string a')
                ?.textContent?.trim() ??
              document.querySelector('#channel-name a')?.textContent?.trim(),
          }),
          ...(platform === 'reddit' && {
            subreddit: location.pathname.match(/^\/r\/([^/]+)/)?.[1],
          }),
        },
      })
      .catch(() => undefined); // Fire-and-forget — AI enrichment is optional
  } catch (err) {
    log.debug('Failed to capture page research signal', err);
  }
}

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

async function injectOverlay(platform: Platform): Promise<void> {
  try {
    // Prevent duplicate overlays — destroy existing instance before creating a new one
    if (overlayInstance) {
      overlayInstance.destroy();
      overlayInstance = null;
    }
    // Also remove any stale host element left behind (defensive)
    document.getElementById('recome-overlay-host')?.remove();

    const overlay = new FloatingOverlay(platform);
    overlayInstance = overlay;

    // Give the overlay access to extract product candidates from the page
    // P3.1: Use activeAdapter to avoid stale closure after SPA navigation
    overlay.setGetCandidates(() => {
      const current = activeAdapter;
      if (!current) return [];
      const candidates: unknown[] = [];

      // Try PDP extraction first (e.g., Amazon product page)
      const pdpMethod = (current as unknown as Record<string, unknown>)['extractPdpCandidate'];
      if (typeof pdpMethod === 'function') {
        const pdp = pdpMethod.call(current) as unknown;
        if (pdp) candidates.push(pdp);
      }

      // If no PDP candidate, try extracting from visible cards on the page
      if (candidates.length === 0) {
        const sel = current.getCardSelector();
        const cards = document.querySelectorAll(sel);
        for (const card of Array.from(cards).slice(0, 5)) {
          const candidate = current.extractCandidate(card);
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
  // Gate AI features in incognito or offline mode
  if (isAIGated()) {
    log.info('AI gated (incognito or offline) — skipping platform intelligence');
    return;
  }

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
  // Suppress "Extension context invalidated" — expected after extension reload
  if (/context invalidated/i.test(String(err))) return;
  log.error('Content script bootstrap failed', err);
});

// Listen for achievement/milestone toasts from the background service worker
// Guard: skip if extension was reloaded (context invalidated)
if (isContextValid())
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
