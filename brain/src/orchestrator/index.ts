import { type Brain, getBrainOrchestrator } from './Brain';
import { FilterAgent } from '../agents/FilterAgent';
import { ScoutAgent } from '../agents/ScoutAgent';
import { AdvisorAgent } from '../agents/AdvisorAgent';
import { ShopperAgent } from '../agents/ShopperAgent';
import { SocialAgent } from '../agents/SocialAgent';
import { GuardianAgent } from '../agents/GuardianAgent';
import { createLogger } from '@utils/Logger';

const log = createLogger('BrainBootstrap');

let booted = false;

/**
 * Boot the Brain orchestrator — registers all agents.
 * Safe to call multiple times; only runs once.
 */
export function bootBrain(): Brain {
  const brain = getBrainOrchestrator();

  if (booted) return brain;
  booted = true;

  // Register all agents
  brain.registry.register(new FilterAgent());
  brain.registry.register(new ScoutAgent());
  brain.registry.register(new AdvisorAgent());
  brain.registry.register(new ShopperAgent());
  brain.registry.register(new SocialAgent());
  brain.registry.register(new GuardianAgent());

  log.info(
    `Brain booted with ${brain.registry.getNames().length} agents: ${brain.registry.getNames().join(', ')}`,
  );

  return brain;
}

export { getBrainOrchestrator } from './Brain';
export type { Brain } from './Brain';
export type {
  BrainTask,
  BrainResult,
  TaskType,
  TaskTrigger,
  TaskPriority,
  TaskContext,
  AgentName,
  AgentResult,
  MergedResult,
} from './types';
