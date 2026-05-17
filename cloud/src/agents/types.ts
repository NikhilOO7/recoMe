// ── Active Agents — shared types (ADR-0012) ─────────────────────────────────
// One place for the runtime contract so agents + scheduler + controller
// cannot drift. Keep dependency-free (no Prisma imports) so this file is
// safe to import from tests and triggers without dragging the world.

export type AgentTrigger = 'scheduled' | 'event' | 'on_demand';

export type AgentRunStatus =
  | 'started'
  | 'succeeded'
  | 'skipped' // agent decided no emission this pass (normal)
  | 'capped' // guardian blocked it (over budget / throttle / quiet hours)
  | 'failed'; // unhandled error — investigated via meta.error

export type AgentEventKind =
  | 'recall'
  | 'deal_drop'
  | 'new_alternative'
  | 'fresh_content'
  | 'decision_nudge'
  | 'weekly_summary';

/**
 * A reference back to the user-owned graph items that justify an event.
 * Mandatory per ADR-0012 §5: every agent output cites its sources.
 *
 * `kind` is intentionally narrow — we want a closed set of citation
 * targets so the UI knows how to render them.
 */
export interface AgentEventSource {
  kind: 'signal' | 'topic' | 'page' | 'entity';
  /** The graph identifier (signalId / normalizedName / canonical URL / entity id). */
  id: string;
  /** Optional human-readable label for the UI. */
  label?: string;
  /** Optional original URL when the source is a page or has one. */
  url?: string;
}

/** Payload an agent returns to the runtime when it decides to emit. */
export interface AgentEmission {
  kind: AgentEventKind;
  title: string;
  body?: string;
  actionUrl?: string;
  sources: AgentEventSource[];
  /**
   * Deterministic key so the same surfaced thing isn't repeated within
   * the 24h dedupe window. Suggested shape: `<agent>:<topic-or-entity>:<bucket>`.
   */
  dedupeKey: string;
}

/** Context handed to an agent on every invocation. */
export interface AgentContext {
  userId: string;
  trigger: AgentTrigger;
  /** Only set when trigger === 'event'. Free-form payload from the trigger. */
  event?: Record<string, unknown>;
  /** Wall-clock at run start; pass through, do not call Date.now() inside agents — testability. */
  now: Date;
}

/** What an agent returns from one run. */
export type AgentResult =
  | { status: 'succeeded'; emit: AgentEmission; llmTokens?: number; costMicros?: number }
  | { status: 'skipped'; reason: string; llmTokens?: number; costMicros?: number }
  | { status: 'failed'; error: string };

/** Guardian decision before a run begins. */
export type GuardianDecision = { allow: true } | { allow: false; status: 'capped'; reason: string };
