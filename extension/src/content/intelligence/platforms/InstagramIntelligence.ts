import type { PlatformIntelligenceModule, PlatformProfile, RawOpportunity } from '../types';
import { safeText, safeTextAll, safeTextAny } from '../ProfileExtractor';

/**
 * InstagramIntelligence — creator & experience intelligence.
 *
 * Extracts: content type, creator, hashtags, location, engagement signals.
 * Generates insights: experience suggestions, program discovery, local discovery, creator drops.
 */
export class InstagramIntelligence implements PlatformIntelligenceModule {
  readonly platform = 'instagram' as const;

  extractProfile(doc: Document): PlatformProfile | null {
    const pageType = this.detectPageType();

    const creator = safeTextAny(doc, ['header a[role="link"]', 'a[href*="/"] span[dir="auto"]']);

    const caption = safeTextAny(doc, [
      'h1[dir="auto"]',
      'span[dir="auto"]',
      'article span[dir="auto"]',
    ]);

    const hashtags = safeTextAll(doc, 'a[href*="/explore/tags/"]');

    const location = safeTextAny(doc, ['a[href*="/explore/locations/"]', 'a[href*="/locations/"]']);

    const bio = safeText(doc, 'header section span[dir="auto"]');
    const followers = safeText(doc, 'header section li:nth-child(2) span');

    const altTexts = Array.from(doc.querySelectorAll('img[alt]'))
      .map((img) => img.getAttribute('alt') ?? '')
      .filter((alt) => alt.length > 20)
      .slice(0, 5);

    return {
      platform: 'instagram',
      pageType,
      extractedAt: Date.now(),
      fields: {
        creator,
        caption: caption.slice(0, 500),
        hashtags: hashtags.slice(0, 20),
        location,
        bio: bio.slice(0, 300),
        followers,
        altTexts,
        pageType,
      },
    };
  }

  discoverOpportunities(profile: PlatformProfile, userInterests: string[]): RawOpportunity[] {
    const opportunities: RawOpportunity[] = [];
    const fields = profile.fields as {
      creator: string;
      caption: string;
      hashtags: string[];
      location: string;
      bio: string;
      altTexts: string[];
      pageType: string;
    };

    // Experience suggestion based on content themes
    const travelKeywords = ['travel', 'explore', 'vacation', 'trip', 'adventure', 'destination'];
    const isTravelContent = this.matchesTheme(fields, travelKeywords);
    if (isTravelContent) {
      opportunities.push({
        title: 'Travel inspiration in your feed',
        body: `You've been engaging with travel content. Planning guides and local tips for destinations you're interested in could help.`,
        benefit: 'Turn travel inspiration into actionable plans',
        type: 'content',
        actionLabel: 'View travel guides',
        timeliness: 0.5,
        sourceSignals: ['travel', ...fields.hashtags.slice(0, 3)],
        platformContext: { theme: 'travel', location: fields.location },
      });
    }

    // Fitness/wellness program discovery
    const fitnessKeywords = ['fitness', 'workout', 'gym', 'yoga', 'run', 'health', 'training'];
    const isFitnessContent = this.matchesTheme(fields, fitnessKeywords);
    if (isFitnessContent && fields.creator) {
      opportunities.push({
        title: `Programs from ${fields.creator}`,
        body: `This creator posts fitness content. They may offer structured programs or challenges.`,
        benefit: 'Get structured guidance from creators you follow',
        type: 'course',
        actionLabel: 'View programs',
        timeliness: 0.4,
        sourceSignals: [fields.creator, 'fitness'],
        platformContext: { creator: fields.creator, theme: 'fitness' },
      });
    }

    // Local discovery based on location tags
    if (fields.location) {
      const localInterests = userInterests.filter((i) =>
        ['food', 'restaurant', 'cafe', 'coffee', 'bar', 'shop', 'store'].some((kw) =>
          i.toLowerCase().includes(kw),
        ),
      );
      if (
        localInterests.length > 0 ||
        fields.hashtags.some((h) => h.includes('food') || h.includes('local'))
      ) {
        opportunities.push({
          title: `Local spots near ${fields.location}`,
          body: `Content tagged in ${fields.location} aligns with your interests. There may be hidden gems nearby.`,
          benefit: 'Discover local places that match your tastes',
          type: 'content',
          actionLabel: 'Explore local',
          timeliness: 0.6,
          sourceSignals: [fields.location, ...localInterests],
          platformContext: { location: fields.location },
        });
      }
    }

    // Creator drops & sales (shopping engagement)
    if (
      fields.hashtags.some((h) =>
        ['collab', 'launch', 'newdrop', 'sale', 'giveaway', 'preorder'].some((kw) =>
          h.toLowerCase().includes(kw),
        ),
      )
    ) {
      opportunities.push({
        title: `New drop from ${fields.creator || 'a creator'}`,
        body: `A creator you're viewing has a new product or collaboration. This may be time-sensitive.`,
        benefit: 'Stay ahead of limited releases',
        type: 'deal',
        actionLabel: 'View details',
        timeliness: 0.8,
        sourceSignals: [fields.creator, ...fields.hashtags.slice(0, 3)].filter(Boolean),
        platformContext: { creator: fields.creator },
      });
    }

    // Cross-interest content from user's graph
    if (userInterests.length > 2) {
      const captionMatches = userInterests.filter((i) =>
        fields.caption.toLowerCase().includes(i.toLowerCase()),
      );
      if (captionMatches.length > 0) {
        opportunities.push({
          title: `Content matching your interests`,
          body: `This post touches on ${captionMatches.slice(0, 2).join(' and ')} — topics in your interest graph.`,
          benefit: 'Find content aligned with what you care about',
          type: 'content',
          actionLabel: 'Explore more',
          timeliness: 0.3,
          sourceSignals: captionMatches,
          platformContext: { matchedInterests: captionMatches },
        });
      }
    }

    return opportunities;
  }

  private detectPageType(): string {
    const path = location.pathname;
    if (path === '/' || path === '') return 'home';
    if (path.startsWith('/explore')) return 'explore';
    if (path.startsWith('/reels')) return 'reels';
    if (/^\/p\/[A-Za-z0-9_-]+/.test(path)) return 'post';
    if (/^\/reel\/[A-Za-z0-9_-]+/.test(path)) return 'reel';
    if (/^\/stories\//.test(path)) return 'stories';
    if (/^\/[^/]+\/?$/.test(path)) return 'profile';
    return 'other';
  }

  private matchesTheme(
    fields: { caption: string; hashtags: string[]; altTexts: string[] },
    keywords: string[],
  ): boolean {
    const text = [fields.caption, ...fields.hashtags, ...fields.altTexts].join(' ').toLowerCase();
    return keywords.some((kw) => text.includes(kw));
  }
}
