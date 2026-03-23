// ── Metadata Heuristics ──────────────────────────────────────────────────────
//
// Fallback metadata extraction when platform adapter sub-selectors fail.
// Each function inspects the card's DOM structure and content to extract
// metadata heuristically — less accurate than hardcoded selectors but
// resilient to DOM changes.

const PRICE_REGEX = /[$\u20AC\u00A3\u00A5]\s?\d[\d,]*\.?\d*|\d[\d.,]+\s?(?:USD|EUR|GBP)/;

const CREATOR_CLASS_PATTERNS =
  /author|creator|channel|byline|user-?name|publisher|seller|brand|vendor/i;

/**
 * Find the most likely title text in a card.
 * Priority: largest heading → longest link text → aria-label/title attr.
 */
export function heuristicTitle(card: Element): string {
  // 1. Try headings (h1-h6) — pick the one with most text
  const headings = Array.from(card.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  if (headings.length > 0) {
    let best = '';
    for (const h of headings) {
      const text = (h.textContent ?? '').trim();
      if (text.length > best.length && text.length < 200) best = text;
    }
    if (best) return best;
  }

  // 2. Try links with substantial text
  const links = Array.from(card.querySelectorAll('a[href]'));
  let longestLinkText = '';
  for (const link of links) {
    const text = (link.textContent ?? '').trim();
    if (text.length > longestLinkText.length && text.length > 15 && text.length < 200) {
      longestLinkText = text;
    }
  }
  if (longestLinkText) return longestLinkText;

  // 3. Try aria-label or title attributes
  const labeled = card.querySelector('[aria-label], [title]');
  if (labeled) {
    const label =
      labeled.getAttribute('aria-label')?.trim() ?? labeled.getAttribute('title')?.trim() ?? '';
    if (label.length > 10 && label.length < 200) return label;
  }

  // 4. Fallback: first substantial text block
  const text = (card.textContent ?? '').trim();
  if (text.length > 10) return text.slice(0, 140);

  return '';
}

/**
 * Find the most likely creator/author name in a card.
 * Looks for semantic class patterns, rel="author", and avatar-adjacent text.
 */
export function heuristicCreator(card: Element): string | undefined {
  // 1. Elements with author/creator/channel class names
  const allElements = Array.from(card.querySelectorAll('*'));
  for (const el of allElements) {
    if (CREATOR_CLASS_PATTERNS.test(el.className)) {
      const text = (el.textContent ?? '').trim();
      if (text.length > 1 && text.length < 80) return text;
    }
  }

  // 2. rel="author" or <cite> elements
  const authorEl = card.querySelector('[rel="author"], cite');
  if (authorEl) {
    const text = (authorEl.textContent ?? '').trim();
    if (text.length > 1 && text.length < 80) return text;
  }

  // 3. Text near a small avatar image
  const smallImgs = Array.from(card.querySelectorAll('img'));
  for (const img of smallImgs) {
    const rect = img.getBoundingClientRect();
    const isAvatar =
      (rect.width > 0 && rect.width <= 50 && rect.height <= 50) ||
      /avatar|profile|user/i.test(img.className) ||
      /avatar|profile|user/i.test(img.alt ?? '');

    if (isAvatar) {
      // Look at the next sibling or parent for text
      const parent = img.parentElement;
      if (parent) {
        const sibling = parent.nextElementSibling ?? parent;
        const text = (sibling.textContent ?? '').trim().split('\n')[0]?.trim() ?? '';
        if (text.length > 1 && text.length < 80) return text;
      }
    }
  }

  return undefined;
}

/**
 * Find a price in the card's text content.
 */
export function heuristicPrice(card: Element): { text: string; value: number } | undefined {
  const text = card.textContent ?? '';
  const match = text.match(PRICE_REGEX);
  if (!match) return undefined;

  const priceText = match[0];
  // Extract numeric value
  const cleaned = priceText.replace(/[^\d.,]/g, '').trim();
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');

  let value: number;
  if (lastComma > lastDot) {
    // EU format
    value = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  } else {
    // US format
    value = parseFloat(cleaned.replace(/,/g, ''));
  }

  return isNaN(value) ? undefined : { text: priceText, value };
}

/**
 * Find the most likely primary URL for the content.
 * Prefers platform content URL patterns, falls back to longest href.
 */
export function heuristicUrl(card: Element): string {
  const CONTENT_URL_PATTERNS = [
    /\/watch\?v=/, // YouTube
    /\/shorts\//, // YouTube Shorts
    /\/dp\//, // Amazon products
    /\/itm\/\d+/, // eBay items
    /\/ip\//, // Walmart products
    /\/status\/\d+/, // Twitter
    /\/(p|reel)\/[A-Za-z0-9_-]+/, // Instagram
  ];

  const links = Array.from(card.querySelectorAll('a[href]')) as HTMLAnchorElement[];
  if (links.length === 0) return location.href;

  // Prefer links matching known content URL patterns
  for (const pattern of CONTENT_URL_PATTERNS) {
    const match = links.find((a) => pattern.test(a.href));
    if (match) return match.href;
  }

  // Fallback: pick the longest same-origin href (likely the main content link)
  let best = '';
  const origin = location.origin;
  for (const link of links) {
    if (link.href.startsWith(origin) && link.href.length > best.length) {
      best = link.href;
    }
  }

  return best || (links[0]?.href ?? location.href);
}

/**
 * Find the largest image in the card (by rendered dimensions).
 */
export function heuristicImage(card: Element): string | undefined {
  const imgs = Array.from(card.querySelectorAll('img[src]')) as HTMLImageElement[];
  if (imgs.length === 0) return undefined;

  let largest: HTMLImageElement | null = null;
  let largestArea = 0;

  for (const img of imgs) {
    const rect = img.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > largestArea) {
      largestArea = area;
      largest = img;
    }
  }

  return largest?.src ?? undefined;
}
