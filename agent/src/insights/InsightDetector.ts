import { createLogger } from '@utils/Logger';
import { DEFAULT_USER_ID } from '@shared/constants';
import { MemoryStore } from '@intelligence/memory/storage/MemoryStore';
import { RetrievalService } from '../retrieval';
import { InsightStore, type InsightType } from './InsightStore';
import { getLLMClient } from '../llm/LLMClient';

const log = createLogger('InsightDetector');

// ── Detection thresholds ────────────────────────────────────────────────────

/** Minimum events in same category over 3 days to trigger extended_research */
const RESEARCH_EVENT_THRESHOLD = 3;
const RESEARCH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/** Minimum products in same category with no action to trigger decision_fatigue */
const FATIGUE_PRODUCT_THRESHOLD = 10;
const FATIGUE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Minimum platforms for same topic to trigger cross_platform */
const CROSS_PLATFORM_MIN = 2;
const CROSS_PLATFORM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Minimum implicit signals contradicting stated preference to trigger drift */
const DRIFT_SIGNAL_THRESHOLD = 4;
const DRIFT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * InsightDetector — rule-based pattern detection for proactive insights.
 *
 * Runs periodically (every 30 min via chrome.alarms) and writes detected
 * insights to InsightStore for delivery via toast or chat banner.
 *
 * Detection is rule-based (no LLM needed). Phrasing uses LLM when available,
 * templates otherwise.
 */
export class InsightDetector {
  private readonly store = new MemoryStore();
  private readonly insightStore = new InsightStore();
  private readonly retrieval = new RetrievalService();
  private readonly llm = getLLMClient();

  /**
   * Run all detection rules and write any new insights.
   * Returns the number of new insights generated.
   */
  async detect(): Promise<number> {
    const now = Date.now();
    let newInsights = 0;

    try {
      const [researchCount, fatigueCount, crossPlatformCount, driftCount] = await Promise.all([
        this.detectExtendedResearch(now),
        this.detectDecisionFatigue(now),
        this.detectCrossPlatform(now),
        this.detectPreferenceDrift(now),
      ]);

      newInsights = researchCount + fatigueCount + crossPlatformCount + driftCount;

      // Cleanup old insights while we're here
      await this.insightStore.cleanup();

      if (newInsights > 0) {
        log.info(`Detected ${newInsights} new insight(s)`);
      } else {
        log.debug('No new insights detected');
      }
    } catch (err) {
      log.error('Insight detection failed', err);
    }

    return newInsights;
  }

  // ── Extended Research ──────────────────────────────────────────────────────
  // User has been browsing the same category 3+ times in 3 days

  private async detectExtendedResearch(now: number): Promise<number> {
    const sinceMs = now - RESEARCH_WINDOW_MS;
    const events = await this.store.getEventsAfter(sinceMs);

    // Group events by topic_key
    const topicCounts = new Map<string, { count: number; titles: string[] }>();
    for (const event of events) {
      const key = event.topic_key;
      if (!key) continue;
      const entry = topicCounts.get(key) ?? { count: 0, titles: [] };
      entry.count++;
      if (event.content_title && entry.titles.length < 3) {
        entry.titles.push(event.content_title);
      }
      topicCounts.set(key, entry);
    }

    let count = 0;
    for (const [topicKey, data] of topicCounts) {
      if (data.count >= RESEARCH_EVENT_THRESHOLD) {
        const displayTopic = topicKey.replace(/^topic:/, '').replace(/_/g, ' ');
        const message = await this.phraseInsight(
          'extended_research',
          displayTopic,
          data.count,
          data.titles,
        );
        const added = await this.insightStore.add({
          type: 'extended_research',
          title: `Researching ${displayTopic}`,
          message,
          chatPrompt: `Compare my top picks for ${displayTopic}`,
          topicKey,
        });
        if (added) count++;
      }
    }
    return count;
  }

  // ── Decision Fatigue ──────────────────────────────────────────────────────
  // 10+ products in same category, no action taken

  private async detectDecisionFatigue(now: number): Promise<number> {
    const sinceMs = now - FATIGUE_WINDOW_MS;
    const events = await this.store.getEventsAfter(sinceMs);

    // Group by topic, separate browsing events from action events
    const browsing = new Map<string, number>();
    const acted = new Set<string>();

    for (const event of events) {
      const key = event.topic_key;
      if (!key) continue;

      if (event.action === 'block_forever' || event.action === 'interested') {
        acted.add(key);
      } else {
        browsing.set(key, (browsing.get(key) ?? 0) + 1);
      }
    }

    let count = 0;
    for (const [topicKey, browseCount] of browsing) {
      if (browseCount >= FATIGUE_PRODUCT_THRESHOLD && !acted.has(topicKey)) {
        const displayTopic = topicKey.replace(/^topic:/, '').replace(/_/g, ' ');
        const message = await this.phraseInsight('decision_fatigue', displayTopic, browseCount);
        const added = await this.insightStore.add({
          type: 'decision_fatigue',
          title: `Too many choices?`,
          message,
          chatPrompt: `Help me narrow down ${displayTopic}`,
          topicKey,
        });
        if (added) count++;
      }
    }
    return count;
  }

  // ── Cross-Platform Pattern ────────────────────────────────────────────────
  // Same topic appearing on 2+ different platforms

  private async detectCrossPlatform(now: number): Promise<number> {
    const sinceMs = now - CROSS_PLATFORM_WINDOW_MS;
    const events = await this.store.getEventsAfter(sinceMs);

    // Group by topic → set of platforms
    const topicPlatforms = new Map<string, Set<string>>();
    for (const event of events) {
      const key = event.topic_key;
      if (!key || !event.platform) continue;
      if (!topicPlatforms.has(key)) topicPlatforms.set(key, new Set());
      topicPlatforms.get(key)!.add(event.platform);
    }

    let count = 0;
    for (const [topicKey, platforms] of topicPlatforms) {
      if (platforms.size >= CROSS_PLATFORM_MIN) {
        const displayTopic = topicKey.replace(/^topic:/, '').replace(/_/g, ' ');
        const platformList = [...platforms].join(' and ');
        const message = await this.phraseInsight(
          'cross_platform',
          displayTopic,
          platforms.size,
          [],
          platformList,
        );
        const added = await this.insightStore.add({
          type: 'cross_platform',
          title: `${displayTopic} across platforms`,
          message,
          chatPrompt: `Boost ${displayTopic} content everywhere`,
          topicKey,
        });
        if (added) count++;
      }
    }
    return count;
  }

  // ── Preference Drift ──────────────────────────────────────────────────────
  // Implicit signals shifting away from stated preferences

  private async detectPreferenceDrift(now: number): Promise<number> {
    const sinceMs = now - DRIFT_WINDOW_MS;
    const events = await this.store.getEventsAfter(sinceMs);

    // Get stated brand preferences
    let userContext;
    try {
      userContext = await this.retrieval.getUserContext();
    } catch {
      return 0;
    }

    const preferredBrands = new Set(
      userContext.brandPreferences.filter((b) => b.sentiment === 'positive').map((b) => b.brandId),
    );

    if (preferredBrands.size === 0) return 0;

    // Count implicit browsing events for non-preferred brands
    const nonPreferredCounts = new Map<string, number>();
    for (const event of events) {
      const key = event.topic_key;
      if (!key) continue;
      // Check if this is a brand-related event for a non-preferred brand
      if (key.startsWith('brand:') && !preferredBrands.has(key)) {
        nonPreferredCounts.set(key, (nonPreferredCounts.get(key) ?? 0) + 1);
      }
    }

    let count = 0;
    for (const [brandKey, signalCount] of nonPreferredCounts) {
      if (signalCount >= DRIFT_SIGNAL_THRESHOLD) {
        const displayBrand = brandKey.replace(/^brand:/, '').replace(/_/g, ' ');
        const preferredList = [...preferredBrands]
          .slice(0, 3)
          .map((b) => b.replace(/^brand:/, '').replace(/_/g, ' '))
          .join(', ');
        const message = await this.phraseInsight(
          'preference_drift',
          displayBrand,
          signalCount,
          [],
          preferredList,
        );
        const added = await this.insightStore.add({
          type: 'preference_drift',
          title: `Noticing a shift?`,
          message,
          chatPrompt: `Update my brand preferences`,
          topicKey: brandKey,
        });
        if (added) count++;
      }
    }
    return count;
  }

  // ── Phrasing ──────────────────────────────────────────────────────────────

  /**
   * Generate human-friendly phrasing for an insight.
   * Uses LLM when available, falls back to templates.
   */
  private async phraseInsight(
    type: InsightType,
    topic: string,
    count: number,
    titles: string[] = [],
    extra?: string,
  ): Promise<string> {
    // Try LLM phrasing
    if (await this.llm.isConfigured()) {
      try {
        const prompt = this.buildPhrasingPrompt(type, topic, count, titles, extra);
        const response = await this.llm.call(prompt, {
          system:
            'You are RecoMe, a friendly shopping companion. Write a single short sentence (under 120 chars) as a proactive insight notification. Be conversational and helpful, not pushy.',
          maxTokens: 60,
        });
        if (response) return response.trim();
      } catch {
        // Fall through to template
      }
    }

    return this.templatePhrase(type, topic, count, extra);
  }

  private buildPhrasingPrompt(
    type: InsightType,
    topic: string,
    count: number,
    titles: string[],
    extra?: string,
  ): string {
    switch (type) {
      case 'extended_research':
        return `The user has been researching "${topic}" for ${count} sessions over 3 days. ${titles.length > 0 ? `Recent items: ${titles.join(', ')}.` : ''} Write a friendly nudge offering to compare their top picks.`;
      case 'decision_fatigue':
        return `The user has looked at ${count} products in the "${topic}" category without taking any action. Write a friendly offer to help narrow down their choices.`;
      case 'cross_platform':
        return `The user has been exploring "${topic}" across ${extra}. Write a friendly observation suggesting we boost this content across all their platforms.`;
      case 'preference_drift':
        return `The user stated they prefer ${extra}, but lately they've been browsing ${topic} a lot (${count} signals). Write a friendly observation about this shift.`;
    }
  }

  private templatePhrase(type: InsightType, topic: string, count: number, extra?: string): string {
    switch (type) {
      case 'extended_research':
        return `You've been researching ${topic} for a few days — want me to compare your top picks?`;
      case 'decision_fatigue':
        return `You've looked at ${count} ${topic} products. Want me to narrow it down?`;
      case 'cross_platform':
        return `You're exploring ${topic} on ${extra} — want me to boost it everywhere?`;
      case 'preference_drift':
        return `You used to prefer ${extra} but lately you've been browsing ${topic}. Updating preferences?`;
    }
  }
}
