import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import type { ContentMetadata } from '@shared/types';

export class YouTubeAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'youtube',
      cardSelector: [
        // Home feed, subscriptions, search
        'ytd-rich-item-renderer',
        'ytd-video-renderer',
        'ytd-compact-video-renderer',
        // Grid views (channels, playlists)
        'ytd-grid-video-renderer',
        // Shorts shelf items
        'ytd-reel-item-renderer',
        'ytd-shorts-lockup-view-model',
        // Watch page sidebar
        'ytd-compact-radio-renderer',
        // Playlist panels
        'ytd-playlist-panel-video-renderer',
        // Search mix results
        'ytd-radio-renderer',
      ].join(', '),
      feedSelector: [
        'ytd-browse',
        'ytd-search',
        '#primary',
        'ytd-two-column-browse-results-renderer',
        'ytd-page-manager',
      ].join(', '),
    });
  }

  protected override isUserInitiatedSearch(): boolean {
    return window.location.pathname === '/results';
  }

  extractMetadata(element: Element): ContentMetadata | null {
    try {
      // Title — try multiple selectors in priority order
      const titleEl =
        element.querySelector('#video-title') ??
        element.querySelector('#video-title-link') ??
        element.querySelector('a#video-title') ??
        element.querySelector('h3 a') ??
        element.querySelector('h3 span') ??
        element.querySelector('[title]:not([title=""])');

      const title = titleEl ? titleEl.getAttribute('title') || extractTextContent(titleEl) : '';
      if (!title) return null;

      // Channel name
      const channelEl =
        element.querySelector('ytd-channel-name yt-formatted-string') ??
        element.querySelector('#channel-name yt-formatted-string') ??
        element.querySelector('ytd-channel-name') ??
        element.querySelector('#channel-name') ??
        element.querySelector('.ytd-channel-name') ??
        element.querySelector('a.yt-simple-endpoint[href^="/@"]') ??
        element.querySelector('a.yt-simple-endpoint[href^="/channel/"]');
      const creator = channelEl ? extractTextContent(channelEl).trim() || undefined : undefined;

      // Video ID from watch link
      const linkEl = element.querySelector('a[href*="/watch"]') as HTMLAnchorElement | null;
      const href = linkEl?.href ?? '';
      const videoIdMatch = href.match(/[?&]v=([^&]+)/);
      const videoId = videoIdMatch?.[1] ?? this.computeContentHash(element);

      // Detect ads
      const isAd =
        !!element.querySelector('.ytd-promoted-sparkles-web-renderer') ||
        !!element.querySelector('[aria-label="Ad"]') ||
        element.textContent?.includes('Sponsored') === true;

      // Extract topics from title keywords
      const topics = extractKeywordsFromText(title);

      return {
        id: videoId,
        platform: 'youtube',
        type: isAd ? 'ad' : 'video',
        title,
        creator,
        topics,
        entities: creator ? [creator] : [],
        url: href || location.href,
        raw_metadata: {
          meta_text: element.querySelector('#metadata-line')?.textContent?.trim() ?? '',
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
