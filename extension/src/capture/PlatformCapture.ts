/**
 * One PlatformCapture per supported platform. Each implements extract() to
 * pull the current page's topics + entities from the DOM. The output is fed
 * to the dwell + search triggers in this folder which emit Signal payloads
 * via CAPTURE_SIGNAL messages.
 *
 * Adapters MUST NOT score, filter, or render anything. That's Phase 2.
 */

import type { Platform, SignalEntity, SignalTopic } from '@shared/types';

export interface PageExtract {
  topics: SignalTopic[];
  entities: SignalEntity[];
  pageTitle: string;
  pageUrl: string;
  /** Stable content id (e.g. YouTube video id) — used as part of dedupe. */
  contentId?: string;
  /** Optional hint about what kind of page this is (PDP, watch, search, post…). */
  pageKind?: string;
}

export abstract class PlatformCapture {
  abstract readonly platform: Platform;
  abstract extract(): PageExtract | null;

  /** Default implementation works on most platforms; override if needed. */
  pageKind(): string {
    return 'page';
  }
}

// ── Helpers shared by per-platform captures ──────────────────────────────────

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
  'my',
  'thoughts',
  'opinion',
  'honest',
  'real',
  'truth',
  'tier',
  'list',
  'help',
  'just',
  'got',
  'anyone',
  'does',
  'have',
  'which',
  'looking',
  'need',
  'want',
  'between',
  'better',
  'good',
  'advice',
  'recommendation',
]);

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

const CATEGORIES: Array<[RegExp, string]> = [
  [/headphones?|headsets?|over-?ears?|on-?ears?|wh-?1000|xm[345]/i, 'headphones'],
  [/earbuds?|in-?ears?|iems?|airpods?|wf-?1000|galaxy\s?buds/i, 'earbuds'],
  [/laptops?|notebooks?|ultrabooks?/i, 'laptops'],
  [/phones?|smartphones?|iphones?|androids?|pixels?|galaxy/i, 'smartphones'],
  [/tablets?|ipads?/i, 'tablets'],
  [/monitors?|displays?/i, 'monitors'],
  [/keyboards?|keycaps?|mechanical/i, 'keyboards'],
  [/mouse|mice|trackpads?/i, 'mouse'],
  [/cameras?|dslrs?|mirrorless/i, 'cameras'],
  [/speakers?|soundbars?/i, 'speakers'],
  [/tvs?|televisions?|oleds?/i, 'tvs'],
  [/standing\s?desks?|sit\s?stand/i, 'standing desks'],
  [/watches?|smartwatches?|wearables?/i, 'smartwatches'],
  [/shoes?|sneakers?|boots?|running/i, 'shoes'],
];

/** Tokenize a title into meaningful topic words (skip noise/brands/model nums). */
export function tokenizeTitle(title: string, max = 6): string[] {
  const lower = title.toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const w of lower.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)) {
    if (w.length < 4) continue;
    if (NOISE.has(w)) continue;
    if (KNOWN_BRANDS.has(w)) continue;
    if (/^\d+$/.test(w)) continue;
    if (/^[a-z]{1,2}\d+/.test(w)) continue; // model nums like wh1000xm5
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

/** Extract category topics + brand entities from a piece of text. */
export function extractCategoriesAndBrands(
  text: string,
  platform: Platform,
): {
  topics: SignalTopic[];
  entities: SignalEntity[];
} {
  const lower = text.toLowerCase();
  const topics: SignalTopic[] = [];
  const entities: SignalEntity[] = [];

  for (const [pattern, name] of CATEGORIES) {
    if (pattern.test(lower)) topics.push({ name });
  }
  for (const brand of KNOWN_BRANDS) {
    if (lower.includes(brand)) {
      entities.push({
        name: brand.charAt(0).toUpperCase() + brand.slice(1),
        kind: 'brand',
        platform,
      });
    }
  }
  return { topics, entities };
}

/** Find text content of the first selector that matches; trimmed; nullable. */
export function pickText(...selectors: string[]): string {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const text = el?.textContent?.trim();
    if (text) return text;
  }
  return '';
}
