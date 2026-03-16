import type { IntentEvent, IntentType } from '@schema/intent';
import type { ShoppingContext } from '@schema/context';

/**
 * A scored signal produced by policy evaluation.
 * Positive = favourable, negative = unfavourable.
 */
export interface PolicySignal {
  source: string;
  score: number; // -1 to +1
  confidence: number; // 0 to 1
  explanation: string;
}

/** How much each intent type contributes to scoring. */
const INTENT_SCORE: Record<IntentType, number> = {
  interested: 0.6,
  not_interested: -0.7,
  already_bought: -0.5,
  one_time_need: -0.3,
  researching: 0.2,
  prefer_brand: 0.5,
  avoid_seller: -0.8,
  quality_first: 0.0, // context modifier, scored separately
  budget_sensitive: 0.0, // context modifier, scored separately
};

/** Decay factor per day of age for intent signals. */
const INTENT_DECAY_PER_DAY = 0.02;

/** Maximum age (days) after which an intent signal is fully decayed. */
const MAX_INTENT_AGE_DAYS = 90;

export class PolicyEngine {
  /**
   * Evaluate all active intents for a candidate and produce policy signals.
   * Handles decay, expiration, and scope-based weighting.
   */
  evaluateIntents(
    intents: IntentEvent[],
    candidateEntityId: string,
    candidateBrandId?: string,
    candidateSellerId?: string,
    candidateCategoryIds?: string[],
  ): PolicySignal[] {
    const now = new Date();
    const signals: PolicySignal[] = [];

    for (const intent of intents) {
      // Skip expired intents
      if (intent.expiresAt && new Date(intent.expiresAt) < now) continue;

      // Check if this intent applies to the candidate
      if (
        !this.intentApplies(
          intent,
          candidateEntityId,
          candidateBrandId,
          candidateSellerId,
          candidateCategoryIds,
        )
      ) {
        continue;
      }

      const baseScore = INTENT_SCORE[intent.intentType];
      if (baseScore === 0) continue; // context modifiers handled separately

      // Apply time decay
      const ageDays =
        (now.getTime() - new Date(intent.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > MAX_INTENT_AGE_DAYS) continue;

      const decayFactor = Math.max(0, 1 - ageDays * INTENT_DECAY_PER_DAY);
      const score = baseScore * decayFactor;
      const confidence = intent.confidence ?? 1.0;

      signals.push({
        source: `intent:${intent.intentType}`,
        score,
        confidence: confidence * decayFactor,
        explanation: this.intentExplanation(intent, ageDays),
      });
    }

    return signals;
  }

  /**
   * Evaluate active shopping contexts and produce context-based signals.
   */
  evaluateContexts(
    contexts: ShoppingContext[],
    candidatePrice?: number,
    candidateQualityProxy?: number,
  ): PolicySignal[] {
    const signals: PolicySignal[] = [];

    for (const ctx of contexts) {
      if (!ctx.isActive) continue;
      if (ctx.expiresAt && new Date(ctx.expiresAt) < new Date()) continue;

      switch (ctx.type) {
        case 'budget': {
          if (candidatePrice !== undefined) {
            // Lower price → positive signal under budget mode
            const score = candidatePrice < 50 ? 0.3 : candidatePrice < 100 ? 0.1 : -0.2;
            signals.push({
              source: 'context:budget',
              score,
              confidence: 0.7,
              explanation: `Budget mode: ${candidatePrice < 100 ? 'price fits budget' : 'above typical budget'}`,
            });
          }
          break;
        }
        case 'quality': {
          if (candidateQualityProxy !== undefined) {
            const score =
              candidateQualityProxy >= 4.0 ? 0.4 : candidateQualityProxy >= 3.5 ? 0.1 : -0.3;
            signals.push({
              source: 'context:quality',
              score,
              confidence: 0.7,
              explanation: `Quality mode: rating ${candidateQualityProxy.toFixed(1)} ${candidateQualityProxy >= 4.0 ? 'meets' : 'below'} quality bar`,
            });
          }
          break;
        }
        case 'research': {
          // Research mode reduces suppression — add a mild positive signal
          signals.push({
            source: 'context:research',
            score: 0.2,
            confidence: 0.5,
            explanation: 'Research mode: showing more options for comparison',
          });
          break;
        }
        case 'gift': {
          signals.push({
            source: 'context:gift',
            score: 0.1,
            confidence: 0.4,
            explanation: 'Gift mode: expanded recommendations',
          });
          break;
        }
      }
    }

    return signals;
  }

  /**
   * Apply overfitting protection: if only one weak intent event exists,
   * reduce its influence to prevent a single click from dominating.
   */
  applyOverfitProtection(signals: PolicySignal[]): PolicySignal[] {
    if (signals.length === 1 && Math.abs(signals[0]!.score) < 0.5) {
      const dampened = { ...signals[0]! };
      dampened.score *= 0.5;
      dampened.confidence *= 0.5;
      dampened.explanation += ' (single signal — dampened)';
      return [dampened];
    }
    return signals;
  }

  /**
   * Check whether an intent applies to a given candidate entity.
   */
  private intentApplies(
    intent: IntentEvent,
    candidateEntityId: string,
    candidateBrandId?: string,
    candidateSellerId?: string,
    candidateCategoryIds?: string[],
  ): boolean {
    switch (intent.scope) {
      case 'entity':
        return intent.entityId === candidateEntityId;
      case 'brand':
        return intent.entityId === candidateBrandId;
      case 'category':
        return (candidateCategoryIds ?? []).includes(intent.entityId);
      case 'session':
        return true; // session-scoped intents apply to everything
    }
  }

  /**
   * Generate a human-readable explanation for an intent signal.
   */
  private intentExplanation(intent: IntentEvent, ageDays: number): string {
    const recency =
      ageDays < 1 ? 'today' : ageDays < 7 ? 'this week' : `${Math.round(ageDays)} days ago`;

    switch (intent.intentType) {
      case 'interested':
        return `You showed interest in this ${intent.entityType} ${recency}`;
      case 'not_interested':
        return `You marked this ${intent.entityType} as not interesting ${recency}`;
      case 'already_bought':
        return `You already bought a similar ${intent.entityType} ${recency}`;
      case 'one_time_need':
        return `Marked as one-time need ${recency}`;
      case 'researching':
        return `You're researching this ${intent.entityType}`;
      case 'prefer_brand':
        return `You prefer this brand`;
      case 'avoid_seller':
        return `You want to avoid this seller`;
      case 'quality_first':
        return 'Quality-first mode active';
      case 'budget_sensitive':
        return 'Budget-sensitive mode active';
    }
  }
}
