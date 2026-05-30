import { createLogger } from '@utils/Logger';
import { getBrain } from '@brain/BrainFacade';
import { AIExplainer } from '@brain/recommendation/AIExplainer';
import type { CandidateEntity } from '@schema/entities';
import type { PageContext } from '@schema/decisions';
import type { ShoppingContext } from '@schema/context';
import type { ScoreResponseItem } from '@brain/scoring/CommerceScorer';
import type { UserContext } from '../retrieval';

const log = createLogger('CompareService');

/** A ranked candidate with explanation and tradeoff analysis */
export interface RankedCandidate {
  candidateId: string;
  rank: number;
  score: number;
  confidence: number;
  decision: string;
  explanation: string;
  tradeoffs: string[];
  metadata: Record<string, unknown>;
}

/** Full comparison result */
export interface CompareResult {
  ranked: RankedCandidate[];
  summary: string;
  bestMatch: RankedCandidate | null;
  alternatives: RankedCandidate[];
}

export class CompareService {
  private readonly aiExplainer = new AIExplainer();

  /**
   * Compare and rank a set of candidates using the brain scoring engine
   * and enrich with tradeoff analysis from user context.
   * When an LLM is available, generates an AI-powered comparison narrative.
   */
  async compareAndRank(
    candidates: CandidateEntity[],
    pageContext: PageContext,
    userContext: UserContext,
    activeContexts: ShoppingContext[] = [],
  ): Promise<CompareResult> {
    if (candidates.length === 0) {
      return {
        ranked: [],
        summary: 'No candidates to compare.',
        bestMatch: null,
        alternatives: [],
      };
    }

    // Score all candidates via brain
    const brain = getBrain();
    const scoreResponse = await brain.scoreEntities(candidates, pageContext, activeContexts);

    // Build candidate lookup for metadata
    const candidateMap = new Map<string, CandidateEntity>();
    for (const c of candidates) candidateMap.set(c.candidateId, c);

    // Sort by score descending
    const sorted = [...scoreResponse.items].sort((a, b) => b.score - a.score);

    // Enrich with tradeoff analysis
    const ranked: RankedCandidate[] = sorted.map((item, index) => {
      const candidate = candidateMap.get(item.candidateId);
      const tradeoffs = this.analyzeTradeoffs(item, candidate, userContext, sorted);

      return {
        candidateId: item.candidateId,
        rank: index + 1,
        score: item.score,
        confidence: item.confidence,
        decision: item.decision,
        explanation: item.explanation,
        tradeoffs,
        metadata: candidate?.metadata ?? {},
      };
    });

    const bestMatch = ranked[0] ?? null;
    const alternatives = ranked.slice(1);

    // Try AI-powered narrative; fall back to template summary
    const scores = sorted.map((s) => ({
      candidateId: s.candidateId,
      score: s.score,
      decision: s.decision,
      explanation: s.explanation,
    }));
    const aiNarrative = await this.aiExplainer
      .compareNarrative(candidates, userContext, scores)
      .catch(() => null);
    const summary = aiNarrative ?? this.buildSummary(bestMatch, alternatives, userContext);

    log.debug(
      `Compared ${candidates.length} candidates. Best: ${bestMatch?.candidateId ?? 'none'}`,
    );

    return { ranked, summary, bestMatch, alternatives };
  }

  /**
   * Quick comparison between exactly two candidates — highlights key differences.
   */
  async comparePair(
    candidateA: CandidateEntity,
    candidateB: CandidateEntity,
    pageContext: PageContext,
    userContext: UserContext,
  ): Promise<{ winner: RankedCandidate; loser: RankedCandidate; differences: string[] }> {
    const result = await this.compareAndRank([candidateA, candidateB], pageContext, userContext);

    const winner = result.ranked[0]!;
    const loser = result.ranked[1]!;

    const differences = this.findDifferences(candidateA, candidateB, userContext);

    return { winner, loser, differences };
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private analyzeTradeoffs(
    item: ScoreResponseItem,
    candidate: CandidateEntity | undefined,
    userContext: UserContext,
    _allItems: ScoreResponseItem[],
  ): string[] {
    const tradeoffs: string[] = [];
    if (!candidate) return tradeoffs;

    const price = candidate.metadata['price'] as number | undefined;
    const rating = candidate.metadata['rating'] as number | undefined;
    const brand = candidate.metadata['brand'] as string | undefined;
    const seller = candidate.metadata['seller'] as string | undefined;
    const isPrime = candidate.metadata['isPrime'] as boolean | undefined;

    // Price tradeoff
    if (price !== undefined) {
      if (price < 50) {
        tradeoffs.push('Budget-friendly price point');
      } else if (price > 200) {
        tradeoffs.push('Premium price — may not suit budget shoppers');
      }
    }

    // Rating tradeoff
    if (rating !== undefined) {
      if (rating >= 4.5) {
        tradeoffs.push(`Highly rated (${rating.toFixed(1)}/5)`);
      } else if (rating < 3.5) {
        tradeoffs.push(`Below-average rating (${rating.toFixed(1)}/5)`);
      }
    }

    // Brand preference alignment
    if (brand) {
      const brandId = `brand:${brand.toLowerCase().replace(/\s+/g, '_')}`;
      const brandPref = userContext.brandPreferences.find((p) => p.brandId === brandId);
      if (brandPref?.sentiment === 'positive') {
        tradeoffs.push(`From preferred brand: ${brand}`);
      } else if (brandPref?.sentiment === 'negative') {
        tradeoffs.push(`From a brand you've marked negatively: ${brand}`);
      }
    }

    // Seller avoidance
    if (seller) {
      const sellerId = `seller:${seller.toLowerCase().replace(/\s+/g, '_')}`;
      const avoided = userContext.sellerPreferences.find((s) => s.sellerId === sellerId);
      if (avoided) {
        tradeoffs.push(`Sold by ${seller} — you've avoided this seller`);
      }
    }

    // Prime shipping
    if (isPrime) {
      tradeoffs.push('Prime shipping available');
    }

    // Confidence caveat
    if (item.confidence < 0.5) {
      tradeoffs.push('Low confidence — limited preference data for this product');
    }

    return tradeoffs;
  }

  private findDifferences(
    a: CandidateEntity,
    b: CandidateEntity,
    _userContext: UserContext,
  ): string[] {
    const diffs: string[] = [];

    const priceA = a.metadata['price'] as number | undefined;
    const priceB = b.metadata['price'] as number | undefined;
    if (priceA !== undefined && priceB !== undefined) {
      const diff = Math.abs(priceA - priceB);
      if (diff > 1) {
        const cheaper = priceA < priceB ? a : b;
        diffs.push(`${cheaper.rawText} is $${diff.toFixed(2)} cheaper`);
      }
    }

    const ratingA = a.metadata['rating'] as number | undefined;
    const ratingB = b.metadata['rating'] as number | undefined;
    if (ratingA !== undefined && ratingB !== undefined && ratingA !== ratingB) {
      const better = ratingA > ratingB ? a : b;
      diffs.push(
        `${better.rawText} has a higher rating (${Math.max(ratingA, ratingB).toFixed(1)} vs ${Math.min(ratingA, ratingB).toFixed(1)})`,
      );
    }

    const brandA = a.metadata['brand'] as string | undefined;
    const brandB = b.metadata['brand'] as string | undefined;
    if (brandA && brandB && brandA !== brandB) {
      diffs.push(`Different brands: ${brandA} vs ${brandB}`);
    }

    const primeA = a.metadata['isPrime'] as boolean | undefined;
    const primeB = b.metadata['isPrime'] as boolean | undefined;
    if (primeA !== primeB) {
      const hasPrime = primeA ? a : b;
      diffs.push(`${hasPrime.rawText} has Prime shipping`);
    }

    return diffs;
  }

  private buildSummary(
    bestMatch: RankedCandidate | null,
    alternatives: RankedCandidate[],
    userContext: UserContext,
  ): string {
    if (!bestMatch) return 'No products to compare.';

    const parts: string[] = [];

    const title = bestMatch.metadata['brand']
      ? `${bestMatch.metadata['brand']} product`
      : `Product ${bestMatch.candidateId}`;

    parts.push(`Best match: ${title}`);

    if (bestMatch.explanation) {
      parts.push(`Why: ${bestMatch.explanation}`);
    }

    if (alternatives.length > 0) {
      parts.push(
        `${alternatives.length} alternative${alternatives.length > 1 ? 's' : ''} available`,
      );
    }

    if (userContext.brandPreferences.length > 0) {
      const preferred = userContext.brandPreferences.filter((b) => b.sentiment === 'positive');
      if (preferred.length > 0) {
        parts.push(
          `Based on your preference for: ${preferred.map((b) => b.displayName).join(', ')}`,
        );
      }
    }

    return parts.join('. ') + '.';
  }
}
