/**
 * Workflow — a per-platform action that fires a server-side agent run.
 *
 * Two flavors:
 *   - auto:  fires when the page settles + matches the workflow's selector.
 *            Caller is the orchestrator (content/index.ts) on bootstrap and
 *            on SPA navigation. Debounced + dedup-by-url so the same page
 *            doesn't fire the same agent twice in a session.
 *   - manual: surfaced as a button on the sidebar. Caller wires the click.
 *
 * Workflows DO NOT render results — the AgentEventRouter + InsightCard
 * already handle that via the inbox push. A workflow's only job is to ask
 * cloud nicely.
 */

import type { Platform } from '@shared/types';

export interface WorkflowAutoContext {
  pageUrl: string;
  pageTitle: string;
  /** Page-kind reported by the platform capture (e.g. 'pdp', 'watch', 'post'). */
  pageKind?: string;
}

export abstract class Workflow {
  abstract readonly name: string;
  abstract readonly platforms: ReadonlyArray<Platform>;

  /**
   * Returns true if this workflow should fire automatically on the current
   * page. Called after platform capture has extracted entities.
   */
  canFireAuto(_ctx: WorkflowAutoContext): boolean {
    return false;
  }

  /** Run the auto-fire workflow. Returns silently — result rides the inbox. */
  async fireAuto(_ctx: WorkflowAutoContext): Promise<void> {
    return;
  }

  /** Label for the sidebar manual-invoke button. Return null to hide. */
  manualLabel(): string | null {
    return null;
  }

  /** Run the manual workflow. May prompt for input. */
  async fireManual(): Promise<void> {
    return;
  }
}
