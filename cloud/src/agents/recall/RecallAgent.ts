import neo4j from 'neo4j-driver';
import { BaseAgent } from '../BaseAgent.js';
import type { AgentContext, AgentResult, AgentEventSource } from '../types.js';
import { getIntelligence } from '../../intelligence/IntelligenceService.js';
import { logger } from '../../observability/logger.js';

// ── RecallAgent (ADR-0012 F-313) ────────────────────────────────────────────
// "You're about to buy a desk; you bookmarked a Verge review 3 weeks ago you
//  never read." — the most uniquely-Recome agent. Reads the user's own graph,
// finds forgotten-but-relevant signals, and surfaces them at exactly the
// right moment.
//
// Trigger: event-driven. Fires when a NEW signal lands on a topic that has
//          older (≥14d) signals the user hasn't re-engaged with.
// Output:  ONE AgentEvent of kind='recall' citing the forgotten signal +
//          the new trigger signal. Throttled to ≤2/wk by GuardianAgent.
//
// Cost:    Zero LLM tokens in v1. All ranking is deterministic Cypher +
//          recency math. An LLM "compose nice copy" pass is a follow-on
//          (we currently surface the raw signal title + URL).
//
// Why deterministic v1: ADR-0012 §4 budgets Recall at ~$0.05/user/mo. The
// only way to hit that is to call the LLM only when we're sure we have
// something to surface — which means ranking happens without it. We can
// add a copy-polishing call later and stay under budget.

interface RecallTriggerEvent {
  /** The new signal that just landed. */
  signalId: string;
  topicNormalizedName: string;
  topicName: string;
  ts: number;
}

const FORGOTTEN_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MIN_RECALL_SCORE = 0.4;

export class RecallAgent extends BaseAgent {
  readonly name = 'recall';
  readonly displayName = 'Recall';
  readonly triggers = ['event'] as const;

  override async canRun(ctx: AgentContext): Promise<boolean> {
    if (ctx.trigger !== 'event') return false;
    const event = ctx.event as Partial<RecallTriggerEvent> | undefined;
    return !!(event?.signalId && event?.topicNormalizedName);
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    const event = ctx.event as unknown as RecallTriggerEvent;
    const { userId, now } = ctx;
    const triggerSignalId = event.signalId;
    const topicNormalized = event.topicNormalizedName;

    // ── Query forgotten signals on this topic ──────────────────────────
    // "Forgotten" = ≥14 days old AND no newer signal we'd already remind
    // about (i.e. this trigger signal is the first re-engagement in the
    // window). We exclude the trigger itself.
    //
    // The query is intentionally simple: order by ts DESC among signals
    // older than the cutoff, take top 5, pick the one with the largest
    // weight × log(age) product. We use cypher directly rather than
    // extending GraphRepository because this query is Recall-specific
    // and likely to evolve as we learn what surfaces well.
    const cutoffMs = now.getTime() - FORGOTTEN_AGE_MS;
    const candidates = await this.queryForgotten(
      userId,
      topicNormalized,
      cutoffMs,
      triggerSignalId,
    );

    if (candidates.length === 0) {
      return { status: 'skipped', reason: 'no forgotten signals for topic' };
    }

    const best = this.pickBest(candidates, now);
    if (best.score < MIN_RECALL_SCORE) {
      return { status: 'skipped', reason: `best score ${best.score.toFixed(2)} < threshold` };
    }

    // ── Build the emission ────────────────────────────────────────────
    const ageDays = Math.floor((now.getTime() - best.signal.ts) / (24 * 60 * 60 * 1000));
    const sources: AgentEventSource[] = [
      {
        kind: 'signal',
        id: best.signal.id,
        label: best.signal.pageTitle ?? best.signal.pageUrl ?? 'forgotten capture',
        url: best.signal.pageUrl ?? undefined,
      },
      {
        kind: 'signal',
        id: triggerSignalId,
        label: 'the capture that triggered this recall',
      },
      { kind: 'topic', id: topicNormalized, label: event.topicName },
    ];

    return {
      status: 'succeeded',
      emit: {
        kind: 'recall',
        title: `You looked at this ${ageDays} days ago — still relevant`,
        body:
          best.signal.pageTitle ??
          best.signal.pageUrl ??
          `A ${best.signal.kind} on ${event.topicName} from ${ageDays} days ago.`,
        actionUrl: best.signal.pageUrl ?? `/dashboard?topic=${encodeURIComponent(event.topicName)}`,
        sources,
        // One recall per (user, topic, week-bucket) — same topic re-engagement
        // within 7 days won't repeat. Tunable as we observe behaviour.
        dedupeKey: `recall:${topicNormalized}:${Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000))}`,
      },
      llmTokens: 0,
      costMicros: 0,
    };
  }

  /**
   * Pull candidates from Neo4j: signals on the topic, older than cutoff,
   * for this user, excluding the trigger signal.
   *
   * Kept on the agent (not GraphRepository) because the query shape is
   * Recall-specific and we want freedom to iterate without touching the
   * shared repo. If a second agent needs this, promote to repo.
   */
  private async queryForgotten(
    userId: string,
    topicNormalized: string,
    cutoffMs: number,
    excludeSignalId: string,
  ): Promise<ForgottenSignal[]> {
    const client = getIntelligence().neo4j;
    try {
      const result = await client.run(
        `
        MATCH (sg:Signal { userId: $userId })
        WHERE sg.id <> $excludeSignalId
          AND sg.ts < $cutoffMs
        MATCH (sg)-[:MENTIONS]->(t:Topic { normalizedName: $topicNormalized })
        OPTIONAL MATCH (sg)-[:ON_PAGE]->(p:Page)
        RETURN sg.id AS id,
               sg.kind AS kind,
               sg.ts AS ts,
               sg.weight AS weight,
               p.url AS pageUrl,
               p.title AS pageTitle,
               p.platform AS platform
        ORDER BY sg.ts DESC
        LIMIT 5
        `,
        { userId, topicNormalized, cutoffMs: neo4j.int(cutoffMs), excludeSignalId },
        'recall.queryForgotten',
      );
      return result.records.map((r): ForgottenSignal => {
        const tsRaw = r.get('ts') as unknown;
        const wRaw = r.get('weight') as unknown;
        return {
          id: r.get('id') as string,
          kind: r.get('kind') as string,
          ts: typeof tsRaw === 'number' ? tsRaw : Number(tsRaw),
          weight: typeof wRaw === 'number' ? wRaw : Number(wRaw ?? 1),
          pageUrl: (r.get('pageUrl') as string | null) ?? null,
          pageTitle: (r.get('pageTitle') as string | null) ?? null,
          platform: (r.get('platform') as string | null) ?? null,
        };
      });
    } catch (err) {
      logger.warn({ err, userId, topicNormalized }, 'recall: queryForgotten failed');
      return [];
    }
  }

  /**
   * Score = weight × age-factor.
   * age-factor is a saturating curve so very old signals don't dominate
   * just by being old — sweet spot is 14–60 days.
   */
  pickBest(candidates: ForgottenSignal[], now: Date): { signal: ForgottenSignal; score: number } {
    let best = candidates[0]!;
    let bestScore = -1;
    for (const sg of candidates) {
      const ageDays = (now.getTime() - sg.ts) / (24 * 60 * 60 * 1000);
      // Triangle-ish: 0 at age=0, peaks around age=21d, decays past 60d.
      const ageFactor =
        ageDays <= 0 ? 0 : ageDays < 21 ? ageDays / 21 : Math.max(0, 1 - (ageDays - 21) / 60);
      const score = (sg.weight || 1) * ageFactor;
      if (score > bestScore) {
        bestScore = score;
        best = sg;
      }
    }
    return { signal: best, score: bestScore };
  }
}

interface ForgottenSignal {
  id: string;
  kind: string;
  ts: number;
  weight: number;
  pageUrl: string | null;
  pageTitle: string | null;
  platform: string | null;
}
