import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import type { ContentMetadata } from '@shared/types';

export class FacebookAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'facebook',
      cardSelector: [
        // Pagelet-based feed units
        'div[data-pagelet^="FeedUnit"]',
        // Reel containers
        'div[data-pagelet^="Reels"]',
        // Video tab
        'div[data-video-id]',
        // Modern feed articles (News Feed + Groups)
        'div[role="article"][aria-label]',
        // Marketplace listings
        'div[aria-label][data-virtualized]',
        // Watch feed
        'div[data-nt="NT:TV_EB"]',
      ].join(', '),
      feedSelector: [
        '[role="feed"]',
        '[role="main"]',
        '#content_container',
        '[aria-label="Reels"]',
        'div[data-pagelet="Home"]',
        'div[data-pagelet="Feed"]',
      ].join(', '),
    });
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
      const creator = nameEl ? extractTextContent(nameEl).trim() : undefined;

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
        !!element.querySelector('a[href*="facebook.com/ads"]') ||
        Array.from(element.querySelectorAll('span')).some(
          (s) => s.textContent?.trim() === 'Sponsored',
        );

      const rawTitle = videoTitle.slice(0, 140) || text.slice(0, 140);
      const title = rawTitle || (creator ? `Post by ${creator}` : 'Facebook post');
      if (!title) return null;

      // Extract hashtags from text
      const hashtags = [...text.matchAll(/#(\w+)/g)].map((m) => m[1]!.toLowerCase());

      return {
        id: this.computeContentHash(element),
        platform: 'facebook',
        type: isAd ? 'ad' : 'post',
        title,
        creator,
        topics: hashtags,
        entities: creator ? [creator] : [],
        url: location.href,
      };
    } catch {
      return null;
    }
  }
}