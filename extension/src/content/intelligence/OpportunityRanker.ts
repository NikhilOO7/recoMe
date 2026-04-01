import type {
  ProactiveInsight,
  RawOpportunity,
  RankingWeights,
  InsightFrequencyConfig,
  InsightFactor,
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
      .map((opp) => {
        const breakdown = this.scoreWithFactors(opp, userInterests);
        return { opp, score: breakdown.total, factors: breakdown.factors };
      })
      .filter((s) => s.score >= this.config.minRelevanceScore)
      .sort((a, b) => b.score - a.score);

    const results: ProactiveInsight[] = [];
    for (const { opp, score, factors } of scored) {
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
        factors,
      });

      this.shownInsights.add(opp.title);
    }

    this.visitInsightCount += results.length;
    this.dailyInsightCount += results.length;
    this.saveDailyCount();

    return results;
  }

  private scoreWithFactors(
    opp: RawOpportunity,
    userInterests: string[],
  ): { total: number; factors: InsightFactor[] } {
    const interestMatch = this.computeInterestMatch(opp, userInterests);
    const benefitClarity = opp.benefit.length > 10 ? 0.8 : 0.3;
    const timeliness = opp.timeliness;
    const novelty = this.shownInsights.has(opp.title) ? 0 : 0.8;

    const factors: InsightFactor[] = [
      {
        name: 'Relevance',
        rawScore: interestMatch,
        weight: this.weights.interestMatch,
        weightedScore: this.weights.interestMatch * interestMatch,
        explanation:
          interestMatch >= 0.6
            ? 'Closely matches your known interests'
            : interestMatch >= 0.3
              ? 'Partially related to your interests'
              : 'Not strongly connected to your interests',
      },
      {
        name: 'Evidence quality',
        rawScore: benefitClarity,
        weight: this.weights.benefitClarity,
        weightedScore: this.weights.benefitClarity * benefitClarity,
        explanation:
          benefitClarity >= 0.6
            ? 'Clear benefit explained'
            : 'Limited benefit information available',
      },
      {
        name: 'Urgency',
        rawScore: timeliness,
        weight: this.weights.timeliness,
        weightedScore: this.weights.timeliness * timeliness,
        explanation:
          timeliness >= 0.7
            ? 'Time-sensitive opportunity'
            : timeliness >= 0.4
              ? 'Moderately time-relevant'
              : 'No urgency detected',
      },
      {
        name: 'Novelty',
        rawScore: novelty,
        weight: this.weights.novelty,
        weightedScore: this.weights.novelty * novelty,
        explanation:
          novelty > 0
            ? 'New to you — not previously shown'
            : 'You have seen similar content before',
      },
    ];

    const total = factors.reduce((sum, f) => sum + f.weightedScore, 0);
    return { total, factors };
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
