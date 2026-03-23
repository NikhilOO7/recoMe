import type {
  ProactiveInsight,
  RawOpportunity,
  RankingWeights,
  InsightFrequencyConfig,
} from './types';
import { DEFAULT_RANKING_WEIGHTS, DEFAULT_FREQUENCY_CONFIG } from './types';
import type { Platform } from '@schema/context';

/**
 * OpportunityRanker — scores raw opportunities against user interests
 * and enforces frequency/relevance thresholds.
 *
 * Scoring weights:
 * - Interest match (0.35) — alignment with known preferences
 * - Benefit clarity (0.25) — can we explain why this helps?
 * - Timeliness (0.20) — is this urgent or time-sensitive?
 * - Novelty (0.20) — is this something they haven't seen?
 */
export class OpportunityRanker {
  private readonly weights: RankingWeights;
  private readonly config: InsightFrequencyConfig;
  /** Track shown insight IDs for dedup */
  private readonly shownInsights = new Set<string>();
  /** Visit count for this page session */
  private visitInsightCount = 0;
  /** Daily count persisted in session storage */
  private dailyInsightCount = 0;
  private dailyCountDate = '';
  private idCounter = 0;

  constructor(weights?: Partial<RankingWeights>, config?: Partial<InsightFrequencyConfig>) {
    this.weights = { ...DEFAULT_RANKING_WEIGHTS, ...weights };
    this.config = { ...DEFAULT_FREQUENCY_CONFIG, ...config };
    this.loadDailyCount();
  }

  /**
   * Rank raw opportunities and return the top insights that pass thresholds.
   */
  rank(
    opportunities: RawOpportunity[],
    platform: Platform,
    userInterests: string[],
  ): ProactiveInsight[] {
    const remaining = this.config.maxPerVisit - this.visitInsightCount;
    const dailyRemaining = this.config.maxPerDay - this.dailyInsightCount;
    const limit = Math.min(remaining, dailyRemaining);

    if (limit <= 0) return [];

    const scored = opportunities
      .map((opp) => ({
        opp,
        score: this.scoreOpportunity(opp, userInterests),
      }))
      .filter((s) => s.score >= this.config.minRelevanceScore)
      .sort((a, b) => b.score - a.score);

    const results: ProactiveInsight[] = [];
    for (const { opp, score } of scored) {
      if (results.length >= limit) break;

      const id = `insight_${++this.idCounter}_${Date.now()}`;
      if (this.shownInsights.has(opp.title)) continue;

      results.push({
        id,
        platform,
        type: opp.type,
        title: opp.title,
        body: opp.body,
        benefit: opp.benefit,
        relevanceScore: score,
        sourceSignals: opp.sourceSignals,
        actionUrl: opp.url,
        actionLabel: opp.actionLabel,
        expiresAt: opp.expiresAt,
        platformContext: opp.platformContext,
        createdAt: Date.now(),
      });

      this.shownInsights.add(opp.title);
    }

    this.visitInsightCount += results.length;
    this.dailyInsightCount += results.length;
    this.saveDailyCount();

    return results;
  }

  private scoreOpportunity(opp: RawOpportunity, userInterests: string[]): number {
    const interestMatch = this.computeInterestMatch(opp, userInterests);
    const benefitClarity = opp.benefit.length > 10 ? 0.8 : 0.3;
    const timeliness = opp.timeliness;
    const novelty = this.shownInsights.has(opp.title) ? 0 : 0.8;

    return (
      this.weights.interestMatch * interestMatch +
      this.weights.benefitClarity * benefitClarity +
      this.weights.timeliness * timeliness +
      this.weights.novelty * novelty
    );
  }

  private computeInterestMatch(opp: RawOpportunity, userInterests: string[]): number {
    if (userInterests.length === 0) return 0.3;

    const signals = opp.sourceSignals.map((s) => s.toLowerCase());
    const title = opp.title.toLowerCase();
    const body = opp.body.toLowerCase();

    let matches = 0;
    for (const interest of userInterests) {
      const lower = interest.toLowerCase();
      if (signals.some((s) => s.includes(lower)) || title.includes(lower) || body.includes(lower)) {
        matches++;
      }
    }

    return Math.min(1, matches / Math.max(1, Math.min(userInterests.length, 5)));
  }

  private loadDailyCount(): void {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const stored = sessionStorage.getItem('recome_daily_insights');
      if (stored) {
        const parsed = JSON.parse(stored) as { date: string; count: number };
        if (parsed.date === today) {
          this.dailyInsightCount = parsed.count;
          this.dailyCountDate = today;
          return;
        }
      }
      this.dailyCountDate = today;
      this.dailyInsightCount = 0;
    } catch {
      // sessionStorage may not be available
    }
  }

  private saveDailyCount(): void {
    try {
      const today = new Date().toISOString().slice(0, 10);
      sessionStorage.setItem(
        'recome_daily_insights',
        JSON.stringify({ date: today, count: this.dailyInsightCount }),
      );
    } catch {
      // sessionStorage may not be available
    }
  }
}
