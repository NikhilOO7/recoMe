import { createLogger } from '@utils/Logger';
import { generateId } from '@utils/index';
import { PolicyEngine, type PolicySignal } from '../policy/PolicyEngine';
import { CommerceExplainer } from './CommerceExplainer';
import { IntentRepo, ProductRepo, DecisionRepo } from '../storage/CommerceRepo';
import type { CandidateEntity } from '@schema/entities';
import type { DecisionType, PageContext, DecisionRecord } from '@schema/decisions';
import type { ShoppingContext } from '@schema/context';

const log = createLogger('CommerceScorer');

/** Score thresholds from brain spec. */
const THRESHOLDS = {
  boost: 0.5,
  cautionLow: -0.2,
  cautionHigh: -0.59,
  suppress: -0.6,
} as const;

export interface ScoreResponseItem {
  candidateId: string;
  score: number;
  decision: DecisionType;
  explanation: string;
  confidence: number;
  factors: string[];
}

export interface ScoreResponse {
  items: ScoreResponseItem[];
  computedAt: string;
}

export class CommerceScorer {
  private readonly policy = new PolicyEngine();
  private readonly explainer = new CommerceExplainer();
  private readonly intents = new IntentRepo();
  private readonly products = new ProductRepo();
  private readonly decisions = new DecisionRepo();

  /**
   * Score a batch of candidate entities given page context and active shopping contexts.
   * Implements the full pipeline: graph retrieval → context merge → policy → score → decision → explain.
   */
  async score(
    candidates: CandidateEntity[],
    pageContext: PageContext,
    activeContexts: ShoppingContext[] = [],
  ): Promise<ScoreResponse> {
    const items: ScoreResponseItem[] = [];

    for (const candidate of candidates) {
      const item = await this.scoreCandidate(candidate, pageContext, activeContexts);
      items.push(item);
    }

    log.debug(`Scored ${items.length} candidates for ${pageContext.site}:${pageContext.pageType}`);

    return {
      items,
      computedAt: new Date().toISOString(),
    };
  }

  private async scoreCandidate(
    candidate: CandidateEntity,
    pageContext: PageContext,
    activeContexts: ShoppingContext[],
  ): Promise<ScoreResponseItem> {
    // 1. Retrieve all intents related to this candidate
    const allIntents = await this.gatherRelevantIntents(candidate);

    // 2. Evaluate intent-based policy signals
    let signals = this.policy.evaluateIntents(
      allIntents,
      candidate.candidateId,
      candidate.brandId,
      candidate.sellerId,
      this.getCategoryIds(candidate),
    );

    // 3. Evaluate context-based signals
    const price = candidate.metadata['price'] as number | undefined;
    const rating = candidate.metadata['rating'] as number | undefined;
    const contextSignals = this.policy.evaluateContexts(activeContexts, price, rating);
    signals = [...signals, ...contextSignals];

    // 4. Apply overfitting protection
    signals = this.policy.applyOverfitProtection(signals);

    // 5. Compute aggregate score
    const { score, confidence } = this.aggregate(signals);

    // 6. Map to decision
    const decision = this.mapDecision(score);

    // 7. Generate explanation
    const { explanation, factors } = this.explainer.explain(
      decision,
      score,
      signals,
      candidate.normalizedText || candidate.rawText,
    );

    // 8. Persist decision record
    const record: DecisionRecord = {
      decisionId: generateId(),
      candidateId: candidate.candidateId,
      candidateType: candidate.entityType,
      score,
      confidence,
      decision,
      explanation,
      factors,
      pageContext,
      createdAt: new Date().toISOString(),
    };
    await this.decisions.put(record);

    return {
      candidateId: candidate.candidateId,
      score,
      decision,
      explanation,
      confidence,
      factors,
    };
  }

  /**
   * Gather all intents that could be relevant to this candidate:
   * - direct entity intents
   * - brand-level intents (if candidate has brandId)
   * - seller-level intents (if candidate has sellerId)
   */
  private async gatherRelevantIntents(candidate: CandidateEntity) {
    const intentSets = await Promise.all([
      this.intents.getByEntity(candidate.candidateId),
      candidate.brandId ? this.intents.getByEntity(candidate.brandId) : Promise.resolve([]),
      candidate.sellerId ? this.intents.getByEntity(candidate.sellerId) : Promise.resolve([]),
      candidate.productId ? this.intents.getByEntity(candidate.productId) : Promise.resolve([]),
    ]);

    // Also check for category-level intents
    const categoryIds = this.getCategoryIds(candidate);
    if (categoryIds.length > 0) {
      const categoryIntents = await Promise.all(
        categoryIds.map((id) => this.intents.getByEntity(id)),
      );
      intentSets.push(...categoryIntents);
    }

    // Deduplicate by intent ID
    const seen = new Set<string>();
    const all = [];
    for (const set of intentSets) {
      for (const intent of set) {
        if (!seen.has(intent.id)) {
          seen.add(intent.id);
          all.push(intent);
        }
      }
    }
    return all;
  }

  /**
   * Extract category IDs from candidate metadata.
   */
  private getCategoryIds(candidate: CandidateEntity): string[] {
    const cats = candidate.metadata['categoryIds'];
    if (Array.isArray(cats)) return cats as string[];
    return [];
  }

  /**
   * Compute weighted aggregate score and confidence from policy signals.
   */
  private aggregate(signals: PolicySignal[]): { score: number; confidence: number } {
    if (signals.length === 0) return { score: 0, confidence: 0.5 };

    const totalWeight = signals.reduce((sum, s) => sum + Math.abs(s.confidence), 0);
    if (totalWeight === 0) return { score: 0, confidence: 0.5 };

    const weightedScore = signals.reduce((sum, s) => sum + s.score * s.confidence, 0) / totalWeight;

    // Confidence: higher when more signals agree
    const agreeing = signals.filter((s) => Math.sign(s.score) === Math.sign(weightedScore));
    const confidence = Math.min(1, 0.4 + (agreeing.length / signals.length) * 0.6);

    return {
      score: Math.max(-1, Math.min(1, weightedScore)),
      confidence,
    };
  }

  /**
   * Map numeric score to decision type per brain spec thresholds.
   */
  private mapDecision(score: number): DecisionType {
    if (score >= THRESHOLDS.boost) return 'boost';
    if (score <= THRESHOLDS.suppress) return 'suppress';
    if (score <= THRESHOLDS.cautionLow) return 'caution';
    return 'neutral';
  }
}
