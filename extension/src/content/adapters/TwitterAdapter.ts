import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import type { ContentMetadata } from '@shared/types';

export class TwitterAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'twitter',
      cardSelector: [
        // Standard tweets
        'article[data-testid="tweet"]',
        // Spaces / audio cards
        'div[data-testid="audioSpacesCard"]',
        // Trend cards
        'div[data-testid="trend"]',
      ].join(', '),
      feedSelector: [
        '[data-testid="primaryColumn"]',
        'main[role="main"]',
        'div[aria-label="Timeline: Your Home Timeline"]',
        'div[aria-label="Timeline: Search timeline"]',
        'div[aria-label="Timeline: Trending now"]',
      ].join(', '),
    });
  }

  extractMetadata(element: Element): ContentMetadata | null {
    try {
      // Normalize — Spaces/trend cards are different shapes
      const isTweet = element.matches('article[data-testid="tweet"]');
      const isSpaces = element.matches('[data-testid="audioSpacesCard"]');
      const isTrend = element.matches('[data-testid="trend"]');

      if (isTrend) {
        const trendText = element.querySelector('[dir="ltr"]')?.textContent?.trim() ?? '';
        if (!trendText || trendText.startsWith('#') === false) return null;
        return {
          id: this.computeContentHash(element),
          platform: 'twitter',
          type: 'post',
          title: `Trending: ${trendText}`,
          topics: [trendText.replace('#', '').toLowerCase()],
          entities: [],
          url: location.href,
        };
      }

      if (isSpaces) {
        const title = element.querySelector('span')?.textContent?.trim() ?? 'Twitter Space';
        return {
          id: this.computeContentHash(element),
          platform: 'twitter',
          type: 'video',
          title,
          topics: [],
          entities: [],
          url: location.href,
        };
      }

      // Standard tweet
      const textEl = element.querySelector('[data-testid="tweetText"]');
      const text = textEl ? extractTextContent(textEl) : '';

      const userEl = element.querySelector('[data-testid="User-Name"]');
      const creator = userEl ? extractTextContent(userEl).split('\n')[0]?.trim() : undefined;

      const linkEl = element.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
      const href = linkEl?.href ?? location.href;
      const statusMatch = href.match(/\/status\/(\d+)/);
      const id = statusMatch?.[1] ?? this.computeContentHash(element);

      const isAd =
        !!element.querySelector('[data-testid="placementTracking"]') ||
        Array.from(element.querySelectorAll('[role="button"]')).some((b) =>
          b.textContent?.includes('Promoted'),
        );

      const title = text.slice(0, 140) || (creator ? `Post by ${creator}` : 'Tweet');

      // Extract hashtags from tweet text
      const hashtags = [...text.matchAll(/#(\w+)/g)].map((m) => m[1]!.toLowerCase());

      return {
        id,
        platform: 'twitter',
        type: isAd ? 'ad' : 'post',
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
