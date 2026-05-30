import type { DecisionType } from '@schema/decisions';
import type { PolicySignal } from '../policy/PolicyEngine';

export interface CommerceExplanation {
  explanation: string;
  factors: string[];
}

export class CommerceExplainer {
  /**
   * Build a human-readable explanation from policy signals and the final decision.
   * Picks the top contributing signal and frames it as a user-facing sentence.
   */
  explain(
    decision: DecisionType,
    score: number,
    signals: PolicySignal[],
    candidateTitle: string,
  ): CommerceExplanation {
    const factors = signals.filter((s) => s.score !== 0).map((s) => s.explanation);

    if (signals.length === 0) {
      return {
        explanation: `Showing "${candidateTitle}" — no preference data yet.`,
        factors: [],
      };
    }

    // Sort by absolute impact (score * confidence)
    const sorted = [...signals]
      .filter((s) => s.score !== 0)
      .sort((a, b) => Math.abs(b.score * b.confidence) - Math.abs(a.score * a.confidence));

    const top = sorted[0];
    if (!top) {
      return {
        explanation: `Showing "${candidateTitle}" normally.`,
        factors,
      };
    }

    switch (decision) {
      case 'boost':
        return {
          explanation: `Boosted: ${top.explanation}.`,
          factors,
        };

      case 'caution':
        return {
          explanation: `Caution: ${top.explanation}.`,
          factors,
        };

      case 'suppress':
        return {
          explanation: `Suppressed: ${top.explanation}.`,
          factors,
        };

      case 'neutral':
      default:
        if (score > 0.1) {
          return {
            explanation: `Slightly favoured: ${top.explanation}.`,
            factors,
          };
        }
        if (score < -0.1) {
          return {
            explanation: `Slightly less relevant: ${top.explanation}.`,
            factors,
          };
        }
        return {
          explanation: `Showing "${candidateTitle}" — no strong preference signal.`,
          factors,
        };
    }
  }
}
