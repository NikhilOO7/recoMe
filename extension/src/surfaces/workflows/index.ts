/**
 * WorkflowOrchestrator — picks which workflows apply to the current platform
 * and fires the auto ones after page settle. Exposes the manual ones to the
 * sidebar for "Ask Decision" / "Find fresh content" / "Build curriculum"
 * buttons.
 */

import type { Platform } from '@shared/types';
import type { Workflow } from './Workflow';
import { type WorkflowAutoContext } from './Workflow';
import { ConciergeFlow } from './ConciergeFlow';
import { RecallFlow } from './RecallFlow';
import { CuratorFlow } from './CuratorFlow';
import { CurriculumFlow } from './CurriculumFlow';
import { AskFlow } from './AskFlow';

const ALL_FLOWS: Workflow[] = [
  new ConciergeFlow(),
  new RecallFlow(),
  new CuratorFlow(),
  new CurriculumFlow(),
  new AskFlow(),
];

export class WorkflowOrchestrator {
  flowsFor(platform: Platform): Workflow[] {
    return ALL_FLOWS.filter((w) => w.platforms.includes(platform));
  }

  /** Fire all auto-eligible workflows. Safe to call repeatedly per page nav. */
  async fireAuto(platform: Platform, ctx: WorkflowAutoContext): Promise<void> {
    const flows = this.flowsFor(platform);
    await Promise.allSettled(flows.filter((w) => w.canFireAuto(ctx)).map((w) => w.fireAuto(ctx)));
  }

  /** Manual flows for the sidebar action menu. */
  manualFlows(platform: Platform): Workflow[] {
    return this.flowsFor(platform).filter((w) => w.manualLabel() !== null);
  }
}

export { Workflow } from './Workflow';
