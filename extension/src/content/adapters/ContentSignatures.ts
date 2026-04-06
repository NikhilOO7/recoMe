import type { Platform } from '@shared/types';

// ── Content Signature System ─────────────────────────────────────────────────
//
// Each platform defines structural "signals" that a DOM element must exhibit
// to be considered a content card. When hardcoded selectors fail, the discovery
// engine tests candidate elements against these signatures to identify cards.

export interface ContentSignal {
  name: string;
  test: (el: Element) => boolean;
  weight: number; // 1-3; higher = more definitive
}

export interface ContentSignature {
  platform: Platform;
  /** Minimum weighted score to qualify as a content card */
  minScore: number;
  /** Structural tests — element gets sum of passed signal weights */
  signals: ContentSignal[];
  /** Hard requirements — if any fail, element is rejected regardless of score */
  required?: Array<(el: Element) => boolean>;
  /** Minimum card dimensions (px) */
  minWidth?: number;
  minHeight?: number;
}

// ── Shared test helpers ──────────────────────────────────────────────────────

const PRICE_REGEX = /[$\u20AC\u00A3\u00A5]\s?\d[\d,]*\.?\d*|\d[\d.,]+\s?(?:USD|EUR|GBP)/;

function hasImage(el: Element, minWidth = 80): boolean {
  const img = el.querySelector('img[src]') as HTMLImageElement | null;
  if (img) {
    // Check natural/rendered width if available
    if (img.naturalWidth > 0) return img.naturalWidth >= minWidth;
    const rect = img.getBoundingClientRect();
    return rect.width >= minWidth;
  }
  return !!el.querySelector('video, picture');
}

function hasTextLength(el: Element, min: number): boolean {
  return (el.textContent ?? '').trim().length >= min;
}

function hasLinkMatching(el: Element, pattern: RegExp): boolean {
  return Array.from(el.querySelectorAll('a[href]')).some((a) =>
    pattern.test((a as HTMLAnchorElement).href),
  );
}

function hasHeading(el: Element): boolean {
  return !!el.querySelector('h1, h2, h3, h4, h5, h6');
}

function hasPrice(el: Element): boolean {
  return PRICE_REGEX.test(el.textContent ?? '');
}

// ── Platform Signatures ──────────────────────────────────────────────────────

const youtubeSignature: ContentSignature = {
  platform: 'youtube',
  minScore: 5,
  minWidth: 200,
  minHeight: 100,
  signals: [
    { name: 'thumbnail', test: (el) => hasImage(el, 100), weight: 2 },
    { name: 'text', test: (el) => hasTextLength(el, 20), weight: 2 },
    { name: 'watch-link', test: (el) => hasLinkMatching(el, /\/(watch|shorts)\b/), weight: 3 },
    {
      name: 'channel-text',
      test: (el) => {
        // Secondary text that looks like a channel name (short, single-line)
        const spans = el.querySelectorAll('a[href*="/@"], a[href*="/channel/"]');
        return spans.length > 0;
      },
      weight: 1,
    },
  ],
};

const amazonSignature: ContentSignature = {
  platform: 'amazon',
  minScore: 5,
  minWidth: 150,
  minHeight: 80,
  signals: [
    { name: 'price', test: hasPrice, weight: 3 },
    { name: 'product-image', test: (el) => hasImage(el, 60), weight: 2 },
    {
      name: 'product-link',
      test: (el) =>
        hasLinkMatching(el, /\/dp\//) ||
        !!el.closest('[data-asin]') ||
        !!el.querySelector('[data-asin]'),
      weight: 3,
    },
    {
      name: 'rating',
      test: (el) =>
        !!(
          el.querySelector('[class*="a-star"], [class*="a-icon-star"]') ||
          (el.textContent ?? '').match(/\d\.?\d?\s+out\s+of\s+\d/)
        ),
      weight: 1,
    },
    { name: 'title-text', test: (el) => hasHeading(el) || hasTextLength(el, 15), weight: 1 },
  ],
};

const twitterSignature: ContentSignature = {
  platform: 'twitter',
  minScore: 4,
  minWidth: 300,
  minHeight: 60,
  signals: [
    {
      name: 'tweet-text',
      test: (el) => !!el.querySelector('[data-testid="tweetText"]') || hasTextLength(el, 30),
      weight: 2,
    },
    { name: 'status-link', test: (el) => hasLinkMatching(el, /\/status\/\d+/), weight: 3 },
    {
      name: 'user-info',
      test: (el) =>
        !!el.querySelector('[data-testid="User-Name"]') || hasLinkMatching(el, /\/@\w+/),
      weight: 1,
    },
    { name: 'article-tag', test: (el) => el.tagName === 'ARTICLE', weight: 1 },
  ],
};

const facebookSignature: ContentSignature = {
  platform: 'facebook',
  minScore: 4,
  minWidth: 300,
  minHeight: 80,
  signals: [
    { name: 'media', test: (el) => hasImage(el, 60) || !!el.querySelector('video'), weight: 2 },
    { name: 'text', test: (el) => hasTextLength(el, 30), weight: 2 },
    {
      name: 'creator-link',
      test: (el) =>
        hasLinkMatching(el, /facebook\.com\/[^/?]+/) ||
        !!el.querySelector('h2 a, h3 a, h4 a, strong a'),
      weight: 2,
    },
    {
      name: 'article-role',
      test: (el) => el.matches('[role="article"]') || !!el.querySelector('[role="article"]'),
      weight: 1,
    },
  ],
};

const instagramSignature: ContentSignature = {
  platform: 'instagram',
  minScore: 4,
  minWidth: 200,
  minHeight: 200,
  signals: [
    {
      name: 'media',
      test: (el) => hasImage(el, 100) || !!el.querySelector('video, canvas'),
      weight: 3,
    },
    {
      name: 'post-link',
      test: (el) => hasLinkMatching(el, /\/(p|reel)\/[A-Za-z0-9_-]+/),
      weight: 3,
    },
    {
      name: 'caption',
      test: (el) => !!el.querySelector('span[dir="auto"], h1[dir="auto"]'),
      weight: 1,
    },
    {
      name: 'article-tag',
      test: (el) => el.tagName === 'ARTICLE' || !!el.closest('article'),
      weight: 1,
    },
  ],
};

const ebaySignature: ContentSignature = {
  platform: 'ebay',
  minScore: 5,
  minWidth: 150,
  minHeight: 80,
  signals: [
    { name: 'price', test: hasPrice, weight: 3 },
    { name: 'product-image', test: (el) => hasImage(el, 60), weight: 2 },
    { name: 'item-link', test: (el) => hasLinkMatching(el, /\/itm\/\d+/), weight: 3 },
    { name: 'title', test: (el) => hasTextLength(el, 10), weight: 1 },
  ],
};

const walmartSignature: ContentSignature = {
  platform: 'walmart',
  minScore: 5,
  minWidth: 150,
  minHeight: 80,
  signals: [
    { name: 'price', test: hasPrice, weight: 3 },
    { name: 'product-image', test: (el) => hasImage(el, 60), weight: 2 },
    {
      name: 'product-link',
      test: (el) => hasLinkMatching(el, /\/ip\//) || !!el.querySelector('[data-item-id]'),
      weight: 3,
    },
    { name: 'title', test: (el) => hasTextLength(el, 10), weight: 2 },
  ],
};

/** Generic fallback signature for unknown platforms */
const genericSignature: ContentSignature = {
  platform: 'unknown',
  minScore: 4,
  minWidth: 150,
  minHeight: 80,
  signals: [
    { name: 'media', test: (el) => hasImage(el, 60), weight: 2 },
    { name: 'heading', test: hasHeading, weight: 2 },
    {
      name: 'substantial-link',
      test: (el) =>
        Array.from(el.querySelectorAll('a[href]')).some(
          (a) => (a.textContent ?? '').trim().length > 15,
        ),
      weight: 2,
    },
    { name: 'text', test: (el) => hasTextLength(el, 40), weight: 1 },
  ],
};

// ── Lookup ───────────────────────────────────────────────────────────────────

const SIGNATURES: Record<Platform, ContentSignature> = {
  youtube: youtubeSignature,
  amazon: amazonSignature,
  twitter: twitterSignature,
  facebook: facebookSignature,
  instagram: instagramSignature,
  reddit: genericSignature,
  ebay: ebaySignature,
  walmart: walmartSignature,
  linkedin: genericSignature,
  tiktok: genericSignature,
  indeed: genericSignature,
  glassdoor: genericSignature,
  udemy: genericSignature,
  coursera: genericSignature,
  edx: genericSignature,
  unknown: genericSignature,
};

export function getContentSignature(platform: Platform): ContentSignature {
  return SIGNATURES[platform] ?? genericSignature;
}

/** Test an element against a content signature. Returns true if it qualifies. */
export function matchesSignature(element: Element, signature: ContentSignature): boolean {
  // Check hard requirements first
  if (signature.required) {
    for (const req of signature.required) {
      if (!req(element)) return false;
    }
  }

  // Check minimum dimensions
  if (signature.minWidth || signature.minHeight) {
    const rect = element.getBoundingClientRect();
    if (signature.minWidth && rect.width < signature.minWidth) return false;
    if (signature.minHeight && rect.height < signature.minHeight) return false;
  }

  // Score signals
  let score = 0;
  for (const signal of signature.signals) {
    if (signal.test(element)) score += signal.weight;
  }

  return score >= signature.minScore;
}
