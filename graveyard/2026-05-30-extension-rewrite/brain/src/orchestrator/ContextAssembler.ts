import { createLogger } from '@utils/Logger';
import type { BrainTask, TaskContext } from './types';
import type { AgentMemory } from './AgentMemory';

const log = createLogger('ContextAssembler');

/**
 * ContextAssembler — enriches a task's context with data from memory,
 * graph, and recent actions before handing it to agents.
 *
 * This is the single place where "what do we know about this user right now?"
 * gets answered.
 */
export class ContextAssembler {
  constructor(private readonly memory: AgentMemory) {}

  /**
   * Build an enriched context for a task.
   * Pulls recent actions, active goals, and any shared agent memory.
   */
  async build(task: BrainTask): Promise<TaskContext> {
    const start = performance.now();

    const context: TaskContext = { ...task.context };

    // Enrich with recent actions from agent memory
    if (!context.recentActions || context.recentActions.length === 0) {
      context.recentActions = this.memory.getRecentActions(20);
    }

    // Enrich with active goals
    if (!context.activeGoals || context.activeGoals.length === 0) {
      context.activeGoals = this.memory.getActiveGoals();
    }

    const elapsed = performance.now() - start;
    log.debug(`Context assembled in ${elapsed.toFixed(1)}ms`);

    return context;
  }
}
