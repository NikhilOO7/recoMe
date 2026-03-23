import { SCORE_THRESHOLDS } from '@shared/constants';
import { weightedAverage } from '@shared/utils';
import { createLogger } from '@shared/Logger';
import type { FactorCalculators } from './FactorCalculators';
import type { Explainer } from './Explainer';
import type {
  ContentMetadata,
  ContentAction,
  RecommendationResult,
  ScoringFactor,
  ContextBucket,
} from '@shared/types';

const log = createLogger('RecommendationEngine');

export class RecommendationEngine {
  constructor(
    private readonly factors: FactorCalculators,
    private readonly explainer: Explainer,
  ) {}

  /**
   * Score a piece of content and return a full recommendation result.
   * Direct blocks short-circuit the pipeline for performance.
   */
  async recommend(
    content: ContentMetadata,
    context: ContextBucket,
    aggressiveness = 0.5,
  ): Promise<RecommendationResult> {
    // 1. Check direct block first — no need to calculate other factors
    const directBlockFactor = await this.factors.directBlock(content, context);
    if (directBlockFactor.score <= -0.9) {
      const action: ContentAction = 'hide';
      const explanation = this.explainer.buildExplanation(
        action,
        -1,
        [directBlockFactor],
        content.title,
      );
      return {
        content_id: content.id,
        action,
        score: -1,
        confidence: 1,
        factors: [directBlockFactor],
        ...explanation,
      };
    }

    // 2. Calculate remaining factors in parallel
    const [patternFactor, graphFactor] = await Promise.all([
      this.factors.patternMatch(content, context),
      this.factors.graphAffinity(content, context),
    ]);

    const contextFactor = this.factors.contextFit(content, context);
    const recencyFactor = this.factors.recency(content);

    const allFactors: ScoringFactor[] = [
      directBlockFactor,
      patternFactor,
      graphFactor,
      contextFactor,
      recencyFactor,
    ];

    // 3. Weighted aggregate score
    const score = weightedAverage(allFactors.map((f) => ({ value: f.score, weight: f.weight })));

    // 4. Determine action
    const action = this.scoreToAction(score, aggressiveness);

    // 5. Confidence based on factor agreement
    const confidence = this.computeConfidence(allFactors, score);

    // 6. Build explanation
    const explanation = this.explainer.buildExplanation(action, score, allFactors, content.title);

    log.debug(`${content.title}: score=${score.toFixed(3)}, action=${action}`);

    return {
      content_id: content.id,
      action,
      score,
      confidence,
      factors: allFactors,
      ...explanation,
    };
  }

  private scoreToAction(score: number, aggressiveness: number): ContentAction {
    const hideThreshold = -0.9 + aggressiveness * 0.8; // 0→-0.9, 0.5→-0.5, 1→-0.1
    const suppressThreshold = -0.6 + aggressiveness * 0.6; // scales similarly
    if (score < hideThreshold) return 'hide';
    if (score < suppressThreshold) return 'suppress';
    if (score > SCORE_THRESHOLDS.boost) return 'boost';
    return 'show';
  }

  private computeConfidence(factors: ScoringFactor[], finalScore: number): number {
    const weightedFactors = factors.filter((f) => f.weight > 0 && f.score !== 0);
    if (weightedFactors.length === 0) return 0.5;

    // Confidence is higher when factors agree (all same sign)
    const agreeing = weightedFactors.filter((f) => Math.sign(f.score) === Math.sign(finalScore));
    return Math.min(1, 0.5 + (agreeing.length / weightedFactors.length) * 0.5);
  }
}
