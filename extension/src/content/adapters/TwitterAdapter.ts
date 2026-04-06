import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import { heuristicCreator, heuristicUrl } from './MetadataHeuristics';
import type { ContentMetadata } from '@shared/types';

/**
 * TwitterAdapter (X) — covers home timeline, search, lists, communities,
 * notifications, profile tweets, and Explore/trending.
 *
 * Sprint 1 (P1.2): Added page-type detection, list/community/profile selectors,
 * quote tweet and media detection, and engagement context for ranking.
 */

type XPageType =
  | 'home'
  | 'search'
  | 'explore'
  | 'lists'
  | 'communities'
  | 'profile'
  | 'notifications'
  | 'unknown';

export class TwitterAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'twitter',
      cardSelector: [
        // ── Standard tweets (all timelines) ─────────────────────────────
        'article[data-testid="tweet"]',

        // ── Spaces / audio cards ────────────────────────────────────────
        'div[data-testid="audioSpacesCard"]',

        // ── Trend cards (Explore page) ──────────────────────────────────
        'div[data-testid="trend"]',

        // ── User / account recommendation cards ─────────────────────────
        'div[data-testid="UserCell"]',

        // ── Community posts and recommendation cards ────────────────────
        'div[data-testid="communityCard"]',
        'div[data-testid="community-card"]',

        // ── List recommendation cards ───────────────────────────────────
        'div[data-testid="listCard"]',
      ].join(', '),
      feedSelector: [
        '[data-testid="primaryColumn"]',
        'main[role="main"]',
        'div[aria-label="Timeline: Your Home Timeline"]',
        'div[aria-label="Timeline: Search timeline"]',
        'div[aria-label="Timeline: Trending now"]',
        // List timelines
        'div[aria-label^="Timeline: List"]',
        // Profile timelines
        'div[aria-label^="Timeline:"]',
        // Communities
        'div[data-testid="communityTimeline"]',
        // Notifications
        'div[aria-label="Timeline: Notifications"]',
      ].join(', '),
    });
  }

  detectPageType(): XPageType {
    const path = location.pathname;
    if (path === '/home' || path === '/') return 'home';
    if (path.startsWith('/search')) return 'search';
    if (path.startsWith('/explore')) return 'explore';
    if (path.startsWith('/i/lists') || path.match(/^\/[^/]+\/lists/)) return 'lists';
    if (path.startsWith('/i/communities') || path.startsWith('/communities')) return 'communities';
    if (path.startsWith('/notifications')) return 'notifications';
    // Profile: /@username or /username (single segment, not a known route)
    if (/^\/[A-Za-z0-9_]{1,15}\/?$/.test(path)) return 'profile';
    return 'unknown';
  }

  /**
   * Filter out right-rail modules (Who to follow, Trending sidebar, etc.)
   * to prevent false-positive controls on non-primary content.
   */
  protected override onCardFound(element: Element): void {
    if (element.closest('[data-testid="sidebarColumn"]')) return;
    super.onCardFound(element);
  }

  protected override isUserInitiatedSearch(): boolean {
    return location.pathname.startsWith('/search');
  }

  extractMetadata(element: Element): ContentMetadata | null {
    try {
      // Normalize — Spaces/trend/user cards are different shapes
      const isSpaces = element.matches('[data-testid="audioSpacesCard"]');
      const isTrend = element.matches('[data-testid="trend"]');
      const isUserCell = element.matches('[data-testid="UserCell"]');

      if (isTrend) {
        // Trends may or may not start with '#' — accept both
        const trendTextEl =
          element.querySelector('[dir="ltr"] span') ?? element.querySelector('[dir="ltr"]');
        const trendText = trendTextEl?.textContent?.trim() ?? '';
        if (!trendText) return null;
        const topic = trendText.replace(/^#/, '').toLowerCase();
        return {
          id: this.computeContentHash(element),
          platform: 'twitter',
          type: 'post',
          title: `Trending: ${trendText}`,
          topics: topic ? [topic] : [],
          entities: [],
          url: location.href,
        };
      }

      if (isSpaces) {
        const title = element.querySelector('span')?.textContent?.trim() ?? 'Twitter Space';
        const hostEl = element.querySelector('a[href^="/"]');
        const host = hostEl?.textContent?.trim() || undefined;
        return {
          id: this.computeContentHash(element),
          platform: 'twitter',
          type: 'video',
          title,
          creator: host,
          topics: [],
          entities: host ? [host] : [],
          url: location.href,
        };
      }

      if (isUserCell) {
        const nameEl = element.querySelector('a[role="link"] span');
        const name = nameEl?.textContent?.trim() ?? '';
        if (!name) return null;
        const linkEl = element.querySelector(
          'a[role="link"][href^="/"]',
        ) as HTMLAnchorElement | null;
        return {
          id: this.computeContentHash(element),
          platform: 'twitter',
          type: 'post',
          title: `User: ${name}`,
          creator: name,
          topics: [],
          entities: [name],
          url: linkEl?.href ?? location.href,
        };
      }

      // Standard tweet
      const textEl = element.querySelector('[data-testid="tweetText"]');
      const text = textEl ? extractTextContent(textEl) : '';

      const userEl = element.querySelector('[data-testid="User-Name"]');
      let creator = userEl ? extractTextContent(userEl).split('\n')[0]?.trim() : undefined;
      if (!creator) creator = heuristicCreator(element) ?? undefined;

      const linkEl = element.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
      let href = linkEl?.href ?? '';
      if (!href) href = heuristicUrl(element) ?? location.href;
      const statusMatch = href.match(/\/status\/(\d+)/);
      const id = statusMatch?.[1] ?? this.computeContentHash(element);

      // Ad detection — multiple signals
      const isAd =
        !!element.querySelector('[data-testid="placementTracking"]') ||
        !!element.querySelector('[data-testid="promotedIndicator"]') ||
        !!element.querySelector('svg[data-testid="icon-promoted"]') ||
        Array.from(element.querySelectorAll('span')).some(
          (s) =>
            s.textContent?.trim() === 'Promoted' ||
            s.textContent?.trim() === 'Sponsored' ||
            s.textContent?.trim() === 'Ad',
        );

      const title = text.slice(0, 140) || (creator ? `Post by ${creator}` : 'Tweet');

      // Extract hashtags from tweet text
      const hashtags = [...text.matchAll(/#(\w+)/g)].map((m) => m[1]!.toLowerCase());

      // Detect media attachments
      const hasImage = !!element.querySelector('[data-testid="tweetPhoto"]');
      const hasVideo =
        !!element.querySelector('[data-testid="videoPlayer"]') || !!element.querySelector('video');
      const hasQuote = !!element.querySelector('[data-testid="quoteTweet"]');

      // Engagement context for ranking
      const replyCountEl = element.querySelector('[data-testid="reply"] span');
      const retweetCountEl = element.querySelector('[data-testid="retweet"] span');
      const likeCountEl = element.querySelector('[data-testid="like"] span');

      return {
        id,
        platform: 'twitter',
        type: isAd ? 'ad' : 'post',
        title,
        creator,
        topics: hashtags,
        entities: creator ? [creator] : [],
        url: href,
        raw_metadata: {
          ...(hasImage ? { has_image: true } : {}),
          ...(hasVideo ? { has_video: true } : {}),
          ...(hasQuote ? { has_quote: true } : {}),
          ...(replyCountEl?.textContent ? { replies: replyCountEl.textContent.trim() } : {}),
          ...(retweetCountEl?.textContent ? { retweets: retweetCountEl.textContent.trim() } : {}),
          ...(likeCountEl?.textContent ? { likes: likeCountEl.textContent.trim() } : {}),
        },
      };
    } catch {
      return null;
    }
  }
}
