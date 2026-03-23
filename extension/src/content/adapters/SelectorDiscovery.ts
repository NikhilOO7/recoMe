import { createLogger } from '@shared/Logger';
import { SELECTOR_CACHE_PREFIX, SELECTOR_CACHE_TTL_MS } from '@shared/constants';
import type { Platform } from '@shared/types';
import { type ContentSignature, matchesSignature } from './ContentSignatures';
import { createHealthRecord, type SelectorHealthRecord } from './SelectorHealth';
import { savePathAwareCache } from './PathPatternCache';

const log = createLogger('SelectorDiscovery');

// ── Cache types ──────────────────────────────────────────────────────────────

export interface CachedSelectors {
  cardSelector: string;
  feedSelector: string | null;
  discoveredAt: number;
  version: 1;
}

// ── Excluded zones (shared with GenericAdapter) ──────────────────────────────

export const EXCLUDED_ANCESTOR_SELECTOR = [
  'header',
  'nav',
  'footer',
  'aside',
  '[role="banner"]',
  '[role="navigation"]',
  '[role="complementary"]',
  '[role="contentinfo"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="toolbar"]',
  '[role="tablist"]',
  '[class*="profile-header"]',
  '[class*="user-header"]',
  '[class*="sidebar"]',
  '[class*="side-bar"]',
  '[class*="cookie"]',
  '[class*="consent"]',
  '[class*="modal"]',
  '[class*="overlay"]',
  '[class*="popup"]',
  '[class*="toast"]',
  '[class*="ad-slot"]',
  '[class*="ad-container"]',
  '[class*="login"]',
  '[class*="signin"]',
  '[class*="signup"]',
  '[class*="newsletter"]',
  '[class*="subscribe"]',
].join(', ');

const SKIP_TAGS = new Set([
  'script',
  'style',
  'br',
  'hr',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'input',
  'button',
  'svg',
  'img',
  'noscript',
  'link',
  'meta',
]);

const CONTAINER_SELECTOR = 'ul, ol, div[class], section, main, [role="feed"], [role="list"]';

// CSS-module hash pattern: short prefix + random chars (e.g., _aagw, x1lliihq, css-1a2b3c)
const CSS_MODULE_HASH = /^[_a-z]{1,3}[A-Z0-9][A-Za-z0-9]{3,}$|^css-[a-z0-9]+$/;

// ── Discovery Engine ─────────────────────────────────────────────────────────

/**
 * Discover a CSS selector for content cards by testing candidate elements
 * against a platform content signature.
 */
export function discoverCardSelector(
  _platform: Platform,
  signature: ContentSignature,
): { selector: string; feedSelector: string | null; count: number } | null {
  const containers = document.querySelectorAll(CONTAINER_SELECTOR);

  for (const container of containers) {
    // Skip excluded zones
    if (container.closest(EXCLUDED_ANCESTOR_SELECTOR)) continue;

    const children = getValidChildren(container);
    if (children.length < 3) continue;

    // Test each child against the content signature
    const matchingChildren = children.filter((child) => matchesSignature(child, signature));

    if (matchingChildren.length < 3) continue;

    // Build a CSS selector from the first matching child
    const selector = buildSelectorFromElement(matchingChildren[0]!);
    if (!selector) continue;

    // Validate: selector should match multiple elements
    const matches = document.querySelectorAll(selector);
    if (matches.length < 3) continue;

    // Build a feed selector from the container
    const feedSelector = buildSelectorFromElement(container);

    log.info(
      `Discovered card selector: "${selector}" (${matches.length} cards) in feed: "${feedSelector}"`,
    );

    return { selector, feedSelector, count: matches.length };
  }

  // Phase 2: Fall back to repeated-sibling discovery
  return discoverByRepeatedSiblings(signature);
}

/**
 * Discover content cards by finding containers with repeated similarly-structured children.
 * Shared logic extracted from GenericAdapter's discoverRepeatedSiblings.
 */
function discoverByRepeatedSiblings(
  signature: ContentSignature,
): { selector: string; feedSelector: string | null; count: number } | null {
  const containers = document.querySelectorAll(CONTAINER_SELECTOR);

  for (const container of containers) {
    if (container.closest(EXCLUDED_ANCESTOR_SELECTOR)) continue;

    const children = getValidChildren(container);
    if (children.length < 4) continue;

    // Group by structural fingerprint
    const groups = new Map<string, HTMLElement[]>();
    for (const child of children) {
      const key = getStructuralFingerprint(child);
      const arr = groups.get(key) ?? [];
      arr.push(child);
      groups.set(key, arr);
    }

    // Find largest group
    let bestGroup: HTMLElement[] = [];
    for (const g of groups.values()) {
      if (g.length > bestGroup.length) bestGroup = g;
    }
    if (bestGroup.length < 4) continue;

    // Validate group members against signature (if possible) or generic checks
    const validCount = bestGroup.filter((el) => {
      // Try signature first
      if (matchesSignature(el, signature)) return true;
      // Fallback: basic content checks
      const hasMedia = !!el.querySelector('img[src], video, picture');
      const hasSubstantialContent =
        !!el.querySelector('h1, h2, h3, h4, h5, h6') ||
        Array.from(el.querySelectorAll('a[href]')).some(
          (l) => (l.textContent ?? '').trim().length > 15,
        );
      const textLen = (el.textContent ?? '').trim().length;
      const r = el.getBoundingClientRect();
      return (
        (hasMedia || hasSubstantialContent) && textLen >= 30 && r.width >= 120 && r.height >= 80
      );
    }).length;

    if (validCount < bestGroup.length * 0.7) continue;

    const selector = buildSelectorFromElement(bestGroup[0]!);
    if (!selector) continue;

    const matches = document.querySelectorAll(selector);
    if (matches.length < 3) continue;

    const feedSelector = buildSelectorFromElement(container);

    log.info(`Discovered via sibling analysis: "${selector}" (${matches.length} cards)`);

    return { selector, feedSelector, count: matches.length };
  }

  return null;
}

/**
 * Discover a feed container from known card elements.
 * Walks up from cards to find their common ancestor.
 */
export function discoverFeedSelector(cardElements: Element[]): string | null {
  if (cardElements.length < 2) return null;

  // Find closest common ancestor
  let ancestor: Element | null = cardElements[0]!.parentElement;
  while (ancestor && ancestor !== document.body) {
    const containsAll = cardElements.every((card) => ancestor!.contains(card));
    if (containsAll) {
      return buildSelectorFromElement(ancestor);
    }
    ancestor = ancestor.parentElement;
  }

  return null;
}

// ── Selector Builder ─────────────────────────────────────────────────────────

/**
 * Reverse-engineer a CSS selector from a DOM element.
 * Prefers stable semantic classes, falls back to data attributes, then structure.
 */
export function buildSelectorFromElement(element: Element): string | null {
  const tag = element.tagName.toLowerCase();

  // 1. Try data attributes (most stable across updates)
  for (const attr of ['data-testid', 'data-component-type', 'data-automation-id', 'data-type']) {
    const value = element.getAttribute(attr);
    if (value) {
      const selector = `${tag}[${attr}="${value}"]`;
      if (isValidDiscoveredSelector(selector)) return selector;
    }
  }

  // 2. Try role attribute
  const role = element.getAttribute('role');
  if (role && role !== 'presentation') {
    const selector = `${tag}[role="${role}"]`;
    if (isValidDiscoveredSelector(selector)) return selector;
  }

  // 3. Try stable CSS classes (filter out hashed/generated ones)
  const stableClasses = Array.from(element.classList).filter(isStableClass);
  if (stableClasses.length > 0) {
    // Pick the 1-2 most specific classes
    const sorted = stableClasses.sort((a, b) => b.length - a.length);
    const picked = sorted.slice(0, 2);

    // Try single class first (broader match)
    for (const cls of picked) {
      const selector = `${tag}.${cls}`;
      if (isValidDiscoveredSelector(selector)) return selector;
    }

    // Try both classes
    if (picked.length === 2) {
      const selector = `${tag}.${picked[0]}.${picked[1]}`;
      if (isValidDiscoveredSelector(selector)) return selector;
    }
  }

  // 4. Try ID (if it doesn't look auto-generated)
  const id = element.id;
  if (id && !CSS_MODULE_HASH.test(id) && id.length < 40) {
    const selector = `#${CSS.escape(id)}`;
    if (isValidDiscoveredSelector(selector)) return selector;
  }

  // 5. Structural fallback: parent context + tagName
  const parent = element.parentElement;
  if (parent) {
    const parentSelector = buildParentHint(parent);
    if (parentSelector) {
      const selector = `${parentSelector} > ${tag}`;
      if (isValidDiscoveredSelector(selector)) return selector;
    }
  }

  return tag; // absolute last resort
}

/** Check if a class name looks stable (not a CSS-module hash). */
function isStableClass(cls: string): boolean {
  if (cls.length > 40 || cls.length < 2) return false;
  if (CSS_MODULE_HASH.test(cls)) return false;
  // Must contain at least one letter and one of: hyphen, underscore, or be a semantic word
  if (!/[a-z]/i.test(cls)) return false;
  return true;
}

/** Build a minimal parent hint for structural selectors. */
function buildParentHint(parent: Element): string | null {
  const tag = parent.tagName.toLowerCase();

  // Try role
  const role = parent.getAttribute('role');
  if (role && ['feed', 'main', 'list'].includes(role)) return `${tag}[role="${role}"]`;

  // Try data attribute
  for (const attr of ['data-testid', 'data-component-type', 'id']) {
    const value = parent.getAttribute(attr);
    if (value && !CSS_MODULE_HASH.test(value) && value.length < 40) {
      if (attr === 'id') return `#${CSS.escape(value)}`;
      return `${tag}[${attr}="${value}"]`;
    }
  }

  // Try stable class
  const stableClasses = Array.from(parent.classList).filter(isStableClass);
  if (stableClasses.length > 0) {
    return `${tag}.${stableClasses[0]}`;
  }

  return null;
}

/** Validate that a selector matches at least 1 element and isn't too broad. */
function isValidDiscoveredSelector(selector: string): boolean {
  try {
    const count = document.querySelectorAll(selector).length;
    return count >= 1 && count < 500; // Not too narrow, not too broad
  } catch {
    return false;
  }
}

// ── Cache ────────────────────────────────────────────────────────────────────

export async function loadCachedSelectors(domain: string): Promise<CachedSelectors | null> {
  try {
    const key = `${SELECTOR_CACHE_PREFIX}${domain}`;
    const result = await chrome.storage.local.get(key);
    const cached = result[key] as CachedSelectors | undefined;

    if (!cached) return null;

    // TTL check
    if (Date.now() - cached.discoveredAt > SELECTOR_CACHE_TTL_MS) {
      log.debug(`Cached selectors for ${domain} expired`);
      await chrome.storage.local.remove(key);
      return null;
    }

    // Validate: selector must still match at least 1 element
    try {
      const count = document.querySelectorAll(cached.cardSelector).length;
      if (count === 0) {
        log.debug(`Cached card selector for ${domain} no longer matches any elements`);
        await chrome.storage.local.remove(key);
        return null;
      }
    } catch {
      await chrome.storage.local.remove(key);
      return null;
    }

    log.debug(`Loaded cached selectors for ${domain}: "${cached.cardSelector}" `);
    return cached;
  } catch {
    return null;
  }
}

export async function saveCachedSelectors(
  domain: string,
  cardSelector: string,
  feedSelector: string | null,
): Promise<void> {
  try {
    const key = `${SELECTOR_CACHE_PREFIX}${domain}`;
    const data: CachedSelectors = {
      cardSelector,
      feedSelector,
      discoveredAt: Date.now(),
      version: 1,
    };
    await chrome.storage.local.set({ [key]: data });
    log.debug(`Saved discovered selectors for ${domain}`);
  } catch {
    // Storage write failure — non-critical
  }
}

// ── V1 → V2 Migration ────────────────────────────────────────────────────────

/**
 * Migrate V1 domain-level cache entries to V2 path-aware health records.
 * Reads all `recome_selectors_*` keys and writes them as V2 records with pathPattern 'default'.
 * Runs once — after migration, V1 entries are removed.
 */
export async function migrateLegacyCache(domain: string): Promise<SelectorHealthRecord | null> {
  try {
    const v1Key = `${SELECTOR_CACHE_PREFIX}${domain}`;
    const result = await chrome.storage.local.get(v1Key);
    const cached = result[v1Key] as CachedSelectors | undefined;

    if (!cached) return null;

    // Skip expired V1 entries
    if (Date.now() - cached.discoveredAt > SELECTOR_CACHE_TTL_MS) {
      await chrome.storage.local.remove(v1Key);
      return null;
    }

    // Create a V2 health record from the V1 entry
    const record = createHealthRecord(
      cached.cardSelector,
      cached.feedSelector,
      'default',
      0, // baseline unknown — will be set on first check
    );
    record.discoveredAt = cached.discoveredAt;
    record.healthScore = 1.0; // assume healthy at migration time

    // Save as V2 and remove V1
    await savePathAwareCache(domain, 'default', record);
    await chrome.storage.local.remove(v1Key);

    log.info(`Migrated V1 cache for ${domain} to V2 format`);
    return record;
  } catch {
    return null;
  }
}

// ── Shared Helpers ───────────────────────────────────────────────────────────

/** Get valid (non-structural, non-script) children of a container as HTMLElements. */
export function getValidChildren(container: Element): HTMLElement[] {
  return Array.from(container.children).filter(
    (c): c is HTMLElement => c instanceof HTMLElement && !SKIP_TAGS.has(c.tagName.toLowerCase()),
  );
}

/** Build a structural fingerprint for grouping similar elements. */
export function getStructuralFingerprint(element: HTMLElement): string {
  const classes = Array.from(element.classList).filter(isStableClass).slice(0, 2).sort().join('.');
  return `${element.tagName}.${classes}`;
}

/**
 * Find repeated similarly-structured siblings in a container.
 * Shared between GenericAdapter and SelectorDiscovery.
 */
export function findRepeatedSiblings(container: Element, minCount = 4): HTMLElement[] {
  const children = getValidChildren(container);
  if (children.length < minCount) return [];

  const groups = new Map<string, HTMLElement[]>();
  for (const child of children) {
    const key = getStructuralFingerprint(child);
    const arr = groups.get(key) ?? [];
    arr.push(child);
    groups.set(key, arr);
  }

  let bestGroup: HTMLElement[] = [];
  for (const g of groups.values()) {
    if (g.length > bestGroup.length) bestGroup = g;
  }

  return bestGroup.length >= minCount ? bestGroup : [];
}
