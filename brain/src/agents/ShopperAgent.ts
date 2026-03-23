import { BaseAgent } from './BaseAgent';
import type { TaskContext, BrainTask } from '../orchestrator/types';

export interface ShopperResult {
  priceInfo?: {
    currentPrice?: number;
    priceHistory?: Array<{ date: number; price: number }>;
    isDeal: boolean;
    dealReason?: string;
  };
  alternatives?: Array<{ title: string; price: number; url?: string }>;
  reviewSummary?: {
    positivePercent: number;
    keyThemes: string[];
    concerns: string[];
  };
  recommendation?: string;
}

/**
 * ShopperAgent — commerce intelligence.
 *
 * Expert in shopping behavior: price tracking, deal finding, purchase timing,
 * product research, and cross-platform price comparison.
 *
 * Tools:
 * - track_price: add product to price tracking
 * - get_price_history: retrieve price history
 * - compare_prices: cross-platform price comparison
 * - analyze_reviews: extract key review themes
 * - find_alternatives: find similar products at different price points
 * - assess_deal: evaluate if current price is actually good
 * - calculate_value: compute cost-per-use
 *
 * Performance budget: <2s (may need to query stored data).
 */
export class ShopperAgent extends BaseAgent {
  readonly name = 'shopper' as const;
  readonly description = 'Commerce intelligence — prices, deals, reviews, alternatives';
  readonly budgetMs = 2000;

  protected async run(
    context: TaskContext,
    _task: BrainTask,
  ): Promise<{ data: ShopperResult; confidence: number; reasoning?: string }> {
    const content = context.content;
    if (!content || (content.type !== 'product' && content.type !== 'ad')) {
      return {
        data: {},
        confidence: 0.2,
        reasoning: 'Not a product page — skipping commerce analysis',
      };
    }

    const result: ShopperResult = {};

    // Run tools in parallel where possible
    const [priceResult, reviewResult, alternativesResult] = await Promise.all([
      this.useTool<ShopperResult['priceInfo']>('get_price_history', {
        contentId: content.id,
        title: content.title,
        platform: context.platform,
      }),
      this.useTool<ShopperResult['reviewSummary']>('analyze_reviews', {
        contentId: content.id,
        platform: context.platform,
      }),
      this.useTool<{ alternatives: ShopperResult['alternatives'] }>('find_alternatives', {
        content,
        platform: context.platform,
      }),
    ]);

    if (priceResult.success && priceResult.data) {
      result.priceInfo = priceResult.data;
    }

    if (reviewResult.success && reviewResult.data) {
      result.reviewSummary = reviewResult.data;
    }

    if (alternativesResult.success && alternativesResult.data?.alternatives) {
      result.alternatives = alternativesResult.data.alternatives;
    }

    // Assess deal quality if we have price info
    if (result.priceInfo) {
      const dealResult = await this.useTool<{ isDeal: boolean; reason: string }>('assess_deal', {
        priceHistory: result.priceInfo.priceHistory,
        currentPrice: result.priceInfo.currentPrice,
      });

      if (dealResult.success && dealResult.data) {
        result.priceInfo.isDeal = dealResult.data.isDeal;
        result.priceInfo.dealReason = dealResult.data.reason;
      }
    }

    // Build recommendation summary
    const parts: string[] = [];
    if (result.reviewSummary) {
      parts.push(`${result.reviewSummary.positivePercent}% positive reviews`);
    }
    if (result.priceInfo?.isDeal) {
      parts.push(result.priceInfo.dealReason ?? 'Good deal');
    }
    if (result.alternatives && result.alternatives.length > 0) {
      parts.push(`${result.alternatives.length} alternatives found`);
    }

    result.recommendation = parts.length > 0 ? parts.join('. ') : undefined;

    const confidence = this.computeConfidence(result);

    return {
      data: result,
      confidence,
      reasoning: result.recommendation ?? 'Limited commerce data available',
    };
  }

  private computeConfidence(result: ShopperResult): number {
    let score = 0.3;
    if (result.priceInfo) score += 0.2;
    if (result.reviewSummary) score += 0.2;
    if (result.alternatives && result.alternatives.length > 0) score += 0.15;
    if (result.priceInfo?.isDeal !== undefined) score += 0.15;
    return Math.min(1, score);
  }
}
