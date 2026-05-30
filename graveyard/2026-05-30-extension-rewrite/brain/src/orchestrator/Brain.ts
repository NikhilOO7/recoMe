import { createLogger } from '@utils/Logger';
import { AgentRegistry } from './AgentRegistry';
import { TaskRouter } from './TaskRouter';
import { ContextAssembler } from './ContextAssembler';
import { ResponseMerger } from './ResponseMerger';
import { AgentMemory } from './AgentMemory';
import { FeedbackLoop } from './FeedbackLoop';
import type {
  BrainTask,
  BrainResult,
  AgentResult,
  TaskType,
  TaskTrigger,
  TaskPriority,
  TaskContext,
} from './types';

const log = createLogger('Brain');

let taskIdCounter = 0;

/**
 * Brain — the central orchestrator for the multi-agent system.
 *
 * Flow:
 * 1. Receive a task (from message handler, page event, or scheduled trigger)
 * 2. Assemble rich context (ContextAssembler)
 * 3. Route to appropriate agents (TaskRouter)
 * 4. Execute agents in parallel with their tools
 * 5. Merge results into coherent output (ResponseMerger)
 * 6. Record outcome for future learning (FeedbackLoop)
 */
export class Brain {
  readonly registry: AgentRegistry;
  readonly memory: AgentMemory;
  private readonly router: TaskRouter;
  private readonly contextAssembler: ContextAssembler;
  private readonly merger: ResponseMerger;
  private readonly feedback: FeedbackLoop;

  constructor() {
    this.registry = new AgentRegistry();
    this.memory = new AgentMemory();
    this.router = new TaskRouter(this.registry);
    this.contextAssembler = new ContextAssembler(this.memory);
    this.merger = new ResponseMerger();
    this.feedback = new FeedbackLoop();
  }

  /**
   * Process a brain task end-to-end.
   */
  async process(task: BrainTask): Promise<BrainResult> {
    const start = performance.now();
    log.debug(`Processing task ${task.id} (${task.type})`);

    // 1. Assemble full context
    const context = await this.contextAssembler.build(task);
    const enrichedTask: BrainTask = { ...task, context };

    // 2. Route to appropriate agents
    const agentNames = this.router.selectAgents(enrichedTask);

    if (agentNames.length === 0) {
      return {
        taskId: task.id,
        taskType: task.type,
        agents: [],
        merged: { confidence: 0, explanation: 'No agents available for this task type' },
        latencyMs: performance.now() - start,
      };
    }

    // 3. Execute agents in parallel
    const agentResults: AgentResult[] = await Promise.all(
      agentNames.map(async (name) => {
        const agent = this.registry.get(name);
        if (!agent) {
          return {
            agent: name,
            success: false,
            data: null,
            confidence: 0,
            toolsUsed: [],
            latencyMs: 0,
          };
        }

        try {
          return await agent.execute(enrichedTask);
        } catch (err) {
          log.error(`Agent ${name} failed`, err);
          return {
            agent: name,
            success: false,
            data: null,
            confidence: 0,
            reasoning: `Agent error: ${String(err)}`,
            toolsUsed: [],
            latencyMs: 0,
          };
        }
      }),
    );

    // 4. Merge results
    const merged = this.merger.merge(agentResults, enrichedTask);

    const result: BrainResult = {
      taskId: task.id,
      taskType: task.type,
      agents: agentResults,
      merged,
      latencyMs: performance.now() - start,
    };

    // 5. Record for feedback loop
    this.feedback.record(task, result);

    log.debug(`Task ${task.id} completed in ${result.latencyMs.toFixed(0)}ms`);
    return result;
  }

  /**
   * Helper to create a BrainTask with auto-generated ID.
   */
  createTask(
    type: TaskType,
    trigger: TaskTrigger,
    context: TaskContext,
    priority: TaskPriority = 'immediate',
  ): BrainTask {
    return {
      id: `task_${++taskIdCounter}_${Date.now()}`,
      type,
      trigger,
      context,
      priority,
      createdAt: Date.now(),
    };
  }

  /**
   * Record user feedback on a previous task result.
   */
  recordFeedback(taskId: string, action: 'acted' | 'dismissed' | 'ignored'): void {
    this.feedback.recordUserAction(taskId, action);
  }

  /** Get feedback stats for all agents */
  getAgentStats() {
    return this.feedback.getAllStats();
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let brainInstance: Brain | null = null;

export function getBrainOrchestrator(): Brain {
  if (!brainInstance) {
    brainInstance = new Brain();
    log.info('Brain orchestrator initialized');
  }
  return brainInstance;
}
