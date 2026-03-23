import type { PlatformIntelligenceModule, PlatformProfile, RawOpportunity } from '../types';
import { safeText, safeTextAll, safeAttr } from '../ProfileExtractor';

/**
 * YouTubeIntelligence — learning & discovery intelligence.
 *
 * Extracts: video topic, channel, category, tags.
 * Generates insights: learning paths, deep-dive playlists, similar creators, live events.
 */
export class YouTubeIntelligence implements PlatformIntelligenceModule {
  readonly platform = 'youtube' as const;

  extractProfile(doc: Document): PlatformProfile | null {
    const pageType = this.detectPageType();

    const videoTitle = safeText(doc, 'h1.ytd-watch-metadata, #title h1, h1.title');
    const channel = safeText(doc, '#channel-name a, ytd-channel-name a, .ytd-channel-name a');
    const category = safeAttr(doc, 'meta[itemprop="genre"]', 'content');
    const description = safeText(doc, '#description-text, #description ytd-text-inline-expander');
    const tags = safeTextAll(
      doc,
      'yt-chip-cloud-chip-renderer, ytd-topic-channel-details-renderer a',
    );
    const subscribers = safeText(doc, '#owner-sub-count, #subscriber-count');

    return {
      platform: 'youtube',
      pageType,
      extractedAt: Date.now(),
      fields: {
        videoTitle,
        channel,
        category,
        description: description.slice(0, 500),
        tags: tags.slice(0, 15),
        subscribers,
        pageType,
      },
    };
  }

  discoverOpportunities(profile: PlatformProfile, userInterests: string[]): RawOpportunity[] {
    const opportunities: RawOpportunity[] = [];
    const fields = profile.fields as {
      videoTitle: string;
      channel: string;
      category: string;
      tags: string[];
      pageType: string;
    };

    const isLearningContent = this.isLearningContent(fields);

    // Learning path suggestion (when watching educational content)
    if (isLearningContent && fields.tags.length > 0) {
      const topic = fields.tags[0] ?? fields.category;
      opportunities.push({
        title: `Structured learning path for ${topic}`,
        body: `You've been watching ${topic} content. There's a structured path from beginner to advanced.`,
        benefit: 'Learn systematically instead of randomly browsing',
        type: 'course',
        actionLabel: 'View learning path',
        timeliness: 0.5,
        sourceSignals: [topic, ...fields.tags.slice(0, 3)],
        platformContext: { category: fields.category, tags: fields.tags },
      });
    }

    // Similar creator discovery
    if (fields.channel && fields.category) {
      opportunities.push({
        title: `Creators similar to ${fields.channel}`,
        body: `If you enjoy ${fields.channel}'s ${fields.category} content, you might like these similar creators.`,
        benefit: `Discover new perspectives on ${fields.category}`,
        type: 'content',
        actionLabel: 'Discover creators',
        timeliness: 0.3,
        sourceSignals: [fields.channel, fields.category],
        platformContext: { channel: fields.channel, category: fields.category },
      });
    }

    // Topic deep-dive when user keeps returning to a topic
    if (
      userInterests.some((i) => fields.tags.some((t) => t.toLowerCase().includes(i.toLowerCase())))
    ) {
      const matchingTopic =
        fields.tags.find((t) =>
          userInterests.some((i) => t.toLowerCase().includes(i.toLowerCase())),
        ) ?? fields.tags[0];

      if (matchingTopic) {
        opportunities.push({
          title: `Deep dive: ${matchingTopic}`,
          body: `You keep coming back to ${matchingTopic} content. Here's a curated collection covering everything.`,
          benefit: 'Save time with a curated collection',
          type: 'content',
          actionLabel: 'View collection',
          timeliness: 0.4,
          sourceSignals: [matchingTopic, ...userInterests.slice(0, 3)],
          platformContext: { topic: matchingTopic },
        });
      }
    }

    // Live event detection (based on category overlap)
    if (fields.category && userInterests.length > 0) {
      opportunities.push({
        title: `Live events in ${fields.category}`,
        body: `Check if there are upcoming live streams or conferences related to ${fields.category}.`,
        benefit: 'Engage with live content in your interest area',
        type: 'event',
        actionLabel: 'Check events',
        timeliness: 0.6,
        sourceSignals: [fields.category],
        platformContext: { category: fields.category },
      });
    }

    return opportunities;
  }

  private detectPageType(): string {
    const path = location.pathname;
    if (path.startsWith('/watch')) return 'video';
    if (path.startsWith('/shorts')) return 'shorts';
    if (path.startsWith('/results')) return 'search';
    if (path.startsWith('/@') || path.startsWith('/c/')) return 'channel';
    if (path.startsWith('/playlist')) return 'playlist';
    return 'home';
  }

  private isLearningContent(fields: {
    category: string;
    tags: string[];
    videoTitle: string;
  }): boolean {
    const learningKeywords = [
      'tutorial',
      'course',
      'learn',
      'how to',
      'guide',
      'explained',
      'lesson',
      'beginner',
      'advanced',
    ];
    const title = fields.videoTitle.toLowerCase();
    const tags = fields.tags.map((t) => t.toLowerCase());

    return (
      learningKeywords.some((kw) => title.includes(kw)) ||
      tags.some((t) => learningKeywords.some((kw) => t.includes(kw))) ||
      fields.category === 'Education' ||
      fields.category === 'Science & Technology'
    );
  }
}
