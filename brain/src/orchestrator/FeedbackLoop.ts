import type { BrainTask, BrainResult, AgentName } from './types';

interface AgentEffectiveness {
  insightsSurfaced: number;
  insightsActedOn: number;
  insightsDismissed: number;
}

/**
 * FeedbackLoop — records task outcomes and user reactions to improve
 * future routing and agent prioritization.
 *
 * Tracks:
 * - Which agents produce results the user acts on
 * - Which tools contribute to useful outcomes
 * - Response times and success rates
 */
export class FeedbackLoop {
  private readonly agentStats = new Map<AgentName, AgentEffectiveness>();
  private readonly recentOutcomes: TaskOutcome[] = [];
  private static readonly MAX_OUTCOMES = 500;

  /**
   * Record that the Brain produced a result for a task.
   * Called immediately after task execution.
   */
  record(task: BrainTask, result: BrainResult): void {
    for (const agentResult of result.agents) {
      if (!agentResult.success) continue;

      const stats = this.getOrCreateStats(agentResult.agent);
      stats.insightsSurfaced++;
    }

    this.recentOutcomes.push({
      taskId: task.id,
      taskType: task.type,
      agents: result.agents.map((a) => a.agent),
      timestamp: Date.now(),
      userAction: null, // filled in by recordUserAction later
    });

    if (this.recentOutcomes.length > FeedbackLoop.MAX_OUTCOMES) {
      this.recentOutcomes.splice(0, this.recentOutcomes.length - FeedbackLoop.MAX_OUTCOMES);
    }
  }

  /**
   * Record a user action on a previously surfaced insight.
   * Called when user clicks, dismisses, or acts on an agent's output.
   */
  recordUserAction(taskId: string, action: 'acted' | 'dismissed' | 'ignored'): void {
    const outcome = this.recentOutcomes.find((o) => o.taskId === taskId);
    if (!outcome) return;

    outcome.userAction = action;

    for (const agent of outcome.agents) {
      const stats = this.getOrCreateStats(agent);
      if (action === 'acted') {
        stats.insightsActedOn++;
      } else if (action === 'dismissed') {
        stats.insightsDismissed++;
      }
    }
  }

  /**
   * Get effectiveness rate for an agent: acted / surfaced.
   * Returns 0.5 if no data (neutral prior).
   */
  getEffectiveness(agent: AgentName): number {
    const stats = this.agentStats.get(agent);
    if (!stats || stats.insightsSurfaced === 0) return 0.5;
    return stats.insightsActedOn / stats.insightsSurfaced;
  }

  /** Get all agent effectiveness stats */
  getAllStats(): Record<string, AgentEffectiveness & { effectivenessRate: number }> {
    const result: Record<string, AgentEffectiveness & { effectivenessRate: number }> = {};
    for (const [name, stats] of this.agentStats) {
      result[name] = {
        ...stats,
        effectivenessRate:
          stats.insightsSurfaced > 0 ? stats.insightsActedOn / stats.insightsSurfaced : 0.5,
      };
    }
    return result;
  }

  private getOrCreateStats(agent: AgentName): AgentEffectiveness {
    let stats = this.agentStats.get(agent);
    if (!stats) {
      stats = { insightsSurfaced: 0, insightsActedOn: 0, insightsDismissed: 0 };
      this.agentStats.set(agent, stats);
    }
    return stats;
  }
}

interface TaskOutcome {
  taskId: string;
  taskType: string;
  agents: AgentName[];
  timestamp: number;
  userAction: 'acted' | 'dismissed' | 'ignored' | null;
}
