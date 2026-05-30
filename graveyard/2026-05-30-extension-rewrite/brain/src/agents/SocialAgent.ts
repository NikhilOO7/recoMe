import { BaseAgent } from './BaseAgent';
import type { TaskContext, BrainTask } from '../orchestrator/types';

export interface SocialResult {
  trends?: Array<{ topic: string; momentum: number; relevance: number }>;
  communities?: Array<{ name: string; memberCount: number; platform: string }>;
  socialProof?: Array<{ source: string; rating: number; text: string }>;
  events?: Array<{ title: string; date?: number; location?: string; url?: string }>;
}

/**
 * SocialAgent — community & trend intelligence.
 *
 * Understands social signals: trending topics, community dynamics,
 * influential voices, and social proof relevant to the user's interests.
 *
 * Tools:
 * - detect_trends: identify trending topics in user's interest areas
 * - find_communities: discover matching groups/communities
 * - social_proof: find social signals for a product/content
 * - find_events: discover events matching interests + location
 * - content_calendar: detect upcoming launches/releases
 *
 * Performance budget: <200ms (mostly graph queries).
 */
export class SocialAgent extends BaseAgent {
  readonly name = 'social' as const;
  readonly description = 'Community & trend intelligence — trends, social proof, events';
  readonly budgetMs = 200;

  protected async run(
    context: TaskContext,
    _task: BrainTask,
  ): Promise<{ data: SocialResult; confidence: number; reasoning?: string }> {
    const result: SocialResult = {};

    // Run trend detection and social proof in parallel
    const [trendResult, proofResult] = await Promise.all([
      this.useTool<{ trends: SocialResult['trends'] }>('detect_trends', {
        platform: context.platform,
        pageUrl: context.pageUrl,
      }),
      context.content
        ? this.useTool<{ proof: SocialResult['socialProof'] }>('social_proof', {
            contentId: context.content.id,
            platform: context.platform,
          })
        : Promise.resolve({
            success: false,
            data: null,
            metadata: { latencyMs: 0, dataSourcesUsed: [], cacheHit: false },
          } as const),
    ]);

    if (trendResult.success && trendResult.data?.trends) {
      result.trends = trendResult.data.trends;
    }

    if (
      proofResult.success &&
      proofResult.data &&
      'proof' in proofResult.data &&
      proofResult.data.proof
    ) {
      result.socialProof = proofResult.data.proof;
    }

    const hasData =
      (result.trends && result.trends.length > 0) ||
      (result.socialProof && result.socialProof.length > 0);

    return {
      data: result,
      confidence: hasData ? 0.6 : 0.2,
      reasoning: hasData
        ? `Found ${result.trends?.length ?? 0} trends, ${result.socialProof?.length ?? 0} social signals`
        : 'No social signals detected',
    };
  }
}
