import { PATTERN_THRESHOLD } from '@shared/constants';
import { generateId, now } from '@shared/utils';
import { createLogger } from '@shared/Logger';
import type { MemoryStore } from './storage/MemoryStore';
import type {
  MemoryEvent,
  MidTermCard,
  ContextBucket,
  Platform,
} from '@shared/types';

const log = createLogger('PatternDetector');

type PatternType = MidTermCard['pattern_type'];

export class PatternDetector {
  constructor(private readonly store: MemoryStore) {}

  /**
   * Inspect recent events for a topic and create/update a mid-term card
   * when the occurrence count crosses PATTERN_THRESHOLD.
   */
  async processEvent(
    event: MemoryEvent,
    userId: string,
  ): Promise<MidTermCard | null> {
    const { topic_key, context_bucket, action, platform } = event;

    // Only negative/blocking actions form block patterns; positive ones form interest patterns
    const patternType = this.inferPatternType(action);
    if (!patternType) return null;

    // Count recent events for this topic + action type
    const recentEvents = await this.store.getRecentEventsByTopic(topic_key, 100);
    const relevantEvents = recentEvents.filter(
      (e) => e.user_id === userId && this.inferPatternType(e.action) === patternType,
    );

    log.debug(
      `Topic "${topic_key}": ${relevantEvents.length} relevant events (threshold: ${PATTERN_THRESHOLD})`,
    );

    if (relevantEvents.length < PATTERN_THRESHOLD) return null;

    // Check if a card already exists for this topic + context
    const existing = await this.store.findCardByTopic(userId, context_bucket, topic_key);

    if (existing) {
      // Reinforce existing card
      const updated: MidTermCard = {
        ...existing,
        occurrence_count: existing.occurrence_count + 1,
        last_seen_at: now(),
        status: 'core',
        platforms: dedupeArray([...existing.platforms, platform]),
        confidence: Math.min(1, existing.confidence + 0.05),
        updated_at: now(),
      };
      await this.store.upsertCard(updated);
      log.debug(`Reinforced mid-term card for "${topic_key}"`);
      return updated;
    }

    // Create new mid-term card
    const card: MidTermCard = {
      card_id: generateId(),
      user_id: userId,
      context_bucket,
      pattern_type: patternType,
      topic_key,
      occurrence_count: relevantEvents.length,
      last_seen_at: now(),
      first_seen_at: recentEvents[recentEvents.length - 1]?.occurred_at ?? now(),
      confidence: Math.min(1, relevantEvents.length / (PATTERN_THRESHOLD * 2)),
      platforms: dedupeArray(relevantEvents.map((e) => e.platform)),
      status: 'core',
      created_at: now(),
      updated_at: now(),
    };

    await this.store.upsertCard(card);
    log.info(`Created mid-term card: ${patternType} for "${topic_key}" in ${context_bucket}`);
    return card;
  }

  /**
   * Check if a mid-term card should trigger an action for given topics.
   */
  async matchCards(
    userId: string,
    context: ContextBucket,
    topics: string[],
  ): Promise<MidTermCard[]> {
    const cards = await this.store.getCardsByUserContext(userId, context);
    const activeCards = cards.filter(
      (c) => c.status === 'core' || c.status === 'dream',
    );

    return activeCards.filter((card) => {
      const topicName = card.topic_key.split(':').pop() ?? '';
      return topics.some(
        (t) =>
          t.toLowerCase().includes(topicName.toLowerCase()) ||
          topicName.toLowerCase().includes(t.toLowerCase()),
      );
    });
  }

  private inferPatternType(action: MemoryEvent['action']): PatternType | null {
    switch (action) {
      case 'not_interested':
        return 'block_pattern';
      case 'block_forever':
        return 'block_pattern';
      case 'interested':
        return 'interest_pattern';
      case 'one_time':
        return 'research_pattern';
      default:
        return null;
    }
  }
}

function dedupeArray<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
