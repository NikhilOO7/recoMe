import { createLogger } from '@utils/Logger';
import { LRUCache } from '../storage/LRUCache';

const log = createLogger('ToolExecutor');

// ── Tool Definitions ─────────────────────────────────────────────────────────

export type DataSource = 'dom' | 'graph' | 'memory' | 'llm' | 'storage';

export interface ToolDefinition {
  name: string;
  description: string;
  dataSources: DataSource[];
  maxLatencyMs: number;
  cacheable: boolean;
  cacheTtlMs?: number;
  requiresConsent?: string[];
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data: T;
  metadata: {
    latencyMs: number;
    dataSourcesUsed: DataSource[];
    cacheHit: boolean;
  };
}

export type ToolHandler<TParams = unknown, TResult = unknown> = (
  params: TParams,
) => Promise<TResult>;

// ── Tool Registry ────────────────────────────────────────────────────────────

interface RegisteredTool<TParams = unknown, TResult = unknown> {
  definition: ToolDefinition;
  handler: ToolHandler<TParams, TResult>;
}

/**
 * ToolExecutor — unified execution framework for all agent tools.
 *
 * Provides:
 * - Tool registration and lookup
 * - Caching (LRU with TTL)
 * - Performance monitoring (latency budgets)
 * - Audit logging
 */
export class ToolExecutor {
  private readonly tools = new Map<string, RegisteredTool>();
  private readonly cache = new LRUCache<string, { result: unknown; expiry: number }>(200, 300_000);
  private readonly auditLog: AuditEntry[] = [];
  private static readonly MAX_AUDIT_LOG = 100;

  /** Register a tool with its handler */
  register<TParams, TResult>(
    definition: ToolDefinition,
    handler: ToolHandler<TParams, TResult>,
  ): void {
    this.tools.set(definition.name, {
      definition,
      handler: handler as ToolHandler,
    });
  }

  /** Check if a tool is registered */
  has(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  /** Get tool definition (for LLM tool descriptions) */
  getDefinition(toolName: string): ToolDefinition | null {
    return this.tools.get(toolName)?.definition ?? null;
  }

  /** Get all registered tool definitions */
  getAllDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /** Execute a tool by name with the given parameters */
  async execute<TResult = unknown>(
    toolName: string,
    params: unknown,
  ): Promise<ToolResult<TResult>> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        success: false,
        data: null as unknown as TResult,
        metadata: { latencyMs: 0, dataSourcesUsed: [], cacheHit: false },
      };
    }

    const start = performance.now();

    // Check cache
    if (tool.definition.cacheable) {
      const cacheKey = `${toolName}:${JSON.stringify(params)}`;
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        const latencyMs = performance.now() - start;
        this.recordAudit(toolName, params, true, latencyMs);
        return {
          success: true,
          data: cached.result as TResult,
          metadata: {
            latencyMs,
            dataSourcesUsed: tool.definition.dataSources,
            cacheHit: true,
          },
        };
      }
    }

    // Execute
    try {
      const result = await tool.handler(params);
      const latencyMs = performance.now() - start;

      // Warn if over budget
      if (latencyMs > tool.definition.maxLatencyMs) {
        log.warn(
          `Tool ${toolName} exceeded budget: ${latencyMs.toFixed(0)}ms > ${tool.definition.maxLatencyMs}ms`,
        );
      }

      // Cache result
      if (tool.definition.cacheable) {
        const cacheKey = `${toolName}:${JSON.stringify(params)}`;
        const ttl = tool.definition.cacheTtlMs ?? 60_000;
        this.cache.set(cacheKey, { result, expiry: Date.now() + ttl });
      }

      this.recordAudit(toolName, params, false, latencyMs);

      return {
        success: true,
        data: result as TResult,
        metadata: {
          latencyMs,
          dataSourcesUsed: tool.definition.dataSources,
          cacheHit: false,
        },
      };
    } catch (err) {
      const latencyMs = performance.now() - start;
      log.error(`Tool ${toolName} failed`, err);
      this.recordAudit(toolName, params, false, latencyMs, err);

      return {
        success: false,
        data: null as unknown as TResult,
        metadata: {
          latencyMs,
          dataSourcesUsed: tool.definition.dataSources,
          cacheHit: false,
        },
      };
    }
  }

  /** Get recent audit log entries */
  getAuditLog(): ReadonlyArray<AuditEntry> {
    return this.auditLog;
  }

  private recordAudit(
    toolName: string,
    params: unknown,
    cacheHit: boolean,
    latencyMs: number,
    error?: unknown,
  ): void {
    this.auditLog.push({
      toolName,
      timestamp: Date.now(),
      cacheHit,
      latencyMs,
      error: error ? String(error) : undefined,
    });

    // Trim audit log
    if (this.auditLog.length > ToolExecutor.MAX_AUDIT_LOG) {
      this.auditLog.splice(0, this.auditLog.length - ToolExecutor.MAX_AUDIT_LOG);
    }
  }
}

export interface AuditEntry {
  toolName: string;
  timestamp: number;
  cacheHit: boolean;
  latencyMs: number;
  error?: string;
}

// ── Singleton ────────────────────────────────────────────────────────────────

let executorInstance: ToolExecutor | null = null;

export function getToolExecutor(): ToolExecutor {
  if (!executorInstance) {
    executorInstance = new ToolExecutor();
  }
  return executorInstance;
}
