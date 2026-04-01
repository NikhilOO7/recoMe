/**
 * AdapterCoverageMatrix — per-platform coverage documentation and runtime
 * health reporting for selector effectiveness.
 *
 * Sprint 1 (P1.3): Provides structured per-platform, per-page-type coverage
 * metadata so engineers can quickly identify whether a platform broke due to
 * selector changes, page-type mismatch, or metadata extraction failure.
 *
 * Also exposes runtime counters (cards seen, scored, rejected, reason codes)
 * for DevTools and debug inspection.
 */

import type { Platform } from '@shared/types';

// ── Coverage Matrix Types ───────────────────────────────────────────────────

export interface PageTypeCoverage {
  pageType: string;
  /** Primary CSS selectors expected to match cards on this page type */
  expectedCardSelectors: string[];
  /** CSS selectors for the feed/container element */
  expectedFeedSelectors: string[];
  /** Metadata fields expected to be extracted */
  expectedMetadataFields: string[];
  /** Minimum expected card count on a typical page load */
  minExpectedCards: number;
  /** Known failure modes / common breakage patterns */
  knownIssues: string[];
}

export interface PlatformCoverage {
  platform: Platform;
  adapter: string;
  pageTypes: PageTypeCoverage[];
  /** Whether this adapter supports commerce features (extractCandidate) */
  isCommerce: boolean;
  /** Whether platform feedback (native dismiss) is supported */
  hasPlatformFeedback: boolean;
}

// ── Runtime Health Counters ─────────────────────────────────────────────────

export interface CardProcessingStats {
  /** Total cards detected by selector match */
  cardsSeen: number;
  /** Cards that passed metadata extraction */
  cardsExtracted: number;
  /** Cards sent to brain/scoring */
  cardsScored: number;
  /** Cards rejected (null metadata or validation failure) */
  cardsRejected: number;
  /** Cards with RecoMe controls injected */
  cardsWithControls: number;
  /** Reasons for rejection, with counts */
  rejectionReasons: Record<string, number>;
  /** Timestamp of first card detection */
  firstCardAt: number | null;
  /** Timestamp of most recent card detection */
  lastCardAt: number | null;
  /** Active card selector in use */
  activeSelector: string;
  /** Whether discovery fallback was triggered */
  discoveryTriggered: boolean;
}

let stats: CardProcessingStats = createEmptyStats();

function createEmptyStats(): CardProcessingStats {
  return {
    cardsSeen: 0,
    cardsExtracted: 0,
    cardsScored: 0,
    cardsRejected: 0,
    cardsWithControls: 0,
    rejectionReasons: {},
    firstCardAt: null,
    lastCardAt: null,
    activeSelector: '',
    discoveryTriggered: false,
  };
}

/** Record a card being detected by selector */
export function recordCardSeen(): void {
  stats.cardsSeen++;
  const now = Date.now();
  if (!stats.firstCardAt) stats.firstCardAt = now;
  stats.lastCardAt = now;
}

/** Record successful metadata extraction */
export function recordCardExtracted(): void {
  stats.cardsExtracted++;
}

/** Record card sent to scoring */
export function recordCardScored(): void {
  stats.cardsScored++;
}

/** Record card rejection with reason */
export function recordCardRejected(reason: string): void {
  stats.cardsRejected++;
  stats.rejectionReasons[reason] = (stats.rejectionReasons[reason] ?? 0) + 1;
}

/** Record controls injected on a card */
export function recordCardWithControls(): void {
  stats.cardsWithControls++;
}

/** Update the active selector being used */
export function setActiveSelector(selector: string): void {
  stats.activeSelector = selector;
}

/** Mark that selector discovery fallback was triggered */
export function setDiscoveryTriggered(): void {
  stats.discoveryTriggered = true;
}

/** Get current processing stats snapshot */
export function getProcessingStats(): CardProcessingStats {
  return { ...stats };
}

/** Reset all counters (e.g., on SPA navigation) */
export function resetProcessingStats(): void {
  stats = createEmptyStats();
}

// ── Coverage Matrix Data ────────────────────────────────────────────────────

const COVERAGE_MATRIX: PlatformCoverage[] = [
  {
    platform: 'amazon',
    adapter: 'AmazonAdapter',
    isCommerce: true,
    hasPlatformFeedback: false,
    pageTypes: [
      {
        pageType: 'search',
        expectedCardSelectors: ['[data-component-type="s-search-result"]', '[data-asin]'],
        expectedFeedSelectors: ['.s-main-slot', '#search'],
        expectedMetadataFields: ['title', 'creator', 'price', 'rating', 'reviews'],
        minExpectedCards: 5,
        knownIssues: ['Sponsored results may have different ASIN attributes'],
      },
      {
        pageType: 'product',
        expectedCardSelectors: ['[data-component-type="s-search-result"]'],
        expectedFeedSelectors: ['#similarities_feature_div', '#anonCarousel'],
        expectedMetadataFields: ['title', 'creator', 'price'],
        minExpectedCards: 0,
        knownIssues: ['PDP uses extractPdpCandidate, not card selectors'],
      },
      {
        pageType: 'deals',
        expectedCardSelectors: ['[data-testid="deal-card"]', '.dealCard'],
        expectedFeedSelectors: ['#dealsGrid', '.deals-container'],
        expectedMetadataFields: ['title', 'price'],
        minExpectedCards: 3,
        knownIssues: ['Lightning deals have countdown timers that change DOM'],
      },
      {
        pageType: 'home',
        expectedCardSelectors: ['.a-carousel-card', '[data-asin]'],
        expectedFeedSelectors: ['#desktop-grid', '#navbar'],
        expectedMetadataFields: ['title'],
        minExpectedCards: 2,
        knownIssues: ['Homepage carousels lazy-load with scroll'],
      },
    ],
  },
  {
    platform: 'youtube',
    adapter: 'YouTubeAdapter',
    isCommerce: false,
    hasPlatformFeedback: true,
    pageTypes: [
      {
        pageType: 'home',
        expectedCardSelectors: ['ytd-rich-item-renderer', 'ytd-video-renderer'],
        expectedFeedSelectors: ['ytd-browse', '#primary'],
        expectedMetadataFields: ['title', 'creator', 'meta_text'],
        minExpectedCards: 5,
        knownIssues: ['Shorts shelf uses different renderer', 'Ad slots interspersed'],
      },
      {
        pageType: 'search',
        expectedCardSelectors: ['ytd-video-renderer'],
        expectedFeedSelectors: ['ytd-search'],
        expectedMetadataFields: ['title', 'creator'],
        minExpectedCards: 3,
        knownIssues: ['Channel results and playlist results use different renderers'],
      },
      {
        pageType: 'watch',
        expectedCardSelectors: ['ytd-compact-video-renderer'],
        expectedFeedSelectors: ['#secondary', 'ytd-watch-next-secondary-results-renderer'],
        expectedMetadataFields: ['title', 'creator'],
        minExpectedCards: 3,
        knownIssues: ['Autoplay card may have special attributes'],
      },
      {
        pageType: 'shorts',
        expectedCardSelectors: ['ytd-reel-item-renderer', 'ytd-reel-video-renderer'],
        expectedFeedSelectors: ['ytd-shorts', '#shorts-container'],
        expectedMetadataFields: ['title'],
        minExpectedCards: 1,
        knownIssues: ['Full-screen shorts have overlay metadata only'],
      },
    ],
  },
  {
    platform: 'twitter',
    adapter: 'TwitterAdapter',
    isCommerce: false,
    hasPlatformFeedback: true,
    pageTypes: [
      {
        pageType: 'home',
        expectedCardSelectors: ['article[data-testid="tweet"]'],
        expectedFeedSelectors: ['[data-testid="primaryColumn"]'],
        expectedMetadataFields: ['title', 'creator'],
        minExpectedCards: 3,
        knownIssues: ['Promoted tweets have different DOM structure in ad wrapper'],
      },
      {
        pageType: 'search',
        expectedCardSelectors: ['article[data-testid="tweet"]'],
        expectedFeedSelectors: ['div[aria-label="Timeline: Search timeline"]'],
        expectedMetadataFields: ['title', 'creator'],
        minExpectedCards: 2,
        knownIssues: [],
      },
      {
        pageType: 'explore',
        expectedCardSelectors: ['div[data-testid="trend"]', 'article[data-testid="tweet"]'],
        expectedFeedSelectors: ['div[aria-label="Timeline: Trending now"]'],
        expectedMetadataFields: ['title'],
        minExpectedCards: 3,
        knownIssues: ['Trend cards are different shape than tweets'],
      },
    ],
  },
  {
    platform: 'linkedin',
    adapter: 'LinkedInAdapter',
    isCommerce: false,
    hasPlatformFeedback: true,
    pageTypes: [
      {
        pageType: 'feed',
        expectedCardSelectors: ['div.feed-shared-update-v2', 'div[data-urn^="urn:li:activity"]'],
        expectedFeedSelectors: [
          'div.scaffold-finite-scroll__content',
          'main.scaffold-layout__main',
        ],
        expectedMetadataFields: ['title', 'creator', 'full_text'],
        minExpectedCards: 3,
        knownIssues: ['Promoted posts have subtle "Promoted" label in sub-description'],
      },
      {
        pageType: 'jobs',
        expectedCardSelectors: ['li.jobs-search-results__list-item', 'div.job-card-container'],
        expectedFeedSelectors: ['div.jobs-search-results-list'],
        expectedMetadataFields: ['title', 'creator', 'job_location'],
        minExpectedCards: 3,
        knownIssues: ['Job collections page has different card wrapper than search'],
      },
      {
        pageType: 'search',
        expectedCardSelectors: ['li.reusable-search__result-container'],
        expectedFeedSelectors: ['div.search-results-container'],
        expectedMetadataFields: ['title'],
        minExpectedCards: 2,
        knownIssues: ['Search results mix people, companies, posts — different metadata per type'],
      },
      {
        pageType: 'company',
        expectedCardSelectors: ['div.org-update-card', 'li.org-people-profile-card'],
        expectedFeedSelectors: ['div.org-grid__content'],
        expectedMetadataFields: ['title'],
        minExpectedCards: 1,
        knownIssues: ['Company posts may not have data-urn attributes'],
      },
    ],
  },
  {
    platform: 'instagram',
    adapter: 'InstagramAdapter',
    isCommerce: false,
    hasPlatformFeedback: true,
    pageTypes: [
      {
        pageType: 'feed',
        expectedCardSelectors: ['article'],
        expectedFeedSelectors: ['main[role="main"]', 'main'],
        expectedMetadataFields: ['title', 'creator'],
        minExpectedCards: 1,
        knownIssues: [
          'Instagram obfuscates class names frequently',
          'Carousel posts harder to identify',
        ],
      },
      {
        pageType: 'explore',
        expectedCardSelectors: ['main a[href*="/p/"]', 'main a[href*="/reel/"]'],
        expectedFeedSelectors: ['section main'],
        expectedMetadataFields: ['title'],
        minExpectedCards: 5,
        knownIssues: ['Grid items are bare <a> tags with minimal metadata'],
      },
      {
        pageType: 'reels',
        expectedCardSelectors: ['div[role="presentation"] video', 'a[href*="/reel/"]'],
        expectedFeedSelectors: ['div[role="main"]'],
        expectedMetadataFields: ['title'],
        minExpectedCards: 1,
        knownIssues: ['Full-screen reels have overlay metadata only'],
      },
    ],
  },
  {
    platform: 'ebay',
    adapter: 'EbayAdapter',
    isCommerce: false,
    hasPlatformFeedback: false,
    pageTypes: [
      {
        pageType: 'search',
        expectedCardSelectors: ['.s-item:not(.s-item--placeholder)', 'li.s-item'],
        expectedFeedSelectors: ['.srp-results', '#ResultSetItems'],
        expectedMetadataFields: ['title', 'price', 'creator'],
        minExpectedCards: 5,
        knownIssues: ['Placeholder items match .s-item but have no real data'],
      },
      {
        pageType: 'deals',
        expectedCardSelectors: ['[data-testid="x-deal-card"]', '.dne-itemtile'],
        expectedFeedSelectors: ['#DailyDealsContent'],
        expectedMetadataFields: ['title', 'price'],
        minExpectedCards: 3,
        knownIssues: [],
      },
    ],
  },
  {
    platform: 'walmart',
    adapter: 'WalmartAdapter',
    isCommerce: false,
    hasPlatformFeedback: false,
    pageTypes: [
      {
        pageType: 'search',
        expectedCardSelectors: [
          '[data-automation-id="product-container"]',
          '[data-item-id]',
          '[data-testid="search-result-item"]',
        ],
        expectedFeedSelectors: ['[data-automation-id="search-result-set"]'],
        expectedMetadataFields: ['title', 'price', 'creator'],
        minExpectedCards: 5,
        knownIssues: ['PerimeterX bot challenge may replace page content'],
      },
      {
        pageType: 'browse',
        expectedCardSelectors: ['[data-testid="browse-item"]', '.browse-grid-item'],
        expectedFeedSelectors: ['[data-testid="browse-grid"]'],
        expectedMetadataFields: ['title', 'price'],
        minExpectedCards: 3,
        knownIssues: ['Tempo-based redesign uses different data-testid values'],
      },
    ],
  },
  {
    platform: 'facebook',
    adapter: 'FacebookAdapter',
    isCommerce: false,
    hasPlatformFeedback: true,
    pageTypes: [
      {
        pageType: 'feed',
        expectedCardSelectors: ['div[data-pagelet^="FeedUnit"]', 'div[role="article"]'],
        expectedFeedSelectors: ['div[role="feed"]', 'div[role="main"]'],
        expectedMetadataFields: ['title', 'creator'],
        minExpectedCards: 2,
        knownIssues: [
          'Facebook heavily obfuscates class names',
          'Empty shell divs match article role before content loads',
        ],
      },
      {
        pageType: 'marketplace',
        expectedCardSelectors: ['a[href*="/marketplace/item/"]'],
        expectedFeedSelectors: ['div[role="main"]'],
        expectedMetadataFields: ['title', 'price'],
        minExpectedCards: 3,
        knownIssues: [],
      },
    ],
  },
];

/** Get the coverage matrix for a specific platform */
export function getPlatformCoverage(platform: Platform): PlatformCoverage | null {
  return COVERAGE_MATRIX.find((c) => c.platform === platform) ?? null;
}

/** Get coverage for a specific platform + page type */
export function getPageTypeCoverage(platform: Platform, pageType: string): PageTypeCoverage | null {
  const pc = getPlatformCoverage(platform);
  if (!pc) return null;
  return pc.pageTypes.find((pt) => pt.pageType === pageType) ?? null;
}

/** Get the full coverage matrix (for DevTools display) */
export function getFullCoverageMatrix(): PlatformCoverage[] {
  return COVERAGE_MATRIX;
}

// ── Debug Snapshot for DevTools ─────────────────────────────────────────────

export interface AdapterHealthSnapshot {
  platform: Platform;
  pageType: string;
  stats: CardProcessingStats;
  coverage: PageTypeCoverage | null;
  selectorHealthy: boolean;
  timestamp: string;
}

/** Build a complete health snapshot for DevTools inspection */
export function buildHealthSnapshot(
  platform: Platform,
  pageType: string,
  selectorHealthy: boolean,
): AdapterHealthSnapshot {
  return {
    platform,
    pageType,
    stats: getProcessingStats(),
    coverage: getPageTypeCoverage(platform, pageType),
    selectorHealthy,
    timestamp: new Date().toISOString(),
  };
}
