import type { AgentContext, AgentResult, AgentTrigger } from './types.js';

/**
 * BaseAgent — the contract every active agent implements.
 *
 * Three trigger modes (ADR-0012 §2.2):
 *   - 'scheduled' : runs on a cron (Curator daily, Concierge 4×/day, etc).
 *   - 'event'     : runs in response to a domain event (Recall on signal ingest).
 *   - 'on_demand' : runs when the user asks (Decision agent).
 *
 * The runtime calls `canRun(ctx)` first — agents return false to be
 * skipped silently. Then GuardianAgent runs its own check. Then `run()`.
 * Agents must NOT swallow errors; throwing surfaces them to the runner
 * which records a 'failed' AgentRun for the audit log.
 */
export abstract class BaseAgent {
  /** Stable identifier — matches AgentSubscription.agent and AgentRun.agent. */
  abstract readonly name: string;

  /** Display name for the dashboard. */
  abstract readonly displayName: string;

  /** Which trigger modes this agent supports. */
  abstract readonly triggers: ReadonlyArray<AgentTrigger>;

  /**
   * Cheap pre-check. Return false to skip without recording a run.
   * Use for "this agent doesn't apply to this event" filters; do NOT
   * use for guardrails (those belong in GuardianAgent).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async canRun(_ctx: AgentContext): Promise<boolean> {
    return true;
  }

  /** Do the work. Must not throw silently — let it bubble. */
  abstract run(ctx: AgentContext): Promise<AgentResult>;
}
