import type { ScoringFactor, ContentAction, RecommendationResult } from '@shared/types';

export class Explainer {
  buildExplanation(
    action: ContentAction,
    score: number,
    factors: ScoringFactor[],
    contentTitle: string,
  ): Pick<RecommendationResult, 'explanation' | 'hide_reason' | 'boost_reason'> {
    const topFactor = factors.reduce(
      (max, f) => (Math.abs(f.score * f.weight) > Math.abs(max.score * max.weight) ? f : max),
      factors[0] ?? { name: 'unknown', score: 0, weight: 0, explanation: '' },
    );

    switch (action) {
      case 'hide':
        return {
          explanation: `Hidden: ${topFactor.explanation}`,
          hide_reason: this.buildHideReason(factors),
        };
      case 'suppress':
        return {
          explanation: `Reduced: ${topFactor.explanation}`,
        };
      case 'boost':
        return {
          explanation: `Boosted: ${topFactor.explanation}`,
          boost_reason: this.buildBoostReason(factors),
        };
      default:
        return {
          explanation: `Showing normally (score: ${score.toFixed(2)})`,
        };
    }
  }

  private buildHideReason(factors: ScoringFactor[]): string {
    const blocking = factors.filter((f) => f.score < 0).sort((a, b) => a.score - b.score);
    if (blocking.length === 0) return 'Low relevance score';

    const top = blocking[0]!;
    return top.explanation;
  }

  private buildBoostReason(factors: ScoringFactor[]): string {
    const boosting = factors.filter((f) => f.score > 0).sort((a, b) => b.score - a.score);
    if (boosting.length === 0) return 'High relevance';
    return boosting[0]!.explanation;
  }
}
