import { createLogger } from '@utils/Logger';
import type { BrainTask, AgentName, TaskType } from './types';
import type { AgentRegistry } from './AgentRegistry';

const log = createLogger('TaskRouter');

/**
 * TaskRouter — determines which agent(s) should handle a given task.
 *
 * Routing rules:
 * - filter  → FilterAgent (+ GuardianAgent audit)
 * - discover → ScoutAgent
 * - advise/chat → AdvisorAgent
 * - shop → ShopperAgent (+ AdvisorAgent for reasoning)
 * - social → SocialAgent
 * - analyze → Multiple agents depending on content
 *
 * GuardianAgent is always included as an auditor.
 */

/** Static mapping from task type to primary agents */
const ROUTING_TABLE: Record<TaskType, AgentName[]> = {
  filter: ['filter', 'guardian'],
  discover: ['scout', 'guardian'],
  advise: ['advisor', 'guardian'],
  shop: ['shopper', 'advisor', 'guardian'],
  social: ['social', 'guardian'],
  chat: ['advisor', 'guardian'],
  analyze: ['advisor', 'scout', 'guardian'],
};

export class TaskRouter {
  constructor(private readonly registry: AgentRegistry) {}

  /**
   * Select agents for a task. Returns only agents that are actually registered.
   * Order matters: primary agent first, guardian last.
   */
  selectAgents(task: BrainTask): AgentName[] {
    const candidates = ROUTING_TABLE[task.type] ?? ['advisor', 'guardian'];

    // Filter to only registered agents
    const available = candidates.filter((name) => this.registry.has(name));

    if (available.length === 0) {
      log.warn(`No agents available for task type: ${task.type}`);
    }

    return available;
  }
}
