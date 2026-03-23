import { createLogger } from '@utils/Logger';
import type { AgentName } from '../orchestrator/types';

const log = createLogger('AgentLLMBridge');

// ── LLM Budget Configuration ────────────────────────────────────────────────

type Tier = 'free' | 'pro' | 'premium';

/** LLM call budget per agent per day. -1 = unlimited */
const LLM_BUDGETS: Record<AgentName, Record<Tier, number>> = {
  filter: { free: 20, pro: 100, premium: 500 },
  scout: { free: 10, pro: 50, premium: 200 },
  advisor: { free: 10, pro: 100, premium: -1 },
  shopper: { free: 10, pro: 50, premium: 200 },
  social: { free: 5, pro: 30, premium: 100 },
  guardian: { free: -1, pro: -1, premium: -1 },
};

export interface AgentLLMRequest {
  agent: AgentName;
  task: string;
  structuredContext: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  fallback: () => unknown;
  maxTokens: number;
}

export interface AgentLLMResponse {
  success: boolean;
  data: unknown;
  fromLLM: boolean;
  tokensUsed?: number;
}

// ── Usage Tracking ──────────────────────────────────────────────────────────

interface DailyUsage {
  date: string;
  calls: Record<string, number>;
}

/**
 * AgentLLMBridge — mediates between agents and LLM providers.
 *
 * Provides:
 * - Budget enforcement per agent per day
 * - Automatic fallback when LLM unavailable or budget exhausted
 * - Request routing to the appropriate LLM via chrome.runtime.sendMessage
 * - Response parsing and validation
 *
 * Agents use LLMs as a reasoning layer, not as the entire agent.
 * Most tool calls don't need an LLM — it's used for natural language
 * generation, complex reasoning, and pattern synthesis.
 */
export class AgentLLMBridge {
  private usage: DailyUsage = { date: this.todayKey(), calls: {} };
  private tier: Tier = 'free';

  constructor(tier?: Tier) {
    if (tier) this.tier = tier;
  }

  /**
   * Make an LLM request on behalf of an agent.
   * Returns fallback result if budget exhausted or LLM unavailable.
   */
  async request(req: AgentLLMRequest): Promise<AgentLLMResponse> {
    // Ensure usage is for today
    this.rotateDayIfNeeded();

    // Check budget
    if (!this.hasBudget(req.agent)) {
      log.debug(`${req.agent} LLM budget exhausted — using fallback`);
      return { success: true, data: req.fallback(), fromLLM: false };
    }

    // Send to background service worker for LLM execution
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'AGENT_LLM_REQUEST',
        payload: {
          agent: req.agent,
          task: req.task,
          context: req.structuredContext,
          maxTokens: req.maxTokens,
        },
      });

      if (response?.success) {
        this.recordUsage(req.agent);
        return {
          success: true,
          data: response.data,
          fromLLM: true,
          tokensUsed: response.tokensUsed,
        };
      }

      // LLM call failed — use fallback
      log.warn(`LLM call failed for ${req.agent}: ${response?.error ?? 'unknown'}`);
      return { success: true, data: req.fallback(), fromLLM: false };
    } catch (err) {
      log.warn(`LLM bridge error for ${req.agent}`, err);
      return { success: true, data: req.fallback(), fromLLM: false };
    }
  }

  /** Check if an agent has LLM budget remaining */
  hasBudget(agent: AgentName): boolean {
    const limit = LLM_BUDGETS[agent]?.[this.tier] ?? 0;
    if (limit === -1) return true;

    const used = this.usage.calls[agent] ?? 0;
    return used < limit;
  }

  /** Get remaining budget for an agent */
  getRemainingBudget(agent: AgentName): number {
    const limit = LLM_BUDGETS[agent]?.[this.tier] ?? 0;
    if (limit === -1) return Infinity;

    const used = this.usage.calls[agent] ?? 0;
    return Math.max(0, limit - used);
  }

  /** Get all budget info */
  getBudgetInfo(): Record<string, { used: number; limit: number; remaining: number }> {
    const info: Record<string, { used: number; limit: number; remaining: number }> = {};
    for (const agent of Object.keys(LLM_BUDGETS)) {
      const limit = LLM_BUDGETS[agent as AgentName]?.[this.tier] ?? 0;
      const used = this.usage.calls[agent] ?? 0;
      info[agent] = {
        used,
        limit: limit === -1 ? Infinity : limit,
        remaining: limit === -1 ? Infinity : Math.max(0, limit - used),
      };
    }
    return info;
  }

  private recordUsage(agent: AgentName): void {
    this.usage.calls[agent] = (this.usage.calls[agent] ?? 0) + 1;
  }

  private rotateDayIfNeeded(): void {
    const today = this.todayKey();
    if (this.usage.date !== today) {
      this.usage = { date: today, calls: {} };
    }
  }

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let bridgeInstance: AgentLLMBridge | null = null;

export function getAgentLLMBridge(): AgentLLMBridge {
  if (!bridgeInstance) {
    bridgeInstance = new AgentLLMBridge();
  }
  return bridgeInstance;
}
