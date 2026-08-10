import { AgentRegistry, setAgentRegistry } from './AgentRegistry.js';
import { RecallAgent } from './recall/RecallAgent.js';
import { ConciergeAgent } from './concierge/ConciergeAgent.js';
import { CuratorAgent } from './curator/CuratorAgent.js';
import { DecisionAgent } from './decision/DecisionAgent.js';
import { CurriculumAgent } from './curriculum/CurriculumAgent.js';
import { SynthesistAgent } from './synthesist/SynthesistAgent.js';
import { logger } from '../observability/logger.js';

/**
 * Boot the active-agents subsystem. Idempotent.
 *
 * Called from `cloud/src/bootstrap.ts#bootIntelligence()` only when
 * INTELLIGENCE_AGENTS_ENABLED is true, so dev / tests can skip the
 * agents layer cleanly.
 *
 * The registry is process-local. Multi-instance fleets share the agent
 * code but each instance has its own registry — that's fine, because
 * agents are stateless and Postgres holds the durable state (subscriptions,
 * runs, events).
 */
export function bootAgents(): void {
  const registry = new AgentRegistry();
  registry.register(new RecallAgent());
  registry.register(new ConciergeAgent());
  registry.register(new CuratorAgent());
  registry.register(new DecisionAgent());
  registry.register(new CurriculumAgent());
  registry.register(new SynthesistAgent());
  setAgentRegistry(registry);
  logger.info({ count: registry.names().length, agents: registry.names() }, 'agents booted');
}
