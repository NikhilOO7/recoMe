import { createLogger } from '@utils/Logger';
import { getToolExecutor, type ToolResult } from '../tools/ToolExecutor';
import type { AgentName, AgentResult, BrainTask, TaskContext } from '../orchestrator/types';

const log = createLogger('BaseAgent');

/**
 * BaseAgent — abstract base class for all specialized agents.
 *
 * Provides:
 * - Unified tool execution via ToolExecutor
 * - Performance budget enforcement
 * - Structured result building
 *
 * Subclasses implement `run()` with their domain-specific logic.
 */
export abstract class BaseAgent {
  abstract readonly name: AgentName;
  abstract readonly description: string;
  /** Max time this agent should take (ms) */
  abstract readonly budgetMs: number;

  private toolsUsed: string[] = [];

  /**
   * Execute this agent's logic for a given task.
   * Wraps `run()` with timing, error handling, and budget enforcement.
   */
  async execute(task: BrainTask): Promise<AgentResult> {
    const start = performance.now();
    this.toolsUsed = [];

    try {
      const result = await this.run(task.context, task);
      const latencyMs = performance.now() - start;

      if (latencyMs > this.budgetMs) {
        log.warn(`${this.name} exceeded budget: ${latencyMs.toFixed(0)}ms > ${this.budgetMs}ms`);
      }

      return {
        agent: this.name,
        success: true,
        data: result.data,
        confidence: result.confidence,
        reasoning: result.reasoning,
        toolsUsed: [...this.toolsUsed],
        latencyMs,
      };
    } catch (err) {
      const latencyMs = performance.now() - start;
      log.error(`${this.name} failed`, err);

      return {
        agent: this.name,
        success: false,
        data: null,
        confidence: 0,
        reasoning: `Error: ${String(err)}`,
        toolsUsed: [...this.toolsUsed],
        latencyMs,
      };
    }
  }

  /**
   * Subclasses implement this with their domain logic.
   */
  protected abstract run(
    context: TaskContext,
    task: BrainTask,
  ): Promise<{ data: unknown; confidence: number; reasoning?: string }>;

  /**
   * Execute a registered tool by name. Tracks usage for result metadata.
   */
  protected async useTool<T = unknown>(toolName: string, params: unknown): Promise<ToolResult<T>> {
    this.toolsUsed.push(toolName);
    return getToolExecutor().execute<T>(toolName, params);
  }
}
