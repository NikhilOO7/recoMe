import { FACTOR_WEIGHTS } from '@shared/constants';
import { normalizeTopicKey } from '@shared/utils';
import type { MemoryService } from '@intelligence/memory/MemoryService';
import type { AffinityCalculator } from '@intelligence/graph/AffinityCalculator';
import type { PatternDetector } from '@intelligence/memory/PatternDetector';
import type {
  ContentMetadata,
  ScoringFactor,
  ContextBucket,
} from '@shared/types';

const USER_ID = 'local_user';

export class FactorCalculators {
  constructor(
    private readonly memory: MemoryService,
    private readonly affinity: AffinityCalculator,
    private readonly patterns: PatternDetector,
  ) {}

  /**
   * Check if any topic is in a direct block (facts_prefs or general overlay).
   * A direct block short-circuits the entire pipeline.
   */
  async directBlock(
    content: ContentMetadata,
    context: ContextBucket,
  ): Promise<ScoringFactor> {
    const titleCandidates = content.title ? [content.title] : [];
    const { hide, reason } = await this.memory.shouldHide(
      [...content.topics, ...content.entities, ...titleCandidates],
      context,
    );

    return {
      name: 'direct_block',
      score: hide ? -1 : 0,
      weight: FACTOR_WEIGHTS.direct_block,
      explanation: hide ? (reason ?? 'Direct block match') : 'No direct block',
    };
  }

  /**
   * Check mid-term pattern card matches.
   */
  async patternMatch(
    content: ContentMetadata,
    context: ContextBucket,
  ): Promise<ScoringFactor> {
    const titleCandidates = content.title ? [content.title] : [];
    const cards = await this.patterns.matchCards(
      USER_ID,
      context,
      [...content.topics, ...content.entities, ...titleCandidates],
    );

    if (cards.length === 0) {
      return { name: 'pattern_match', score: 0, weight: FACTOR_WEIGHTS.pattern_match, explanation: 'No pattern match' };
    }

    const blockCards = cards.filter((c) => c.pattern_type === 'block_pattern');
    const interestCards = cards.filter((c) => c.pattern_type === 'interest_pattern');

    if (blockCards.length > 0) {
      const topCard = blockCards[0]!;
      const strength = topCard.confidence;
      return {
        name: 'pattern_match',
        score: -strength,
        weight: FACTOR_WEIGHTS.pattern_match,
        explanation: `Block pattern: "${topCard.topic_key.split(':').pop()}" (${Math.round(topCard.occurrence_count)} times)`,
      };
    }

    if (interestCards.length > 0) {
      const topCard = interestCards[0]!;
      return {
        name: 'pattern_match',
        score: topCard.confidence,
        weight: FACTOR_WEIGHTS.pattern_match,
        explanation: `Interest pattern: "${topCard.topic_key.split(':').pop()}"`,
      };
    }

    return { name: 'pattern_match', score: 0, weight: FACTOR_WEIGHTS.pattern_match, explanation: 'No pattern match' };
  }

  /**
   * Knowledge graph affinity score across all content topics.
   */
  async graphAffinity(
    content: ContentMetadata,
    _context: ContextBucket,
  ): Promise<ScoringFactor> {
    const allTerms = [...content.topics, ...content.entities];
    if (allTerms.length === 0) {
      return { name: 'graph_affinity', score: 0, weight: FACTOR_WEIGHTS.graph_affinity, explanation: 'No entities to score' };
    }

    const scores = await this.affinity.batchCalculate(USER_ID, allTerms.map(normalizeTopicKey));
    const values = [...scores.values()].filter((s) => s !== 0);

    if (values.length === 0) {
      return { name: 'graph_affinity', score: 0, weight: FACTOR_WEIGHTS.graph_affinity, explanation: 'No graph relations found' };
    }

    // Use the min score (most negative wins) — avoids hiding everything
    const aggregate = values.reduce((a, b) => a + b, 0) / values.length;

    return {
      name: 'graph_affinity',
      score: aggregate,
      weight: FACTOR_WEIGHTS.graph_affinity,
      explanation: `Graph affinity: ${aggregate.toFixed(2)}`,
    };
  }

  /**
   * Context fit: does this content belong in the current context?
   */
  contextFit(content: ContentMetadata, context: ContextBucket): ScoringFactor {
    const platformContextMap: Record<string, ContextBucket[]> = {
      youtube: ['entertainment', 'learning', 'social'],
      amazon: ['shopping'],
      twitter: ['social', 'general'],
      facebook: ['social', 'general'],
      instagram: ['social', 'entertainment'],
      ebay: ['shopping'],
      walmart: ['shopping'],
    };

    const expectedContexts = platformContextMap[content.platform] ?? ['general'];
    const fits = expectedContexts.includes(context);

    return {
      name: 'context_fit',
      score: fits ? 0.3 : -0.1,
      weight: FACTOR_WEIGHTS.context_fit,
      explanation: fits
        ? `${content.platform} fits ${context} context`
        : `${content.platform} not typical for ${context}`,
    };
  }

  /**
   * Recency: favour newer content slightly.
   */
  recency(content: ContentMetadata): ScoringFactor {
    if (!content.published_at) {
      return { name: 'recency', score: 0, weight: FACTOR_WEIGHTS.recency, explanation: 'No publish date' };
    }

    const ageMs = Date.now() - content.published_at;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    // Score decays: 0.5 at 7 days, ~0 at 30 days
    const score = Math.max(0, 0.5 - ageDays / 60);

    return {
      name: 'recency',
      score,
      weight: FACTOR_WEIGHTS.recency,
      explanation: `Content is ${Math.round(ageDays)} day(s) old`,
    };
  }
}