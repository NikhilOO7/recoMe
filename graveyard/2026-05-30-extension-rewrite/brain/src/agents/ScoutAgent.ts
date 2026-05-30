import { BaseAgent } from './BaseAgent';
import type { TaskContext, BrainTask } from '../orchestrator/types';

export interface Opportunity {
  title: string;
  type: 'event' | 'course' | 'deal' | 'content' | 'community' | 'trend';
  benefit: string;
  timeSensitive: boolean;
  confidence: number;
  url?: string;
}

export interface ScoutResult {
  opportunities: Opportunity[];
  learningPaths?: string[];
}

/**
 * ScoutAgent — proactively finds opportunities, events, courses, and content
 * the user would benefit from.
 *
 * Tools:
 * - scan_page: deep-scan for opportunities beyond the main feed
 * - cross_reference: check opportunity against user's interest graph
 * - assess_benefit: evaluate concrete benefit to the user
 * - check_timeliness: determine if opportunity is time-sensitive
 * - find_similar: find similar opportunities the user might have missed
 *
 * Performance budget: <500ms (runs once per page load, background).
 */
export class ScoutAgent extends BaseAgent {
  readonly name = 'scout' as const;
  readonly description = 'Opportunity discovery — finds events, courses, deals, and content';
  readonly budgetMs = 500;

  protected async run(
    context: TaskContext,
    _task: BrainTask,
  ): Promise<{ data: ScoutResult; confidence: number; reasoning?: string }> {
    const opportunities: Opportunity[] = [];

    // 1. Scan page for opportunities
    const scanResult = await this.useTool<{ items: Opportunity[] }>('scan_page', {
      platform: context.platform,
      pageUrl: context.pageUrl,
    });

    if (scanResult.success && scanResult.data?.items) {
      // 2. Cross-reference each against user's interests
      for (const item of scanResult.data.items.slice(0, 5)) {
        const crossRef = await this.useTool<{ relevant: boolean; score: number }>(
          'cross_reference',
          { opportunity: item, platform: context.platform },
        );

        if (crossRef.success && crossRef.data?.relevant) {
          opportunities.push({ ...item, confidence: crossRef.data.score });
        }
      }
    }

    // 3. Check for browsing patterns that suggest comparison behavior
    const actions = context.recentActions ?? [];
    const recentTopics = actions
      .filter((a) => a.type === 'view' && a.platform === context.platform)
      .slice(-10);

    if (recentTopics.length >= 5) {
      const similarResult = await this.useTool<{ alternatives: Opportunity[] }>('find_similar', {
        recentViews: recentTopics,
        platform: context.platform,
      });

      if (similarResult.success && similarResult.data?.alternatives) {
        opportunities.push(...similarResult.data.alternatives);
      }
    }

    // Sort by confidence
    opportunities.sort((a, b) => b.confidence - a.confidence);

    const topOpps = opportunities.slice(0, 3);
    const avgConfidence =
      topOpps.length > 0 ? topOpps.reduce((s, o) => s + o.confidence, 0) / topOpps.length : 0.3;

    return {
      data: { opportunities: topOpps },
      confidence: avgConfidence,
      reasoning:
        topOpps.length > 0
          ? `Found ${topOpps.length} relevant opportunities`
          : 'No opportunities found on this page',
    };
  }
}
