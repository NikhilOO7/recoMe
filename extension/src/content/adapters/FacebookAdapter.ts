import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import { heuristicTitle, heuristicCreator } from './MetadataHeuristics';
import type { ContentMetadata } from '@shared/types';
import { createLogger } from '@shared/Logger';

const log = createLogger('FacebookAdapter');

export class FacebookAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'facebook',
      cardSelector: [
        // ARIA-based selectors (most durable — accessibility requirements)
        'div[role="article"][aria-label]',
        'div[role="article"]',
        // Pagelet-based feed units (data attributes — can rotate)
        'div[data-pagelet^="FeedUnit"]',
        'div[data-pagelet^="Reels"]',
        // Video tab
        'div[data-video-id]',
        // Marketplace listings
        'div[aria-label][data-virtualized]',
        // Watch feed
        'div[data-nt="NT:TV_EB"]',
        // Fallback: deeply-nested post wrappers
        'div[data-pagelet] div[role="article"]',

        // ── Marketplace page cards ────────────────────────────────────
        'div[data-pagelet="MarketplaceFeed"] a[href*="/marketplace/item/"]',
        'a[href*="/marketplace/item/"]',
        '[data-testid="marketplace_feed_item"]',
        'div[data-pagelet="BrowseFeed"] div[role="listitem"]',

        // ── Groups feed ───────────────────────────────────────────────
        'div[data-pagelet="GroupFeed"] div[role="article"]',
        'div[data-pagelet^="GroupsFeed"] div[role="article"]',

        // ── Watch / Video tab ─────────────────────────────────────────
        'div[data-pagelet="WatchFeed"] div[role="article"]',
        'div[data-pagelet="VideoHome"] div[role="article"]',
        'div[data-pagelet^="Video"] div[role="article"]',

        // ── Reels tab ─────────────────────────────────────────────────
        'div[data-pagelet="ReelsFeed"] div[role="article"]',
        'div[aria-label="Reels"] div[role="article"]',

        // ── Stories tray ──────────────────────────────────────────────
        'div[data-pagelet="Stories"] div[role="button"]',
        'div[aria-label="Stories"] div[role="listitem"]',
      ].join(', '),
      feedSelector: [
        '[role="feed"]',
        '[role="main"]',
        '#content_container',
        '[aria-label="Reels"]',
        'div[data-pagelet="Home"]',
        'div[data-pagelet="Feed"]',
        // Marketplace
        'div[data-pagelet="MarketplaceFeed"]',
        'div[data-pagelet="BrowseFeed"]',
        // Groups
        'div[data-pagelet="GroupFeed"]',
        'div[data-pagelet^="GroupsFeed"]',
        // Watch / Video
        'div[data-pagelet="WatchFeed"]',
        'div[data-pagelet="VideoHome"]',
        // Reels
        'div[data-pagelet="ReelsFeed"]',
        '[aria-label="Reels"]',
        // Stories
        'div[data-pagelet="Stories"]',
        '[aria-label="Stories"]',
        // Fallback — Facebook may restructure containers but main is stable
        'main',
      ].join(', '),
    });
  }

  /** Detect the current Facebook page mode for page-specific behavior */
  private detectPageMode():
    | 'feed'
    | 'marketplace'
    | 'groups'
    | 'watch'
    | 'reels'
    | 'stories'
    | 'profile'
    | 'unknown' {
    const path = location.pathname;
    if (path.startsWith('/marketplace')) return 'marketplace';
    if (path.startsWith('/groups')) return 'groups';
    if (path.startsWith('/watch') || path.startsWith('/video')) return 'watch';
    if (path.startsWith('/reel')) return 'reels';
    if (path.startsWith('/stories')) return 'stories';
    if (path === '/' || path === '/home') return 'feed';
    // Check if it's a profile page (single-segment path that isn't a known route)
    if (/^\/[^/]+\/?$/.test(path) && !path.startsWith('/settings')) return 'profile';
    return 'unknown';
  }

  /**
   * Validate Facebook cards before processing.
   * Facebook aggressively obfuscates class names; cards that match by selector
   * may be empty shells. Verify they contain actual content.
   */
  protected override onCardFound(element: Element): void {
    // Reject empty obfuscated shells but accept image/video posts with short captions
    const hasMedia = !!element.querySelector(
      'img[src], video, [data-video-id], [aria-label*="video"], [aria-label*="photo"]',
    );
    const text = (element.textContent ?? '').trim();

    // Accept if: has media (even with short text), or text is substantial
    if (!hasMedia && text.length < 20) return;

    const hasLink = Array.from(element.querySelectorAll('a[href]')).some(
      (a) => (a.textContent ?? '').trim().length > 3,
    );
    if (!hasLink && !hasMedia) {
      log.debug('Card rejected — no links or media (possible obfuscated shell)');
      return;
    }

    super.onCardFound(element);
  }

  extractMetadata(element: Element): ContentMetadata | null {
    try {
      // ── Creator name ──────────────────────────────────────────────────────
      const nameEl =
        element.querySelector('h2 a') ??
        element.querySelector('h3 a') ??
        element.querySelector('h4 a') ??
        element.querySelector('strong a') ??
        element.querySelector('a[role="link"] strong') ??
        // Page posts have the page name here
        element.querySelector('a[href*="facebook.com"][aria-label]');
      let creator = nameEl ? extractTextContent(nameEl).trim() : undefined;
      if (!creator) creator = heuristicCreator(element) ?? undefined;

      // ── Post text ─────────────────────────────────────────────────────────
      const textEl =
        element.querySelector('[data-ad-preview="message"]') ??
        element.querySelector('[data-ad-comet-preview="message"]') ??
        element.querySelector('div[dir="auto"] span[dir="auto"]') ??
        element.querySelector('div[dir="auto"]') ??
        // Watch/Video posts use this
        element.querySelector('[data-testid="post_message"]');
      const text = textEl ? extractTextContent(textEl).slice(0, 240) : '';

      // ── Reel/video title ──────────────────────────────────────────────────
      const videoTitle =
        element.querySelector('[data-pagelet^="Reels"] span')?.textContent?.trim() ??
        element.querySelector('[data-video-id] span')?.textContent?.trim() ??
        // aria-label often contains content description
        element.getAttribute('aria-label') ??
        '';

      // ── Ad detection ──────────────────────────────────────────────────────
      const isAd =
        !!element.querySelector('[aria-label="Sponsored"]') ||
        !!element.querySelector('[aria-label*="Sponsored"]') ||
        !!element.querySelector('a[href*="facebook.com/ads"]') ||
        !!element.querySelector('a[href*="/ads/about"]') ||
        Array.from(element.querySelectorAll('span, a')).some(
          (s) =>
            s.textContent?.trim() === 'Sponsored' ||
            s.textContent?.trim() === 'Paid partnership' ||
            s.textContent?.trim() === 'Active ad',
        );

      const rawTitle = videoTitle.slice(0, 140) || text.slice(0, 140);
      let title = rawTitle || (creator ? `Post by ${creator}` : '');
      if (!title)
        title = heuristicTitle(element) ?? (creator ? `Post by ${creator}` : 'Facebook post');
      if (!title) return null;

      // Extract hashtags from text
      const hashtags = [...text.matchAll(/#(\w+)/g)].map((m) => m[1]!.toLowerCase());

      // Page-mode-aware type detection
      const pageMode = this.detectPageMode();
      type ContentType = 'ad' | 'post' | 'product' | 'video';
      let contentType: ContentType = isAd ? 'ad' : 'post';
      if (pageMode === 'marketplace') contentType = isAd ? 'ad' : 'product';
      else if (pageMode === 'reels' || pageMode === 'stories') contentType = 'video';
      else if (pageMode === 'watch') contentType = 'video';

      // Marketplace-specific: extract price and item URL
      const marketplaceLink = element.querySelector(
        'a[href*="/marketplace/item/"]',
      ) as HTMLAnchorElement | null;
      const itemUrl = marketplaceLink?.href ?? location.href;
      const marketplaceId = itemUrl.match(/\/marketplace\/item\/(\d+)/)?.[1];

      return {
        id: marketplaceId ?? this.computeContentHash(element),
        platform: 'facebook',
        type: contentType,
        title,
        creator,
        topics: hashtags,
        entities: creator ? [creator] : [],
        url: itemUrl,
        raw_metadata: pageMode !== 'feed' ? { pageMode } : undefined,
      };
    } catch {
      return null;
    }
  }
}
