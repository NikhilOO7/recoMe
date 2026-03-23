import type { RawImportItem } from '../types';

/**
 * LiveScrapeParser — utility helpers for DOM-based extraction.
 *
 * Shared across platform importers for common scraping patterns.
 */

/** Safely extract text from a selector */
export function scrapeText(root: ParentNode, selector: string): string {
  return root.querySelector(selector)?.textContent?.trim() ?? '';
}

/** Safely extract attribute from a selector */
export function scrapeAttr(root: ParentNode, selector: string, attr: string): string {
  return root.querySelector(selector)?.getAttribute(attr) ?? '';
}

/** Extract all matching elements' text */
export function scrapeAllText(root: ParentNode, selector: string): string[] {
  return Array.from(root.querySelectorAll(selector))
    .map((el) => el.textContent?.trim() ?? '')
    .filter(Boolean);
}

/** Extract all href values from matching links */
export function scrapeAllLinks(root: ParentNode, selector: string): string[] {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>(selector))
    .map((el) => el.href)
    .filter(Boolean);
}

/**
 * Scroll the page to load more content (for infinite scroll pages).
 * Returns the number of new items found after scrolling.
 *
 * @param itemSelector - Selector for items to count
 * @param maxScrolls - Maximum scroll attempts
 * @param scrollDelay - Delay between scrolls in ms
 */
export async function scrollToLoadMore(
  itemSelector: string,
  maxScrolls: number = 10,
  scrollDelay: number = 1500,
): Promise<number> {
  const initialCount = document.querySelectorAll(itemSelector).length;
  let previousCount = initialCount;
  let staleScrolls = 0;

  for (let i = 0; i < maxScrolls; i++) {
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(scrollDelay);

    const currentCount = document.querySelectorAll(itemSelector).length;
    if (currentCount === previousCount) {
      staleScrolls++;
      if (staleScrolls >= 2) break; // No new items after 2 scrolls
    } else {
      staleScrolls = 0;
    }
    previousCount = currentCount;
  }

  return previousCount - initialCount;
}

/**
 * Extract structured data from a list of DOM elements.
 */
export function scrapeItemList(
  root: ParentNode,
  containerSelector: string,
  extractors: {
    title: string | ((el: Element) => string);
    url?: string | ((el: Element) => string);
    date?: string | ((el: Element) => string);
    metadata?: Record<string, string | ((el: Element) => string)>;
  },
): RawImportItem[] {
  const items: RawImportItem[] = [];
  const containers = root.querySelectorAll(containerSelector);

  for (const el of containers) {
    const title =
      typeof extractors.title === 'string'
        ? scrapeText(el, extractors.title)
        : extractors.title(el);

    if (!title) continue;

    const url = extractors.url
      ? typeof extractors.url === 'string'
        ? scrapeAttr(el, extractors.url, 'href')
        : extractors.url(el)
      : undefined;

    const dateStr = extractors.date
      ? typeof extractors.date === 'string'
        ? scrapeText(el, extractors.date)
        : extractors.date(el)
      : undefined;

    const timestamp = dateStr ? new Date(dateStr).getTime() : undefined;

    const metadata: Record<string, unknown> = {};
    if (extractors.metadata) {
      for (const [key, extractor] of Object.entries(extractors.metadata)) {
        metadata[key] = typeof extractor === 'string' ? scrapeText(el, extractor) : extractor(el);
      }
    }

    items.push({
      externalId: `scrape_${url ?? title.slice(0, 40)}`,
      title,
      url: url || undefined,
      timestamp: timestamp && !isNaN(timestamp) ? timestamp : undefined,
      interactionType: 'watched',
      metadata,
    });
  }

  return items;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
