import { BaseAgent } from './BaseAgent';
import type { TaskContext, BrainTask } from '../orchestrator/types';
import type { ContentAction, ScoringFactor } from '@schema/content';

export interface FilterDecision {
  action: ContentAction;
  confidence: number;
  reasons: string[];
  scoringFactors: ScoringFactor[];
  reversible: true;
}

/**
 * FilterAgent — feed quality control.
 *
 * Decides what content to show, dim, or hide using:
 * - score_content: 5-factor scoring from RecommendationEngine
 * - match_topics: interest graph topic matching
 * - check_history: duplicate/saturation detection
 * - apply_rules: user-defined filter rules
 * - explain_decision: human-readable explanation generation
 *
 * Performance budget: <15ms per card (runs on every card in feed).
 */
export class FilterAgent extends BaseAgent {
  readonly name = 'filter' as const;
  readonly description = 'Feed quality control — decides what to show, dim, or hide';
  readonly budgetMs = 15;

  protected async run(
    context: TaskContext,
    _task: BrainTask,
  ): Promise<{ data: FilterDecision; confidence: number; reasoning?: string }> {
    const content = context.content;
    if (!content) {
      return {
        data: {
          action: 'show',
          confidence: 0.5,
          reasons: ['No content to filter'],
          scoringFactors: [],
          reversible: true,
        },
        confidence: 0.5,
      };
    }

    // 1. Score content using the scoring tool
    const scoreResult = await this.useTool<{
      action: ContentAction;
      score: number;
      confidence: number;
      factors: ScoringFactor[];
      explanation: string;
    }>('score_content', {
      content,
      platform: context.platform,
      aggressiveness: context.aggressiveness ?? 0.5,
    });

    if (scoreResult.success && scoreResult.data) {
      const { action, confidence, factors, explanation } = scoreResult.data;

      const decision: FilterDecision = {
        action,
        confidence,
        reasons: [explanation],
        scoringFactors: factors,
        reversible: true,
      };

      return {
        data: decision,
        confidence,
        reasoning: explanation,
      };
    }

    // 2. Fallback: simple topic matching if scoring tool unavailable
    const matchResult = await this.useTool<{ matched: boolean; topics: string[] }>('match_topics', {
      content,
      platform: context.platform,
    });

    if (matchResult.success && matchResult.data?.matched) {
      return {
        data: {
          action: 'hide',
          confidence: 0.7,
          reasons: [`Matches blocked topics: ${matchResult.data.topics.join(', ')}`],
          scoringFactors: [],
          reversible: true,
        },
        confidence: 0.7,
        reasoning: `Content matches blocked topics`,
      };
    }

    // 3. Default: show everything
    return {
      data: {
        action: 'show',
        confidence: 0.5,
        reasons: ['No filtering rules matched'],
        scoringFactors: [],
        reversible: true,
      },
      confidence: 0.5,
    };
  }
}
