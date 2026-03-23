import { createLogger } from '@shared/Logger';
import { SELECTOR_CACHE_V2_PREFIX, SELECTOR_HEALTH_PRUNE_TTL_MS } from '@shared/constants';
import type { SelectorHealthRecord } from './SelectorHealth';

const log = createLogger('PathPatternCache');

// ── Path Pattern Rules ────────────────────────────────────────────────────────

/** Known platform path patterns — maps URL path prefixes to descriptive labels. */
const PLATFORM_PATH_RULES: Record<string, Array<{ pattern: RegExp; label: string }>> = {
  'youtube.com': [
    { pattern: /^\/(watch|live)/, label: 'watch' },
    { pattern: /^\/shorts/, label: 'shorts' },
    { pattern: /^\/(results|hashtag)/, label: 'search' },
    { pattern: /^\/@/, label: 'channel' },
    { pattern: /^\/channel\//, label: 'channel' },
    { pattern: /^\/feed\/subscriptions/, label: 'subscriptions' },
    { pattern: /^\/playlist/, label: 'playlist' },
  ],
  'amazon.com': [
    { pattern: /^\/s[/?]/, label: 'search' },
    { pattern: /^\/dp\//, label: 'product' },
    { pattern: /^\/gp\//, label: 'product' },
    { pattern: /^\/b[/?]/, label: 'browse' },
    { pattern: /^\/deals/, label: 'deals' },
  ],
  'amazon.co': [
    { pattern: /^\/s[/?]/, label: 'search' },
    { pattern: /^\/dp\//, label: 'product' },
    { pattern: /^\/gp\//, label: 'product' },
  ],
  'twitter.com': [
    { pattern: /^\/home/, label: 'home' },
    { pattern: /^\/search/, label: 'search' },
    { pattern: /^\/explore/, label: 'explore' },
    { pattern: /^\/[^/]+\/status\//, label: 'status' },
  ],
  'x.com': [
    { pattern: /^\/home/, label: 'home' },
    { pattern: /^\/search/, label: 'search' },
    { pattern: /^\/explore/, label: 'explore' },
    { pattern: /^\/[^/]+\/status\//, label: 'status' },
  ],
  'facebook.com': [
    { pattern: /^\/watch/, label: 'watch' },
    { pattern: /^\/marketplace/, label: 'marketplace' },
    { pattern: /^\/reel/, label: 'reels' },
    { pattern: /^\/groups\//, label: 'groups' },
  ],
  'instagram.com': [
    { pattern: /^\/explore/, label: 'explore' },
    { pattern: /^\/reels/, label: 'reels' },
    { pattern: /^\/p\//, label: 'post' },
    { pattern: /^\/[^/]+\/reels/, label: 'profile-reels' },
  ],
  'ebay.com': [
    { pattern: /^\/sch\//, label: 'search' },
    { pattern: /^\/itm\//, label: 'item' },
    { pattern: /^\/b\//, label: 'browse' },
    { pattern: /^\/deals/, label: 'deals' },
  ],
  'walmart.com': [
    { pattern: /^\/search/, label: 'search' },
    { pattern: /^\/ip\//, label: 'product' },
    { pattern: /^\/browse\//, label: 'browse' },
    { pattern: /^\/cp\//, label: 'category' },
  ],
};

// ── Path Pattern Builder ──────────────────────────────────────────────────────

/**
 * Build a path pattern label from a URL.
 * Known platforms get explicit pattern matching.
 * Unknown sites use the first path segment as the pattern key.
 */
export function buildPathPattern(url: URL): string {
  const host = url.hostname.replace(/^www\./, '');
  const pathname = url.pathname;

  // Try known platform rules
  for (const [domainKey, rules] of Object.entries(PLATFORM_PATH_RULES)) {
    if (host.includes(domainKey)) {
      for (const rule of rules) {
        if (rule.pattern.test(pathname)) return rule.label;
      }
      return 'home';
    }
  }

  // Unknown site: use first meaningful path segment
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return 'home';

  const first = segments[0]!;
  // If first segment looks like an ID (all digits or very long), use 'home'
  if (/^\d+$/.test(first) || first.length > 30) return 'home';

  return first.toLowerCase();
}

// ── Cache Operations ──────────────────────────────────────────────────────────

function buildCacheKey(domain: string, pathPattern: string): string {
  return `${SELECTOR_CACHE_V2_PREFIX}${domain}:${pathPattern}`;
}

/**
 * Load a cached health record for a specific domain + path pattern.
 */
export async function loadPathAwareCache(
  domain: string,
  pathPattern: string,
): Promise<SelectorHealthRecord | null> {
  try {
    const key = buildCacheKey(domain, pathPattern);
    const result = await chrome.storage.local.get(key);
    const record = result[key] as SelectorHealthRecord | undefined;

    if (!record) return null;

    // Prune stale records
    if (Date.now() - record.lastChecked > SELECTOR_HEALTH_PRUNE_TTL_MS) {
      log.debug(`Pruning stale cache for ${domain}:${pathPattern}`);
      await chrome.storage.local.remove(key);
      return null;
    }

    log.debug(`Loaded V2 cache for ${domain}:${pathPattern}: "${record.cardSelector}"`);
    return record;
  } catch {
    return null;
  }
}

/**
 * Save a health record for a specific domain + path pattern.
 */
export async function savePathAwareCache(
  domain: string,
  pathPattern: string,
  record: SelectorHealthRecord,
): Promise<void> {
  try {
    const key = buildCacheKey(domain, pathPattern);
    await chrome.storage.local.set({ [key]: record });
    log.debug(`Saved V2 cache for ${domain}:${pathPattern}`);
  } catch {
    // Storage write failure — non-critical
  }
}

/**
 * Get all V2 cache entries (for DevTools display).
 */
export async function getAllCacheEntries(): Promise<Record<string, SelectorHealthRecord>> {
  try {
    const all = await chrome.storage.local.get(null);
    const entries: Record<string, SelectorHealthRecord> = {};
    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith(SELECTOR_CACHE_V2_PREFIX)) {
        entries[key.slice(SELECTOR_CACHE_V2_PREFIX.length)] = value as SelectorHealthRecord;
      }
    }
    return entries;
  } catch {
    return {};
  }
}
