import { BaseAgent } from '../BaseAgent.js';
import type { AgentContext, AgentResult, AgentEventSource } from '../types.js';
import { getIntelligence } from '../../intelligence/IntelligenceService.js';

/**
 * DecisionAgent (ADR-0012 F-406) — on-demand v1 stub.
 *
 * Phase-3 implementation: the user clicks "Help me decide" / "Ask Decision"
 * from the extension overlay. The agent pulls the user's most-recent intent
 * trail for the topic on the current page and emits a citation-grounded
 * `decision_nudge` event. The LLM-polished version is Phase-4 work (streaming
 * chat), but the deterministic version is honest enough to surface in Phase 3.
 *
 * Trust + safety (ADR-0012 §5):
 *   - Recommend only. Never auto-acts.
 *   - Cites the strongest trail sources from the user's graph.
 *   - Stays within Decision's ~$0.10 on-demand budget (0 LLM tokens for v1).
 */

interface DecisionEvent {
  pageUrl?: string;
  pageTitle?: string;
  platform?: string;
  topicHint?: string;
  entityHint?: string;
}

export class DecisionAgent extends BaseAgent {
  readonly name = 'decision';
  readonly displayName = 'Decision';
  readonly triggers = ['on_demand'] as const;

  override async canRun(ctx: AgentContext): Promise<boolean> {
    return ctx.trigger === 'on_demand';
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    const composed = await this.compose(ctx);
    if (composed.kind === 'skip') return { status: 'skipped', reason: composed.reason };

    return {
      status: 'succeeded',
      emit: {
        kind: 'decision_nudge',
        title: composed.title,
        body: composed.body,
        sources: composed.sources,
        dedupeKey: composed.dedupeKey,
        ...(composed.actionUrl ? { actionUrl: composed.actionUrl } : {}),
      },
      llmTokens: 0,
      costMicros: 0,
    };
  }

  /**
   * Streaming variant used by `POST /intelligence/agents/decision/stream`.
   * Yields the body in word-ish chunks so the extension OverlayChat + web
   * /ask AdvisorPanel can render token-by-token. The final yield is a
   * `__meta__:` JSON envelope with the sources + actionUrl so the client
   * can render citations once the stream completes.
   *
   * v1 is deterministic — chunks come from `compose()` (same path as
   * `run()`) split on whitespace. When a real LLM-polished version
   * lands, swap the inner loop for an OpenAI/Anthropic stream — the
   * client protocol stays identical.
   */
  async *runStream(ctx: AgentContext): AsyncIterable<string> {
    const composed = await this.compose(ctx);
    if (composed.kind === 'skip') {
      yield `__meta__:${JSON.stringify({ skipped: true, reason: composed.reason })}`;
      return;
    }

    // Title first, then body chunked. Newlines preserved so multi-line bullet
    // lists render correctly on the client.
    yield composed.title + '\n\n';
    for (const chunk of chunkByWords(composed.body, 4)) {
      yield chunk;
      // Small artificial delay so the stream visibly streams in local dev.
      // Real LLM stream pacing will replace this in the LLM-polish swap.
      await new Promise((r) => setTimeout(r, 18));
    }

    yield `\n\n__meta__:${JSON.stringify({
      sources: composed.sources,
      actionUrl: composed.actionUrl ?? null,
      dedupeKey: composed.dedupeKey,
    })}`;
  }

  /**
   * Shared logic between batch `run()` and streaming `runStream()`. Pulls
   * top intents, filters by hint, builds title + body + sources. Returns
   * a discriminated union so callers handle the skip case explicitly.
   */
  private async compose(ctx: AgentContext): Promise<
    | { kind: 'skip'; reason: string }
    | {
        kind: 'ok';
        title: string;
        body: string;
        sources: AgentEventSource[];
        dedupeKey: string;
        actionUrl?: string;
      }
  > {
    const event = (ctx.event ?? {}) as DecisionEvent;
    const hint = (event.topicHint ?? event.entityHint ?? '').toLowerCase();

    const intents = await getIntelligence().graph.getTopIntents(ctx.userId, 8);
    if (intents.length === 0) {
      return { kind: 'skip', reason: 'no_intents_for_user' };
    }

    const relevant = hint
      ? intents.filter((i) => {
          const t = i.topicName.toLowerCase();
          return t.includes(hint) || hint.includes(t);
        })
      : intents;
    const picks = (relevant.length > 0 ? relevant : intents).slice(0, 3);

    const lines = picks.map((i) => `• ${i.topicName} (weight ${i.strength.toFixed(2)})`);
    const sources: AgentEventSource[] = picks.map((i) => ({
      kind: 'topic',
      id: i.topicName,
      label: i.topicName,
    }));

    const title = event.pageTitle
      ? `Decision support: ${event.pageTitle.slice(0, 80)}`
      : 'Decision support';

    const body = [
      'Based on your strongest signals across platforms:',
      ...lines,
      '',
      'Open the trail page in your dashboard for the full citation set.',
    ].join('\n');

    return {
      kind: 'ok',
      title,
      body,
      sources,
      dedupeKey: `decision:${hint || event.pageUrl || ctx.now.toISOString().slice(0, 10)}`,
      ...(event.pageUrl ? { actionUrl: event.pageUrl } : {}),
    };
  }
}

/** Split a string into N-word chunks preserving original whitespace. */
function chunkByWords(s: string, wordsPerChunk: number): string[] {
  const out: string[] = [];
  const tokens = s.split(/(\s+)/); // keep separators so reassembled string == s
  let buf = '';
  let wordCount = 0;
  for (const t of tokens) {
    buf += t;
    if (/\S/.test(t)) {
      wordCount++;
      if (wordCount >= wordsPerChunk) {
        out.push(buf);
        buf = '';
        wordCount = 0;
      }
    }
  }
  if (buf) out.push(buf);
  return out;
}
