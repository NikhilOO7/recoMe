import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import { heuristicTitle, heuristicCreator, heuristicUrl } from './MetadataHeuristics';
import type { ContentMetadata } from '@shared/types';

/**
 * YouTubeAdapter — covers home feed, subscriptions, search results,
 * watch page sidebar, Shorts, channel pages, playlists, and trending.
 *
 * Sprint 1 (P1.2): Added page-type detection, Shorts-specific extraction,
 * channel page cards, subscription feed, duration/view count metadata,
 * and better ad detection for in-feed promoted content.
 */

type YTPageType =
  | 'home'
  | 'search'
  | 'watch'
  | 'shorts'
  | 'channel'
  | 'playlist'
  | 'subscriptions'
  | 'trending'
  | 'unknown';

export class YouTubeAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'youtube',
      cardSelector: [
        // ── Home feed, subscriptions, search ────────────────────────────
        'ytd-rich-item-renderer',
        'ytd-video-renderer',
        'ytd-compact-video-renderer',

        // ── Grid views (channels, playlists, trending) ──────────────────
        'ytd-grid-video-renderer',

        // ── Shorts shelf items ──────────────────────────────────────────
        'ytd-shorts-lockup-view-model',
        'ytd-reel-item-renderer',
        // Shorts shelf container (renders individual short items)
        'ytd-reel-shelf-renderer ytd-shorts-lockup-view-model',
        // Shorts in full-screen vertical scroll
        'ytd-reel-video-renderer',

        // ── Watch page sidebar / up next ────────────────────────────────
        'ytd-compact-radio-renderer',
        // Related video in sidebar
        'ytd-compact-link-renderer',

        // ── Playlist panels ─────────────────────────────────────────────
        'ytd-playlist-panel-video-renderer',
        'ytd-playlist-video-renderer',

        // ── Search mix / radio results ──────────────────────────────────
        'ytd-radio-renderer',

        // ── Channel page sections ───────────────────────────────────────
        'ytd-channel-video-player-renderer',
        'ytd-channel-featured-content-renderer',
        // Channel about / featured channels
        'ytd-mini-channel-renderer',

        // ── Live streams ────────────────────────────────────────────────
        'ytd-rich-item-renderer:has([aria-label*="LIVE"])',
      ].join(', '),
      feedSelector: [
        'ytd-browse',
        'ytd-search',
        '#primary',
        'ytd-two-column-browse-results-renderer',
        'ytd-page-manager',
        // Watch page secondary column (sidebar)
        '#secondary',
        'ytd-watch-next-secondary-results-renderer',
        // Shorts container
        'ytd-shorts',
        '#shorts-container',
      ].join(', '),
    });
  }

  detectPageType(): YTPageType {
    const path = location.pathname;
    if (path === '/' || path === '/feed') return 'home';
    if (path === '/results') return 'search';
    if (path === '/watch') return 'watch';
    if (path.startsWith('/shorts')) return 'shorts';
    if (path.startsWith('/@') || path.startsWith('/channel/') || path.startsWith('/c/'))
      return 'channel';
    if (path.startsWith('/playlist')) return 'playlist';
    if (path === '/feed/subscriptions') return 'subscriptions';
    if (path === '/feed/trending') return 'trending';
    return 'unknown';
  }

  protected override isUserInitiatedSearch(): boolean {
    return window.location.pathname === '/results';
  }

  extractMetadata(element: Element): ContentMetadata | null {
    try {
      const pageType = this.detectPageType();

      // Shorts have a different extraction path
      const isShorts =
        pageType === 'shorts' ||
        element.matches(
          'ytd-reel-item-renderer, ytd-shorts-lockup-view-model, ytd-reel-video-renderer',
        );

      // Title — try multiple selectors in priority order
      const titleEl =
        element.querySelector('#video-title') ??
        element.querySelector('#video-title-link') ??
        element.querySelector('a#video-title') ??
        element.querySelector('h3 a') ??
        element.querySelector('h3 span') ??
        // Shorts overlays
        element.querySelector('.reel-item-metadata h3') ??
        element.querySelector('[title]:not([title=""])');

      let title = titleEl ? titleEl.getAttribute('title') || extractTextContent(titleEl) : '';
      if (!title) title = heuristicTitle(element) ?? '';
      if (!title) return null;

      // Channel name
      const channelEl =
        element.querySelector('ytd-channel-name yt-formatted-string') ??
        element.querySelector('#channel-name yt-formatted-string') ??
        element.querySelector('ytd-channel-name') ??
        element.querySelector('#channel-name') ??
        element.querySelector('.ytd-channel-name') ??
        element.querySelector('a.yt-simple-endpoint[href^="/@"]') ??
        element.querySelector('a.yt-simple-endpoint[href^="/channel/"]') ??
        // Shorts overlay author
        element.querySelector('.reel-item-metadata a[href^="/@"]');
      let creator = channelEl ? extractTextContent(channelEl).trim() || undefined : undefined;
      if (!creator) creator = heuristicCreator(element) ?? undefined;

      // Video ID from watch link or shorts link
      let href = '';
      let videoId = '';

      if (isShorts) {
        const shortsLink = element.querySelector('a[href*="/shorts/"]') as HTMLAnchorElement | null;
        href = shortsLink?.href ?? '';
        const shortsIdMatch = href.match(/\/shorts\/([A-Za-z0-9_-]+)/);
        videoId = shortsIdMatch?.[1] ?? '';
      }

      if (!videoId) {
        const linkEl = element.querySelector('a[href*="/watch"]') as HTMLAnchorElement | null;
        href = linkEl?.href ?? href;
        if (!href) href = heuristicUrl(element) ?? '';
        const videoIdMatch = href.match(/[?&]v=([^&]+)/);
        videoId = videoIdMatch?.[1] ?? this.computeContentHash(element);
      }

      // Detect ads — covers promoted videos, overlay ads, and sponsored shelves
      const isAd =
        !!element.querySelector('.ytd-promoted-sparkles-web-renderer') ||
        !!element.querySelector('[aria-label="Ad"]') ||
        !!element.querySelector('.ytd-ad-slot-renderer') ||
        !!element.querySelector('ytd-promoted-video-renderer') ||
        !!element.querySelector('[id^="ad-slot"]') ||
        !!element.querySelector('.badge-style-type-ad') ||
        !!element.closest('ytd-ad-slot-renderer') ||
        !!element.querySelector('[overlay-style="SHORTS_AD"]') ||
        element.textContent?.includes('Sponsored') === true ||
        element.textContent?.includes('Contains paid promotion') === true;

      // Extract topics from title keywords
      const topics = extractKeywordsFromText(title);

      // Duration and view count for ranking context
      const metaLine = element.querySelector('#metadata-line')?.textContent?.trim() ?? '';
      const durationEl = element.querySelector(
        'ytd-thumbnail-overlay-time-status-renderer span, .badge-shape-wiz__text',
      );
      const duration = durationEl?.textContent?.trim() ?? '';

      // Live badge
      const isLive =
        !!element.querySelector('[aria-label*="LIVE"]') ||
        !!element.querySelector('.badge-style-type-live-now');

      return {
        id: videoId,
        platform: 'youtube',
        type: isAd ? 'ad' : isShorts ? 'video' : 'video',
        title,
        creator,
        topics,
        entities: creator ? [creator] : [],
        url: href || location.href,
        raw_metadata: {
          meta_text: metaLine,
          ...(duration ? { duration } : {}),
          ...(isShorts ? { is_short: true } : {}),
          ...(isLive ? { is_live: true } : {}),
        },
      };
    } catch {
      return null;
    }
  }
}

/** Simple keyword extractor for common content categories */
function extractKeywordsFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];

  const categories: Record<string, string[]> = {
    gaming: [
      'gaming',
      'game',
      'gameplay',
      'playthrough',
      'walkthrough',
      'esports',
      'twitch',
      'minecraft',
      'fortnite',
      'cod',
      'roblox',
      'valorant',
    ],
    crypto: [
      'crypto',
      'bitcoin',
      'ethereum',
      'nft',
      'blockchain',
      'web3',
      'defi',
      'altcoin',
      'btc',
      'eth',
    ],
    politics: [
      'politics',
      'election',
      'democrat',
      'republican',
      'congress',
      'senate',
      'president',
      'government',
      'biden',
      'trump',
    ],
    finance: [
      'stock',
      'invest',
      'trading',
      'market',
      'forex',
      'etf',
      'portfolio',
      'dividend',
      'earnings',
      'revenue',
    ],
    tech: [
      'technology',
      'software',
      'programming',
      'coding',
      'developer',
      'javascript',
      'python',
      'ai ',
      'machine learning',
      'react',
    ],
    fitness: [
      'fitness',
      'workout',
      'exercise',
      'gym',
      'weight loss',
      'muscle',
      'running',
      'yoga',
      'diet',
      'nutrition',
    ],
    food: ['recipe', 'cooking', 'food', 'baking', 'meal', 'restaurant', 'cuisine', 'chef'],
    travel: ['travel', 'vlog', 'vacation', 'trip', 'adventure', 'explore', 'destination', 'hotel'],
    music: ['music', 'song', 'album', 'concert', 'band', 'rapper', 'singer', 'playlist'],
    clickbait: [
      'shocking',
      "you won't believe",
      'exposed',
      'gone wrong',
      'gone sexual',
      'emotional',
      'crying',
    ],
  };

  for (const [category, terms] of Object.entries(categories)) {
    if (terms.some((t) => lower.includes(t))) {
      found.push(category);
    }
  }

  return found;
}
