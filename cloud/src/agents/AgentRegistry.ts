import type { BaseAgent } from './BaseAgent.js';
import type { AgentTrigger } from './types.js';

/**
 * Process-local registry of agent instances. Populated at boot in
 * `cloud/src/agents/index.ts#bootAgents()`. Tests construct their own.
 *
 * Why not a DI container: one ~50-line registry covers every use,
 * and the lookup pattern is `byName` / `byTrigger`. A container is overkill.
 */
export class AgentRegistry {
  private readonly byNameMap = new Map<string, BaseAgent>();

  register(agent: BaseAgent): void {
    if (this.byNameMap.has(agent.name)) {
      throw new Error(`agent already registered: ${agent.name}`);
    }
    this.byNameMap.set(agent.name, agent);
  }

  byName(name: string): BaseAgent | undefined {
    return this.byNameMap.get(name);
  }

  byTrigger(trigger: AgentTrigger): BaseAgent[] {
    const out: BaseAgent[] = [];
    for (const agent of this.byNameMap.values()) {
      if (agent.triggers.includes(trigger)) out.push(agent);
    }
    return out;
  }

  all(): BaseAgent[] {
    return Array.from(this.byNameMap.values());
  }

  names(): string[] {
    return Array.from(this.byNameMap.keys());
  }
}

// Singleton wiring follows the same pattern as IntelligenceService.
let instance: AgentRegistry | null = null;

export function setAgentRegistry(reg: AgentRegistry): void {
  instance = reg;
}

export function getAgentRegistry(): AgentRegistry {
  if (!instance) throw new Error('AgentRegistry not initialized — call bootAgents()');
  return instance;
}

/** Test/optional accessor. */
export function maybeAgentRegistry(): AgentRegistry | null {
  return instance;
}
