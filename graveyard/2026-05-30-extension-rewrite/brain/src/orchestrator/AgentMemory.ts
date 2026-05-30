import type { UserAction, UserGoal, AgentName } from './types';

/**
 * AgentMemory — shared memory layer that agents can read/write.
 *
 * Stores:
 * - Recent user actions (ring buffer)
 * - Active user goals (inferred from behavior)
 * - Agent-specific scratchpad data (keyed by agent name)
 */
export class AgentMemory {
  private readonly recentActions: UserAction[] = [];
  private readonly activeGoals: UserGoal[] = [];
  private readonly scratchpad = new Map<string, unknown>();
  private static readonly MAX_ACTIONS = 200;
  private static readonly MAX_GOALS = 20;

  // ── Actions ───────────────────────────────────────────────────────────────

  recordAction(action: UserAction): void {
    this.recentActions.push(action);
    if (this.recentActions.length > AgentMemory.MAX_ACTIONS) {
      this.recentActions.splice(0, this.recentActions.length - AgentMemory.MAX_ACTIONS);
    }
  }

  getRecentActions(limit = 20): UserAction[] {
    return this.recentActions.slice(-limit);
  }

  getActionsByPlatform(platform: string, limit = 20): UserAction[] {
    return this.recentActions.filter((a) => a.platform === platform).slice(-limit);
  }

  // ── Goals ─────────────────────────────────────────────────────────────────

  addGoal(goal: UserGoal): void {
    this.activeGoals.push(goal);
    if (this.activeGoals.length > AgentMemory.MAX_GOALS) {
      // Remove oldest completed/abandoned goals first
      const idx = this.activeGoals.findIndex((g) => g.status !== 'active');
      if (idx >= 0) {
        this.activeGoals.splice(idx, 1);
      } else {
        this.activeGoals.shift();
      }
    }
  }

  getActiveGoals(): UserGoal[] {
    return this.activeGoals.filter((g) => g.status === 'active');
  }

  updateGoalStatus(description: string, status: UserGoal['status']): void {
    const goal = this.activeGoals.find((g) => g.description === description);
    if (goal) goal.status = status;
  }

  // ── Scratchpad ────────────────────────────────────────────────────────────

  /** Agent-specific key-value store */
  setScratchpad(agent: AgentName, key: string, value: unknown): void {
    this.scratchpad.set(`${agent}:${key}`, value);
  }

  getScratchpad<T = unknown>(agent: AgentName, key: string): T | undefined {
    return this.scratchpad.get(`${agent}:${key}`) as T | undefined;
  }

  clearScratchpad(agent: AgentName): void {
    for (const key of this.scratchpad.keys()) {
      if (key.startsWith(`${agent}:`)) {
        this.scratchpad.delete(key);
      }
    }
  }
}
