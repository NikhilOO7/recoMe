import type { PlatformIntelligenceModule, PlatformProfile, RawOpportunity } from '../types';
import { safeText, safeTextAll, safeTextAny } from '../ProfileExtractor';

/**
 * TwitterIntelligence — conversation & trend intelligence.
 *
 * Extracts: trending topics, tweet content, user profile context.
 * Generates insights: Spaces, community discovery, threads, cross-topic connections.
 */
export class TwitterIntelligence implements PlatformIntelligenceModule {
  readonly platform = 'twitter' as const;

  extractProfile(doc: Document): PlatformProfile | null {
    const pageType = this.detectPageType();

    const tweetText = safeTextAny(doc, ['[data-testid="tweetText"]', 'article [lang]']);

    const userName = safeTextAny(doc, ['[data-testid="User-Name"]', 'a[role="link"][href*="/@"]']);

    const trends = safeTextAll(
      doc,
      ['[data-testid="trend"] span', '[aria-label*="Trending"] span'].join(', '),
    );

    const bioText = safeText(doc, '[data-testid="UserDescription"]');

    const hashtags = safeTextAll(doc, 'a[href*="/hashtag/"]');

    const topicChips = safeTextAll(
      doc,
      '[data-testid="TopicButton"] span, [role="link"][href*="/i/topics/"]',
    );

    return {
      platform: 'twitter',
      pageType,
      extractedAt: Date.now(),
      fields: {
        tweetText: tweetText.slice(0, 500),
        userName,
        trends: trends.slice(0, 10),
        bioText: bioText.slice(0, 300),
        hashtags: hashtags.slice(0, 15),
        topicChips: topicChips.slice(0, 10),
        pageType,
      },
    };
  }

  discoverOpportunities(profile: PlatformProfile, userInterests: string[]): RawOpportunity[] {
    const opportunities: RawOpportunity[] = [];
    const fields = profile.fields as {
      tweetText: string;
      userName: string;
      trends: string[];
      bioText: string;
      hashtags: string[];
      topicChips: string[];
      pageType: string;
    };

    // Trending topic match — Spaces & discussions
    if (fields.trends.length > 0) {
      const matchingTrend = fields.trends.find((t) =>
        userInterests.some((i) => t.toLowerCase().includes(i.toLowerCase())),
      );
      if (matchingTrend) {
        opportunities.push({
          title: `Trending: ${matchingTrend}`,
          body: `"${matchingTrend}" is trending and matches your interests. There may be live Spaces or threads discussing this.`,
          benefit: 'Join conversations on topics you care about',
          type: 'event',
          actionLabel: 'Explore topic',
          timeliness: 0.8,
          sourceSignals: [matchingTrend, ...userInterests.slice(0, 3)],
          platformContext: { trend: matchingTrend, pageType: fields.pageType },
        });
      }
    }

    // Community discovery based on hashtags
    if (fields.hashtags.length > 2) {
      const topHashtags = fields.hashtags.slice(0, 3);
      opportunities.push({
        title: `Community around ${topHashtags[0]}`,
        body: `You're following conversations with ${topHashtags.join(', ')}. There are active communities around these topics.`,
        benefit: 'Connect with like-minded people',
        type: 'connection',
        actionLabel: 'Discover community',
        timeliness: 0.4,
        sourceSignals: topHashtags,
        platformContext: { hashtags: topHashtags },
      });
    }

    // Cross-topic connections
    if (userInterests.length > 3 && fields.topicChips.length > 0) {
      const overlap = fields.topicChips.filter((chip) =>
        userInterests.some((i) => chip.toLowerCase().includes(i.toLowerCase())),
      );
      if (overlap.length > 0) {
        opportunities.push({
          title: 'Cross-topic connections in your feed',
          body: `Your interests in ${overlap.slice(0, 2).join(' and ')} are overlapping — accounts that bridge these topics often have unique perspectives.`,
          benefit: 'Discover cross-disciplinary voices',
          type: 'content',
          actionLabel: 'See connections',
          timeliness: 0.3,
          sourceSignals: overlap,
          platformContext: { overlapping: overlap },
        });
      }
    }

    // Profile context insight (when viewing a profile)
    if (fields.pageType === 'profile' && fields.bioText) {
      const bioMatchesInterests = userInterests.some((i) =>
        fields.bioText.toLowerCase().includes(i.toLowerCase()),
      );
      if (bioMatchesInterests) {
        opportunities.push({
          title: `${fields.userName || 'This account'} aligns with your interests`,
          body: `Their bio mentions topics you care about. Checking their pinned tweets could surface valuable content.`,
          benefit: 'Find high-quality voices in your areas of interest',
          type: 'content',
          actionLabel: 'View highlights',
          timeliness: 0.3,
          sourceSignals: [fields.userName, ...userInterests.slice(0, 3)].filter(Boolean),
          platformContext: { userName: fields.userName },
        });
      }
    }

    return opportunities;
  }

  private detectPageType(): string {
    const path = location.pathname;
    if (path === '/home' || path === '/') return 'home';
    if (path.startsWith('/search')) return 'search';
    if (path.startsWith('/explore')) return 'explore';
    if (/^\/[^/]+\/status\/\d+/.test(path)) return 'tweet';
    if (path.startsWith('/i/spaces')) return 'spaces';
    if (/^\/[^/]+$/.test(path) && !path.startsWith('/i/')) return 'profile';
    return 'other';
  }
}
