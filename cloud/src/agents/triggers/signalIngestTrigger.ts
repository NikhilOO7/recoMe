import { getAgentRegistry, maybeAgentRegistry } from '../AgentRegistry.js';
import { getAgentRunner } from '../AgentRunner.js';
import type { AgentContext } from '../types.js';
import type { Platform } from '../../graph/types.js';
import { logger } from '../../observability/logger.js';

/**
 * Called by SignalIngestion AFTER a signal has been recorded successfully.
 *
 * Fires every event-triggered agent (currently just Recall) for the user
 * with the ingested signal as context. Runs are best-effort — errors are
 * logged but never propagated. The ingest response has already been sent
 * to the client by the time we get here in fire-and-forget mode.
 *
 * Wired in cloud/src/intelligence/SignalIngestion.ts. The dependency
 * direction is one-way: agents/ depends on intelligence/, never vice
 * versa. The trigger only fires if AgentRegistry has been booted, so
 * tests that don't boot agents see no side effects.
 */
export interface SignalTriggerPayload {
  userId: string;
  signalId: string;
  topicNormalizedName: string;
  topicName: string;
  ts: number;
  /** Origin platform — Concierge gates on commerce platforms; Recall is platform-agnostic. */
  platform?: Platform;
  /** Entity names extracted from the signal — primary input to Concierge tools. */
  entityNames?: string[];
  /** Optional original page URL — used by some agents for emission `actionUrl`. */
  pageUrl?: string;
}

export async function fireSignalIngestTrigger(payload: SignalTriggerPayload): Promise<void> {
  const registry = maybeAgentRegistry();
  if (!registry) return; // tests / dev with INTELLIGENCE_AGENTS_ENABLED=false

  const runner = getAgentRunner();
  const eventAgents = registry.byTrigger('event');
  if (eventAgents.length === 0) return;

  const ctx: AgentContext = {
    userId: payload.userId,
    trigger: 'event',
    now: new Date(),
    event: {
      signalId: payload.signalId,
      topicNormalizedName: payload.topicNormalizedName,
      topicName: payload.topicName,
      ts: payload.ts,
      platform: payload.platform,
      entityNames: payload.entityNames,
      pageUrl: payload.pageUrl,
    },
  };

  // Run agents in parallel — one slow agent should not block siblings.
  // Errors swallowed by runner.runOne so we use allSettled defensively.
  await Promise.allSettled(
    eventAgents.map(async (agent) => {
      try {
        await runner.runOne(agent, ctx);
      } catch (err) {
        logger.error({ err, agent: agent.name, userId: payload.userId }, 'event trigger failed');
      }
    }),
  );
}

/**
 * Convenience for the synchronous fire-and-forget call from SignalIngestion.
 * Logs unhandled rejection rather than crashing the caller.
 */
export function fireSignalIngestTriggerSync(payload: SignalTriggerPayload): void {
  void fireSignalIngestTrigger(payload).catch((err: unknown) => {
    logger.error({ err, userId: payload.userId }, 'fireSignalIngestTrigger unhandled');
  });
}

// Re-export the registry getter for callers that want to check enablement.
export { getAgentRegistry };
