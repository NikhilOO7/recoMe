import { BaseAgent } from '../BaseAgent.js';
import type { AgentContext, AgentResult, AgentEventSource } from '../types.js';
import { getIntelligence } from '../../intelligence/IntelligenceService.js';

/**
 * CurriculumAgent (ADR-0012 F-404) — on-demand v1 stub.
 *
 * Surface: the user clicks "Build curriculum for this" from a learning
 * platform overlay (Udemy/Coursera/edX). The agent reads the user's existing
 * graph topics, finds the closest cluster, and emits a `fresh_content`-flavoured
 * event with a 4-week skeleton that bridges from known anchors to the target.
 *
 * v1 is deterministic — picks the 3 highest-weight related topics from the
 * user's graph and templates them into a "Week 1 / Week 2 / Week 3" plan.
 * The LLM-personalized version drops in once we have an EvalSet for the
 * curriculum quality bar (Phase 4+).
 *
 * Trust + safety: read-only, cites the user's prior topics, $0 LLM in v1.
 */

interface CurriculumEvent {
  target: string; // "I want to understand X"
  pageUrl?: string;
  platform?: string;
}

export class CurriculumAgent extends BaseAgent {
  readonly name = 'curriculum';
  readonly displayName = 'Curriculum';
  readonly triggers = ['on_demand'] as const;

  override async canRun(ctx: AgentContext): Promise<boolean> {
    if (ctx.trigger !== 'on_demand') return false;
    const ev = ctx.event as Partial<CurriculumEvent> | undefined;
    return !!ev?.target && ev.target.trim().length >= 3;
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    const event = ctx.event as unknown as CurriculumEvent;
    const target = event.target.trim();
    const targetLower = target.toLowerCase();

    const intents = await getIntelligence().graph.getTopIntents(ctx.userId, 30);
    // Adjacent topics by string overlap. Replace with cluster-detection (F-401
    // shared primitive) once Mind Map ships — see ADR-0012 follow-ups.
    const anchors = intents
      .filter((i) => {
        const t = i.topicName.toLowerCase();
        if (t === targetLower) return false;
        return (
          t.length > 3 &&
          (targetLower.includes(t) || t.includes(targetLower) || sharesWord(t, targetLower))
        );
      })
      .slice(0, 3);

    const sources: AgentEventSource[] = anchors.map((a) => ({
      kind: 'topic',
      id: a.topicName,
      label: a.topicName,
    }));

    const lines = [`4-week bridge to "${target}", anchored in what you already know:`, ''];
    if (anchors.length === 0) {
      lines.push(
        '  Week 1: foundations — broad intro reading from your usual sources.',
        '  Week 2: connect — a long-form essay linking foundations to the target.',
        '  Week 3: applied — a case study or paper.',
        '  Week 4: synthesize — write what you learned.',
      );
    } else {
      lines.push(`  Week 1: anchor — material in ${anchors[0]!.topicName}.`);
      if (anchors[1])
        lines.push(`  Week 2: bridge — connect ${anchors[1].topicName} to ${target}.`);
      else lines.push(`  Week 2: bridge — broader essay on ${target}.`);
      if (anchors[2]) lines.push(`  Week 3: applied — case study using ${anchors[2].topicName}.`);
      else lines.push(`  Week 3: applied — case study.`);
      lines.push('  Week 4: synthesize — Synthesist agent writes your weekly summary.');
    }

    return {
      status: 'succeeded',
      emit: {
        kind: 'fresh_content',
        title: `Curriculum: ${target}`,
        body: lines.join('\n'),
        sources,
        dedupeKey: `curriculum:${targetLower}:${weekBucket()}`,
        ...(event.pageUrl ? { actionUrl: event.pageUrl } : {}),
      },
      llmTokens: 0,
      costMicros: 0,
    };
  }
}

function sharesWord(a: string, b: string): boolean {
  const aw = a.split(/\s+/).filter((w) => w.length > 3);
  const bw = b.split(/\s+/).filter((w) => w.length > 3);
  return aw.some((w) => bw.includes(w));
}

function weekBucket(): string {
  const d = new Date();
  const year = d.getUTCFullYear();
  const onejan = Date.UTC(year, 0, 1);
  const week = Math.ceil(
    ((d.getTime() - onejan) / 86400000 + new Date(onejan).getUTCDay() + 1) / 7,
  );
  return `${year}w${week}`;
}
