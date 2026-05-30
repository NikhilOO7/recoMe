import { createLogger } from '@utils/Logger';
import type { Platform } from '@schema/context';
import type { AgentName } from './types';

const log = createLogger('BrainState');

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface AgentEffectivenessRecord {
  insightsSurfaced: number;
  insightsActedOn: number;
  insightsDismissed: number;
  effectivenessRate: number;
}

export interface ToolEffectivenessRecord {
  calls: number;
  contributedToAction: number;
}

export interface PlatformVisitPattern {
  avgVisitDurationMs: number;
  peakHours: number[];
  commonActions: string[];
  totalVisits: number;
}

// ── BrainState ──────────────────────────────────────────────────────────────

/**
 * BrainState — tracks the Brain's learning over time.
 *
 * Persisted to chrome.storage.local under key `recome_brain_state`.
 * Loaded on Brain boot, saved periodically.
 */
export class BrainState {
  private agentEffectiveness = new Map<AgentName, AgentEffectivenessRecord>();
  private toolEffectiveness = new Map<string, ToolEffectivenessRecord>();
  private platformPatterns = new Map<Platform, PlatformVisitPattern>();
  private dirty = false;

  // ── Agent Effectiveness ───────────────────────────────────────────────────

  recordAgentInsight(agent: AgentName, actedOn: boolean): void {
    const record = this.getOrCreateAgentRecord(agent);
    record.insightsSurfaced++;
    if (actedOn) {
      record.insightsActedOn++;
    }
    record.effectivenessRate =
      record.insightsSurfaced > 0 ? record.insightsActedOn / record.insightsSurfaced : 0.5;
    this.dirty = true;
  }

  recordAgentDismissal(agent: AgentName): void {
    const record = this.getOrCreateAgentRecord(agent);
    record.insightsDismissed++;
    this.dirty = true;
  }

  getAgentEffectiveness(agent: AgentName): number {
    return this.agentEffectiveness.get(agent)?.effectivenessRate ?? 0.5;
  }

  getAllAgentEffectiveness(): Record<string, AgentEffectivenessRecord> {
    const result: Record<string, AgentEffectivenessRecord> = {};
    for (const [name, record] of this.agentEffectiveness) {
      result[name] = { ...record };
    }
    return result;
  }

  // ── Tool Effectiveness ────────────────────────────────────────────────────

  recordToolCall(toolName: string, contributedToAction: boolean): void {
    let record = this.toolEffectiveness.get(toolName);
    if (!record) {
      record = { calls: 0, contributedToAction: 0 };
      this.toolEffectiveness.set(toolName, record);
    }
    record.calls++;
    if (contributedToAction) record.contributedToAction++;
    this.dirty = true;
  }

  // ── Platform Patterns ─────────────────────────────────────────────────────

  recordPlatformVisit(platform: Platform, durationMs: number, hour: number): void {
    let pattern = this.platformPatterns.get(platform);
    if (!pattern) {
      pattern = { avgVisitDurationMs: 0, peakHours: [], commonActions: [], totalVisits: 0 };
      this.platformPatterns.set(platform, pattern);
    }

    pattern.totalVisits++;
    // Running average
    pattern.avgVisitDurationMs =
      pattern.avgVisitDurationMs + (durationMs - pattern.avgVisitDurationMs) / pattern.totalVisits;

    // Track peak hours (keep top 3)
    if (!pattern.peakHours.includes(hour)) {
      pattern.peakHours.push(hour);
      if (pattern.peakHours.length > 5) pattern.peakHours.shift();
    }

    this.dirty = true;
  }

  getPlatformPattern(platform: Platform): PlatformVisitPattern | undefined {
    return this.platformPatterns.get(platform);
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  async load(): Promise<void> {
    try {
      const result = await chrome.storage.local.get('recome_brain_state');
      const saved = result['recome_brain_state'] as SerializedBrainState | undefined;
      if (!saved) return;

      if (saved.agentEffectiveness) {
        for (const [k, v] of Object.entries(saved.agentEffectiveness)) {
          this.agentEffectiveness.set(k as AgentName, v);
        }
      }
      if (saved.toolEffectiveness) {
        for (const [k, v] of Object.entries(saved.toolEffectiveness)) {
          this.toolEffectiveness.set(k, v);
        }
      }
      if (saved.platformPatterns) {
        for (const [k, v] of Object.entries(saved.platformPatterns)) {
          this.platformPatterns.set(k as Platform, v);
        }
      }

      log.debug('Brain state loaded from storage');
    } catch (err) {
      log.warn('Failed to load brain state', err);
    }
  }

  async save(): Promise<void> {
    if (!this.dirty) return;

    const serialized: SerializedBrainState = {
      agentEffectiveness: Object.fromEntries(this.agentEffectiveness),
      toolEffectiveness: Object.fromEntries(this.toolEffectiveness),
      platformPatterns: Object.fromEntries(this.platformPatterns),
      savedAt: Date.now(),
    };

    try {
      await chrome.storage.local.set({ recome_brain_state: serialized });
      this.dirty = false;
      log.debug('Brain state saved');
    } catch (err) {
      log.warn('Failed to save brain state', err);
    }
  }

  private getOrCreateAgentRecord(agent: AgentName): AgentEffectivenessRecord {
    let record = this.agentEffectiveness.get(agent);
    if (!record) {
      record = {
        insightsSurfaced: 0,
        insightsActedOn: 0,
        insightsDismissed: 0,
        effectivenessRate: 0.5,
      };
      this.agentEffectiveness.set(agent, record);
    }
    return record;
  }
}

interface SerializedBrainState {
  agentEffectiveness: Record<string, AgentEffectivenessRecord>;
  toolEffectiveness: Record<string, ToolEffectivenessRecord>;
  platformPatterns: Record<string, PlatformVisitPattern>;
  savedAt: number;
}
