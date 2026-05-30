import { createLogger } from '@utils/Logger';
import type { AgentName } from './types';
import type { BaseAgent } from '../agents/BaseAgent';

const log = createLogger('AgentRegistry');

/**
 * AgentRegistry — manages all available agents.
 * Agents register themselves at boot; the Brain queries the registry to find agents for tasks.
 */
export class AgentRegistry {
  private readonly agents = new Map<AgentName, BaseAgent>();

  register(agent: BaseAgent): void {
    this.agents.set(agent.name, agent);
    log.debug(`Agent registered: ${agent.name}`);
  }

  get(name: AgentName): BaseAgent | undefined {
    return this.agents.get(name);
  }

  getAll(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  has(name: AgentName): boolean {
    return this.agents.has(name);
  }

  getNames(): AgentName[] {
    return Array.from(this.agents.keys());
  }
}
