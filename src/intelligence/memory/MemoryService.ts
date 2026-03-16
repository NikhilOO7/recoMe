import { DEFAULT_USER_ID, SHORT_TERM_MAX } from '@shared/constants';
import { generateId, buildTopicKey, normalizeTopicKey, now } from '@shared/utils';
import { createLogger } from '@shared/Logger';
import { MemoryStore } from './storage/MemoryStore';
import { ContextDetector } from './ContextDetector';
import { PatternDetector } from './PatternDetector';
import { DecayManager } from './DecayManager';
import type {
  ContextBucket,
  ContextState,
  FeedbackType,
  MemoryEntry,
  MemoryPack,
  ContentMetadata,
  Platform,
} from '@shared/types';

const log = createLogger('MemoryService');

export class MemoryService {
  private readonly userId = DEFAULT_USER_ID;
  private contextState: ContextState | null = null;

  // Short-term ring buffer (in-memory, not persisted)
  private readonly shortTermBuffer: string[] = [];

  constructor(
    private readonly store: MemoryStore,
    private readonly contextDetector: ContextDetector,
    private readonly patternDetector: PatternDetector,
    private readonly decayManager: DecayManager,
  ) {}

  // ── Context ──────────────────────────────────────────────────────────────────

  detectContext(platform: Platform, url?: string): ContextState {
    this.contextState = this.contextDetector.detect(platform, url);
    return this.contextState;
  }

  async switchContext(context: ContextBucket): Promise<void> {
    this.contextState = {
      current: context,
      detected_at: now(),
      detection_method: 'manual',
      confidence: 1.0,
    };
    log.info(`Context manually switched to: ${context}`);
  }

  getContextState(): ContextState {
    return (
      this.contextState ?? {
        current: 'general',
        detected_at: now(),
        detection_method: 'time',
        confidence: 0.5,
      }
    );
  }

  getCurrentContext(): ContextBucket {
    return this.getContextState().current;
  }

  // ── Write ────────────────────────────────────────────────────────────────────

  /**
   * Record a user interaction with content. Writes a memory event,
   * optionally creates/updates a memory entry, and runs pattern detection.
   */
  async writeTurn(params: {
    content: ContentMetadata;
    action: FeedbackType;
    context?: ContextBucket;
  }): Promise<void> {
    const { content, action } = params;
    const context = params.context ?? this.getCurrentContext();

    // Derive topic keys from content topics + entities
    const topicKeys = [
      ...content.topics.map((t) => buildTopicKey(this.prefixForAction(action), t)),
      ...content.entities.map((e) => buildTopicKey(this.prefixForAction(action), e)),
    ];

    for (const topicKey of topicKeys) {
      // Persist event
      const event = await this.store.appendEvent(
        this.userId,
        topicKey,
        action,
        content.platform,
        context,
        content.id,
        content.title,
      );

      // Update or create memory entry
      if (action === 'block_forever') {
        await this.blockForever(topicKey.split(':').pop() ?? topicKey, context);
      } else {
        await this.upsertMemoryEntry(topicKey, context, action);
      }

      // Run pattern detection
      await this.patternDetector.processEvent(event, this.userId);
    }

    // Short-term ring buffer
    this.pushShortTerm(content.id);
  }

  /**
   * Permanently block a topic. Stored in `facts_prefs` under `general` context
   * so it overlays ALL contexts.
   */
  async blockForever(topic: string, _context?: ContextBucket): Promise<MemoryEntry> {
    const topicKey = buildTopicKey('blocked', topic);

    const existing = await this.store.getEntryByTopic(this.userId, topicKey);
    if (existing) {
      await this.store.touchEntry(existing.entry_id);
      return existing;
    }

    return this.store.createBaseEntry(this.userId, topicKey, 'general', 'facts_prefs', {
      value: {
        sentiment: 'negative',
        strength: 1.0,
        feedback_type: 'block_forever',
        source_type: 'explicit',
      },
      confidence: 1.0,
    });
  }

  async unblockTopic(topic: string): Promise<void> {
    const topicKey = buildTopicKey('blocked', topic);
    const existing = await this.store.getEntryByTopic(this.userId, topicKey);
    if (existing) {
      await this.store.softDeleteEntry(existing.entry_id);
      log.info(`Unblocked topic: ${topicKey}`);
    }
  }

  /**
   * Permanently mark a topic as liked. Stored in `facts_prefs` under `general`
   * so it boosts matching content across ALL contexts.
   */
  async likeForever(topic: string): Promise<MemoryEntry> {
    const topicKey = buildTopicKey('interested', topic);

    const existing = await this.store.getEntryByTopic(this.userId, topicKey);
    if (existing) {
      await this.store.touchEntry(existing.entry_id);
      return existing;
    }

    return this.store.createBaseEntry(this.userId, topicKey, 'general', 'facts_prefs', {
      value: {
        sentiment: 'positive',
        strength: 1.0,
        feedback_type: 'interested',
        source_type: 'explicit',
      },
      confidence: 1.0,
    });
  }

  /**
   * Record a search query as a soft positive interest signal.
   * Stored with lower strength than explicit likes so it influences
   * scoring without being as strong as a manual "like".
   */
  async recordSearch(query: string, platform: string): Promise<void> {
    // Normalize and extract meaningful terms (skip very short queries)
    const normalized = query.toLowerCase().trim();
    if (normalized.length < 2) return;

    const topicKey = buildTopicKey('searched', normalized);
    const existing = await this.store.getEntryByTopic(this.userId, topicKey);

    if (existing) {
      // Strengthen the signal on repeated searches
      await this.store.touchEntry(existing.entry_id);
      return;
    }

    await this.store.createBaseEntry(this.userId, topicKey, 'general', 'mid_term', {
      value: {
        sentiment: 'positive',
        strength: 0.4,
        feedback_type: 'interested',
        source_type: 'search',
        platform,
      },
      confidence: 0.6,
    });
    log.info(`Search recorded: "${normalized}" on ${platform}`);
  }

  async unlikeTopic(topic: string): Promise<void> {
    const topicKey = buildTopicKey('interested', topic);
    const existing = await this.store.getEntryByTopic(this.userId, topicKey);
    if (existing) {
      await this.store.softDeleteEntry(existing.entry_id);
      log.info(`Unliked topic: ${topicKey}`);
    }
  }

  // ── Retrieve ─────────────────────────────────────────────────────────────────

  /**
   * Retrieve a MemoryPack for a given context.
   * Always includes the `general` overlay (blocked_forever lives here).
   */
  async retrieve(context: ContextBucket): Promise<MemoryPack> {
    const [contextEntries, contextCards, generalEntries, generalCards] = await Promise.all([
      this.store.getEntriesByUserContext(this.userId, context),
      this.store.getCardsByUserContext(this.userId, context),
      this.store.getEntriesByUserContext(this.userId, 'general'),
      this.store.getCardsByUserContext(this.userId, 'general'),
    ]);

    const activeContext = contextEntries.filter((e) => !e.is_deleted && e.status !== 'deleted');
    const activeGeneral = generalEntries.filter((e) => !e.is_deleted && e.status !== 'deleted');

    return {
      context,
      entries: activeContext,
      cards: contextCards.filter((c) => c.status === 'core' || c.status === 'dream'),
      general_overlay: {
        entries: activeGeneral,
        cards: generalCards.filter((c) => c.status === 'core' || c.status === 'dream'),
      },
      retrieved_at: now(),
    };
  }

  // ── Query helpers ────────────────────────────────────────────────────────────

  /**
   * Returns true if any of the given topics/entities should be hidden
   * in the current context (includes general overlay).
   */
  async shouldHide(
    topics: string[],
    context?: ContextBucket,
  ): Promise<{ hide: boolean; reason?: string }> {
    const ctx = context ?? this.getCurrentContext();
    const pack = await this.retrieve(ctx);

    const allBlockedKeys = [
      ...pack.entries,
      ...pack.general_overlay.entries,
    ]
      .filter(
        (e) =>
          e.topic_key.startsWith('blocked:') &&
          (e.status === 'core' || e.status === 'dream'),
      )
      .map((e) => e.topic_key.replace('blocked:', ''));

    const matchedTopic = topics.find((topic) => {
      const normalized = normalizeTopicKey(topic);
      return allBlockedKeys.some(
        (blocked) =>
          blocked === normalized ||
          normalized.includes(blocked) ||
          blocked.includes(normalized),
      );
    });

    if (matchedTopic) {
      return { hide: true, reason: `Blocked: "${matchedTopic}"` };
    }

    // Check mid-term cards
    const matchedCards = await this.patternDetector.matchCards(
      this.userId,
      ctx,
      topics,
    );
    const blockCard = matchedCards.find((c) => c.pattern_type === 'block_pattern');
    if (blockCard) {
      return {
        hide: true,
        reason: `Pattern: "${blockCard.topic_key.split(':').pop()}"`,
      };
    }

    return { hide: false };
  }

  /**
   * Returns true if topics should be boosted in current context.
   */
  async shouldBoost(topics: string[], context?: ContextBucket): Promise<boolean> {
    const ctx = context ?? this.getCurrentContext();
    const pack = await this.retrieve(ctx);

    const allInterestedKeys = pack.entries
      .filter(
        (e) =>
          (e.topic_key.startsWith('interested:') || e.topic_key.startsWith('searched:')) &&
          (e.status === 'core' || e.status === 'dream'),
      )
      .map((e) => e.topic_key.replace(/^(interested|searched):/, ''));

    return topics.some((topic) => {
      const normalized = normalizeTopicKey(topic);
      return allInterestedKeys.some(
        (k) => k === normalized || normalized.includes(k) || k.includes(normalized),
      );
    });
  }

  async getMidTermCards() {
    return this.store.getActiveCards(this.userId);
  }

  async getMemoryCount(): Promise<number> {
    return this.store.countEntries(this.userId);
  }

  // ── Decay ─────────────────────────────────────────────────────────────────────

  async runDecay() {
    return this.decayManager.runDecay(this.userId);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────────

  async clearAll(): Promise<void> {
    await this.store.clearAll();
    this.shortTermBuffer.length = 0;
    log.warn('All memory cleared');
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  private pushShortTerm(contentId: string): void {
    if (this.shortTermBuffer.length >= SHORT_TERM_MAX) {
      this.shortTermBuffer.shift();
    }
    this.shortTermBuffer.push(contentId);
  }

  private prefixForAction(
    action: FeedbackType,
  ): 'blocked' | 'interested' | 'one_time' | 'working' {
    switch (action) {
      case 'not_interested':
      case 'block_forever':
        return 'blocked';
      case 'interested':
        return 'interested';
      case 'one_time':
        return 'one_time';
    }
  }

  private async upsertMemoryEntry(
    topicKey: string,
    context: ContextBucket,
    action: FeedbackType,
  ): Promise<void> {
    const existing = await this.store.getEntryByTopic(this.userId, topicKey);

    if (existing) {
      await this.store.touchEntry(existing.entry_id);
      return;
    }

    const sentiment = action === 'interested' ? 'positive' : 'negative';
    const memType = action === 'one_time' ? 'working_set' : 'mid_term';

    await this.store.createBaseEntry(this.userId, topicKey, context, memType, {
      value: {
        sentiment,
        strength: 1.0,
        feedback_type: action,
        source_type: 'explicit',
      },
    });
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createMemoryService(): MemoryService {
  const store = new MemoryStore();
  const contextDetector = new ContextDetector();
  const patternDetector = new PatternDetector(store);
  const decayManager = new DecayManager(store);
  return new MemoryService(store, contextDetector, patternDetector, decayManager);
}