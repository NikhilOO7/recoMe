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
    const event = (ctx.event ?? {}) as DecisionEvent;
    const hint = (event.topicHint ?? event.entityHint ?? '').toLowerCase();

    const intents = await getIntelligence().graph.getTopIntents(ctx.userId, 8);
    if (intents.length === 0) {
      return {
        status: 'skipped',
        reason: 'no_intents_for_user',
      };
    }

    // If the user gave a hint, prefer trails that contain it.
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
      status: 'succeeded',
      emit: {
        kind: 'decision_nudge',
        title,
        body,
        sources,
        dedupeKey: `decision:${hint || event.pageUrl || ctx.now.toISOString().slice(0, 10)}`,
        ...(event.pageUrl ? { actionUrl: event.pageUrl } : {}),
      },
      llmTokens: 0,
      costMicros: 0,
    };
  }
}
