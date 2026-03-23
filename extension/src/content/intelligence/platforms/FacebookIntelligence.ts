import type { PlatformIntelligenceModule, PlatformProfile, RawOpportunity } from '../types';
import { safeText, safeTextAll, safeTextAny } from '../ProfileExtractor';

/**
 * FacebookIntelligence — community & event intelligence.
 *
 * Extracts: post content, group context, marketplace listings, event info.
 * Generates insights: local events, community discovery, marketplace deals, cause matching.
 */
export class FacebookIntelligence implements PlatformIntelligenceModule {
  readonly platform = 'facebook' as const;

  extractProfile(doc: Document): PlatformProfile | null {
    const pageType = this.detectPageType();

    const postText = safeTextAny(doc, [
      '[data-ad-comet-preview="message"]',
      '[data-testid="post_message"]',
      '[role="article"] [dir="auto"]',
    ]);

    const authorName = safeTextAny(doc, [
      '[role="article"] h2 a strong',
      '[role="article"] h3 a strong',
      'a[role="link"] strong span',
    ]);

    const groupName = safeTextAny(doc, ['h1 a[href*="/groups/"]', '[role="main"] h1 span']);

    const eventDetails = safeText(doc, '[data-testid="event-permalink-details"]');
    const eventDate = safeText(doc, 'div[aria-label*="Date"], time');

    const marketplaceTitle = safeText(doc, '[data-testid="marketplace_pdp_title"], h1 span');
    const marketplacePrice = safeText(
      doc,
      '[data-testid="marketplace_pdp_price"], span[dir="auto"]',
    );
    const marketplaceLocation = safeText(doc, '[data-testid="marketplace_pdp_location"]');

    const suggestedGroups = safeTextAll(
      doc,
      '[aria-label*="Groups You Should Join"] a span, [data-testid="group_suggestion"] a',
    );

    return {
      platform: 'facebook',
      pageType,
      extractedAt: Date.now(),
      fields: {
        postText: postText.slice(0, 500),
        authorName,
        groupName,
        eventDetails: eventDetails.slice(0, 300),
        eventDate,
        marketplaceTitle,
        marketplacePrice,
        marketplaceLocation,
        suggestedGroups: suggestedGroups.slice(0, 10),
        pageType,
      },
    };
  }

  discoverOpportunities(profile: PlatformProfile, userInterests: string[]): RawOpportunity[] {
    const opportunities: RawOpportunity[] = [];
    const fields = profile.fields as {
      postText: string;
      authorName: string;
      groupName: string;
      eventDetails: string;
      eventDate: string;
      marketplaceTitle: string;
      marketplacePrice: string;
      marketplaceLocation: string;
      suggestedGroups: string[];
      pageType: string;
    };

    // Local event matching
    if (fields.pageType === 'events' || fields.eventDetails) {
      const eventMatchesInterests = userInterests.some((i) =>
        fields.eventDetails.toLowerCase().includes(i.toLowerCase()),
      );
      if (eventMatchesInterests) {
        opportunities.push({
          title: 'Event matches your interests',
          body: `${fields.eventDetails.slice(0, 100)}${fields.eventDate ? ` — ${fields.eventDate}` : ''}`,
          benefit: 'Attend events aligned with what you care about',
          type: 'event',
          actionLabel: 'View event',
          timeliness: 0.8,
          sourceSignals: userInterests.slice(0, 3),
          platformContext: { eventDate: fields.eventDate },
        });
      }
    }

    // Community discovery via groups
    if (fields.suggestedGroups.length > 0) {
      const matchingGroups = fields.suggestedGroups.filter((g) =>
        userInterests.some((i) => g.toLowerCase().includes(i.toLowerCase())),
      );
      if (matchingGroups.length > 0) {
        opportunities.push({
          title: `Groups matching your interests`,
          body: `${matchingGroups.slice(0, 2).join(' and ')} ${matchingGroups.length > 2 ? `and ${matchingGroups.length - 2} more` : ''} match topics you care about.`,
          benefit: 'Connect with communities in your interest areas',
          type: 'connection',
          actionLabel: 'View groups',
          timeliness: 0.4,
          sourceSignals: matchingGroups.slice(0, 5),
          platformContext: { groups: matchingGroups },
        });
      }
    }

    // Group context insight
    if (fields.groupName && fields.pageType === 'groups') {
      opportunities.push({
        title: `Active in: ${fields.groupName}`,
        body: `This group may have related communities. Members often share resources and events.`,
        benefit: 'Expand your network through related groups',
        type: 'connection',
        actionLabel: 'Find related groups',
        timeliness: 0.3,
        sourceSignals: [fields.groupName],
        platformContext: { groupName: fields.groupName },
      });
    }

    // Marketplace deal alert
    if (fields.pageType === 'marketplace' && fields.marketplaceTitle) {
      const titleLower = fields.marketplaceTitle.toLowerCase();
      const matchedInterests = userInterests.filter((i) => titleLower.includes(i.toLowerCase()));
      if (matchedInterests.length > 0) {
        opportunities.push({
          title: `Marketplace find: ${fields.marketplaceTitle.slice(0, 50)}`,
          body: `${fields.marketplacePrice ? `Listed at ${fields.marketplacePrice}` : 'Local listing'}${fields.marketplaceLocation ? ` in ${fields.marketplaceLocation}` : ''}. This matches your interest in ${matchedInterests[0]}.`,
          benefit: 'Find local deals on items you care about',
          type: 'deal',
          actionLabel: 'View listing',
          timeliness: 0.7,
          sourceSignals: matchedInterests,
          platformContext: {
            title: fields.marketplaceTitle,
            price: fields.marketplacePrice,
            location: fields.marketplaceLocation,
          },
        });
      }
    }

    // Feed content matching interests
    if (fields.pageType === 'feed' && fields.postText) {
      const postLower = fields.postText.toLowerCase();
      const matchedInterests = userInterests.filter((i) => postLower.includes(i.toLowerCase()));
      if (matchedInterests.length >= 2) {
        opportunities.push({
          title: 'Post touches multiple interests',
          body: `This post relates to ${matchedInterests.slice(0, 3).join(', ')}. Content spanning multiple interests is often valuable.`,
          benefit: 'Find cross-disciplinary content',
          type: 'content',
          actionLabel: 'Save post',
          timeliness: 0.3,
          sourceSignals: matchedInterests,
          platformContext: { author: fields.authorName },
        });
      }
    }

    return opportunities;
  }

  private detectPageType(): string {
    const path = location.pathname;
    if (path === '/' || path === '') return 'feed';
    if (path.startsWith('/watch')) return 'watch';
    if (path.startsWith('/marketplace')) return 'marketplace';
    if (path.startsWith('/groups/')) return 'groups';
    if (path.startsWith('/events')) return 'events';
    if (path.startsWith('/reel')) return 'reels';
    if (/^\/[^/]+\/?$/.test(path)) return 'profile';
    return 'other';
  }
}
