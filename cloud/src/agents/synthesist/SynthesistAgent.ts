import { BaseAgent } from '../BaseAgent.js';
import type { AgentContext, AgentResult, AgentEventSource } from '../types.js';
import { getIntelligence } from '../../intelligence/IntelligenceService.js';

// ── SynthesistAgent (PRODUCT.md P3 · referenced by popup + InsightCard UI) ──
// The weekly "where you are" emission: one Sunday event synthesizing the
// week's graph deltas — what's new, what's active, what's cooling off —
// feeding the email digest and a pinned inbox card.
//
// Trigger: scheduled (Sun 13:00 UTC, one hour before the digest tick so the
//          digest includes it) + on_demand for the UI's "run now".
// Output:  ONE AgentEvent of kind='weekly_summary', deduped per ISO week.
// Cost:    Zero LLM tokens — deterministic v1 per product law (deterministic
//          first, LLM as a dial). An LLM prose pass rides the same
//          AGENTS_LLM_ENABLED flag later without changing this contract.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const COOLING_MIN_MS = 14 * 24 * 60 * 60 * 1000; // untouched for 2+ weeks…
const COOLING_MAX_MS = 35 * 24 * 60 * 60 * 1000; // …but not ancient history
const MAX_TRAILS = 12;
const MAX_LINE_ITEMS = 3;
const MAX_SOURCES = 5;

interface TrailView {
  topicNormalizedName: string;
  topicDisplayName: string;
  firstSeenAt: number;
  lastSeenAt: number;
  platformsTouched: ReadonlyArray<string>;
  hops: ReadonlyArray<unknown>;
}

export class SynthesistAgent extends BaseAgent {
  readonly name = 'synthesist';
  readonly displayName = 'Synthesist';
  readonly triggers = ['scheduled', 'on_demand'] as const;

  override async canRun(ctx: AgentContext): Promise<boolean> {
    return ctx.trigger === 'scheduled' || ctx.trigger === 'on_demand';
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    const nowMs = ctx.now.getTime();
    const trails = (await getIntelligence().trails.listTrails(ctx.userId, {
      minPlatforms: 1,
      limit: MAX_TRAILS,
    })) as unknown as TrailView[];

    if (trails.length === 0) {
      return { status: 'skipped', reason: 'no_trails_for_user' };
    }

    const fresh = trails.filter((t) => nowMs - t.firstSeenAt <= WEEK_MS);
    const active = trails.filter(
      (t) => nowMs - t.lastSeenAt <= WEEK_MS && nowMs - t.firstSeenAt > WEEK_MS,
    );
    const cooling = trails.filter((t) => {
      const idle = nowMs - t.lastSeenAt;
      return idle >= COOLING_MIN_MS && idle <= COOLING_MAX_MS;
    });

    if (fresh.length === 0 && active.length === 0 && cooling.length === 0) {
      return { status: 'skipped', reason: 'no_weekly_delta' };
    }

    const lines: string[] = [];
    if (fresh.length > 0) {
      lines.push(`New this week: ${nameList(fresh)}.`);
    }
    if (active.length > 0) {
      lines.push(`Still open: ${nameList(active)}.`);
    }
    if (cooling.length > 0) {
      lines.push(
        `Cooling off: ${nameList(cooling)} — untouched for ${idleWeeks(cooling[0]!, nowMs)}+ weeks.`,
      );
    }
    lines.push('', 'Open your dashboard for every trail and its citations.');

    // Cite the topics the summary drew from, freshest bucket first.
    const cited = [...fresh, ...active, ...cooling].slice(0, MAX_SOURCES);
    const sources: AgentEventSource[] = cited.map((t) => ({
      kind: 'topic',
      id: t.topicNormalizedName,
      label: t.topicDisplayName,
    }));

    return {
      status: 'succeeded',
      emit: {
        kind: 'weekly_summary',
        title: `Your week in attention: ${fresh.length + active.length} open thread${
          fresh.length + active.length === 1 ? '' : 's'
        }`,
        body: lines.join('\n'),
        sources,
        dedupeKey: `synthesist:${isoWeekKey(ctx.now)}`,
      },
      llmTokens: 0,
      costMicros: 0,
    };
  }
}

function nameList(trails: TrailView[]): string {
  const names = trails.slice(0, MAX_LINE_ITEMS).map((t) => t.topicDisplayName);
  const extra = trails.length - names.length;
  return extra > 0 ? `${names.join(', ')} and ${extra} more` : names.join(', ');
}

function idleWeeks(trail: TrailView, nowMs: number): number {
  return Math.max(2, Math.floor((nowMs - trail.lastSeenAt) / WEEK_MS));
}

/** ISO-8601 week key, e.g. "2026-W32" — one summary per calendar week. */
export function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7; // Mon=1 … Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum); // nearest Thursday
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
