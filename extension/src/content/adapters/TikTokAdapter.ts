import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import { heuristicCreator, heuristicUrl } from './MetadataHeuristics';
import type { ContentMetadata } from '@shared/types';

export class TikTokAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'tiktok',
      cardSelector: [
        // For You / Following feed items
        'div[data-e2e="recommend-list-item-container"]',
        'div[class*="DivItemContainer"]',
        // Video player wrappers on individual video pages
        'div[data-e2e="browse-video"]',
        // Search result items
        'div[data-e2e="search_top-item"]',
        'div[data-e2e="search-card-desc"]',
        // User video grid items (profile page)
        'div[data-e2e="user-post-item"]',
        // Explore page items
        'div[data-e2e="explore-item"]',
        // Generic video card wrappers
        'div[class*="DivVideoFeedV2"]',
        'div[class*="VideoCard"]',
      ].join(', '),
      feedSelector: [
        'div[data-e2e="recommend-list-item-container"]',
        'div[data-e2e="user-post-item-list"]',
        'div[id="app"]',
        'main',
        '#main-content-video_detail',
      ].join(', '),
    });
  }

  protected override isUserInitiatedSearch(): boolean {
    return location.pathname.startsWith('/search');
  }

  extractMetadata(element: Element): ContentMetadata | null {
    try {
      // Creator / username
      const creatorEl =
        element.querySelector('a[data-e2e="video-author-uniqueid"]') ??
        element.querySelector('[data-e2e="browse-username"]') ??
        element.querySelector('a[href^="/@"] span') ??
        element.querySelector('a[href^="/@"]');
      let creator = creatorEl?.textContent?.trim() || undefined;
      if (!creator) creator = heuristicCreator(element) ?? undefined;

      // Video description / caption
      const descEl =
        element.querySelector('[data-e2e="video-desc"]') ??
        element.querySelector('[data-e2e="browse-video-desc"]') ??
        element.querySelector('[class*="DivVideoInfoContainer"] span');
      const descText = descEl ? extractTextContent(descEl) : '';

      const title = descText.slice(0, 140) || (creator ? `Video by @${creator}` : 'TikTok video');

      // Video URL — try to extract from a link
      const linkEl = element.querySelector('a[href*="/video/"]') as HTMLAnchorElement | null;
      let href = linkEl?.href ?? '';
      if (!href) href = heuristicUrl(element) ?? location.href;
      const videoIdMatch = href.match(/\/video\/(\d+)/);
      const id = videoIdMatch?.[1] ?? this.computeContentHash(element);

      // Detect promoted/sponsored content
      const isAd =
        !!element.querySelector('[data-e2e*="ad"]') ||
        !!element.querySelector('[class*="SpanAdBadge"]') ||
        Array.from(element.querySelectorAll('span')).some(
          (s) =>
            s.textContent?.trim() === 'Sponsored' ||
            s.textContent?.trim() === 'Ad' ||
            s.textContent?.trim() === 'Promoted',
        );

      // Extract hashtags from description
      const hashtags = [...descText.matchAll(/#(\w+)/g)].map((m) => m[1]!.toLowerCase());

      return {
        id,
        platform: 'tiktok',
        type: isAd ? 'ad' : 'video',
        title,
        creator,
        topics: hashtags,
        entities: creator ? [creator] : [],
        url: href,
      };
    } catch {
      return null;
    }
  }
}
