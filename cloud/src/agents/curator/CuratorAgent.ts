import { BaseAgent } from '../BaseAgent.js';
import type { AgentContext, AgentResult, AgentEventSource } from '../types.js';
import { getIntelligence } from '../../intelligence/IntelligenceService.js';
import { findFreshForTopic } from './tools.js';
import type { FreshItem } from './ContentSource.js';
import { logger } from '../../observability/logger.js';

/**
 * CuratorAgent (ADR-0012 F-311) — scheduled, 1×/day.
 *
 * "Martin Kleppmann just published — you've not touched distributed systems
 * in 3 weeks." That's the canonical surface. The agent reads the user's
 * cross-platform topics, asks the ContentSource for items fresher than the
 * user's last touch on each topic, and emits a single `fresh_content` event
 * with the top 1–3 picks across topics.
 *
 * Trigger: 'scheduled'. The Phase-1 BullMQ scheduler is not built yet, so
 * Curator is invoked via the manual `POST /intelligence/agents/curator/run`
 * endpoint (also reachable by an external cron e.g. Fly scheduled command)
 * until that infrastructure lands. Same agent class works in both worlds.
 *
 * Cost: zero LLM tokens in v1. Item selection is deterministic, ranking is
 * `dormant_bonus * recency`. An LLM "polish the digest copy" pass is the
 * obvious upgrade and stays inside ADR-0012 §4's ~$0.06/user/mo Curator budget.
 *
 * Trust + safety (ADR-0012 §5):
 *   - Read-only. No posting, no following, no engagement on user's behalf.
 *   - Every emission cites the user's topic + the source URL of each item.
 *   - Guardian enforces quiet hours + daily cost cap.
 */

const MAX_TOPICS_SCANNED = 12;
const MAX_ITEMS_IN_EVENT = 3;
/** Topics not touched in 7 days get a dormant-bonus when scoring fresh items. */
const DORMANT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface ScoredItem {
  item: FreshItem;
  topicNormalizedName: string;
  topicDisplayName: string;
  /** ms since user last touched this topic — higher = more dormant. */
  dormancyMs: number;
  score: number;
}

export class CuratorAgent extends BaseAgent {
  readonly name = 'curator';
  readonly displayName = 'Curator';
  readonly triggers = ['scheduled'] as const;

  override async canRun(ctx: AgentContext): Promise<boolean> {
    return ctx.trigger === 'scheduled';
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    const { userId, now } = ctx;

    // ── Pull the user's top topics (already cross-platform-ranked) ───────
    let trails;
    try {
      trails = await getIntelligence().trails.listTrails(userId, {
        minPlatforms: 1, // Curator works on any topic, not just cross-platform trails
        limit: MAX_TOPICS_SCANNED,
      });
    } catch (err) {
      logger.warn({ err, userId }, 'curator: listTrails failed');
      return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
    if (trails.length === 0) {
      return { status: 'skipped', reason: 'user has no trails yet' };
    }

    // ── For each topic, ask the source for items since lastSeenAt ────────
    const scored: ScoredItem[] = [];
    for (const trail of trails) {
      const sinceMs = trail.lastSeenAt;
      const fresh = await findFreshForTopic(trail.topicNormalizedName, sinceMs, {
        limit: 3,
        nowMs: ctx.now.getTime(),
      });
      for (const item of fresh) {
        const dormancyMs = Math.max(0, now.getTime() - trail.lastSeenAt);
        // Dormant-bonus: 0 if fresh-touched, 1.5× at 7d+, plateaus past 30d.
        const dormantBonus =
          dormancyMs < DORMANT_AGE_MS
            ? 1
            : 1 + Math.min(0.5, (dormancyMs - DORMANT_AGE_MS) / (23 * 24 * 60 * 60 * 1000));
        // Recency factor: 1 at <1d, decays linearly to 0.2 at 30d.
        const ageDays = (now.getTime() - item.publishedAt) / (24 * 60 * 60 * 1000);
        const recencyFactor = Math.max(0.2, 1 - ageDays / 30);
        const score = dormantBonus * recencyFactor;
        scored.push({
          item,
          topicNormalizedName: trail.topicNormalizedName,
          topicDisplayName: trail.topicDisplayName,
          dormancyMs,
          score,
        });
      }
    }

    if (scored.length === 0) {
      return { status: 'skipped', reason: 'no fresh items across active topics' };
    }

    scored.sort((a, b) => b.score - a.score);
    const picks = pickByTopic(scored, MAX_ITEMS_IN_EVENT);

    // ── Build the emission ───────────────────────────────────────────────
    const headline = pickHeadline(picks);
    const bodyLines = picks.map((p) => {
      const dormancyLabel = dormancyToLabel(p.dormancyMs);
      const author = p.item.author ? ` (${p.item.author})` : '';
      return `• ${p.item.title}${author} — ${p.topicDisplayName}${dormancyLabel}`;
    });

    const sources: AgentEventSource[] = [];
    for (const p of picks) {
      sources.push({
        kind: 'page',
        id: p.item.url,
        label: `${p.item.source} · ${p.item.publisher}`,
        url: p.item.url,
      });
      sources.push({
        kind: 'topic',
        id: p.topicNormalizedName,
        label: p.topicDisplayName,
      });
    }

    // Day-bucket dedupe — Curator emits at most once per user per day.
    const dayBucket = Math.floor(ctx.now.getTime() / (24 * 60 * 60 * 1000));

    return {
      status: 'succeeded',
      emit: {
        kind: 'fresh_content',
        title: headline,
        body: bodyLines.join('\n'),
        // No single actionUrl — multiple links. UI surfaces them via sources.
        sources,
        dedupeKey: `curator:${dayBucket}`,
      },
      llmTokens: 0,
      costMicros: 0,
    };
  }
}

/** Pick at most `limit` items, capping one per topic to keep the digest broad. */
export function pickByTopic(scored: ScoredItem[], limit: number): ScoredItem[] {
  const seen = new Set<string>();
  const picks: ScoredItem[] = [];
  for (const s of scored) {
    if (seen.has(s.topicNormalizedName)) continue;
    picks.push(s);
    seen.add(s.topicNormalizedName);
    if (picks.length >= limit) break;
  }
  return picks;
}

export function pickHeadline(picks: ScoredItem[]): string {
  if (picks.length === 0) return 'Curator surfaced new material';
  const top = picks[0]!;
  const dormancy = dormancyToLabel(top.dormancyMs).trim();
  if (dormancy) {
    return `${top.topicDisplayName}${dormancy} — Curator found ${picks.length} new ${picks.length === 1 ? 'piece' : 'pieces'}.`;
  }
  return `Curator surfaced ${picks.length} fresh ${picks.length === 1 ? 'item' : 'items'} on ${top.topicDisplayName}.`;
}

export function dormancyToLabel(ms: number): string {
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 7) return '';
  if (days < 14) return ` (dormant ${days}d)`;
  if (days < 30) return ` (dormant ${Math.floor(days / 7)}w)`;
  return ` (dormant ${Math.floor(days / 30)}mo+)`;
}
