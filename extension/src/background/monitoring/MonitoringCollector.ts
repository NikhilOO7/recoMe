/**
 * MonitoringCollector — central data collection for the QA/monitoring dashboard.
 *
 * Subscribes to EventBus events and receives direct calls from the message handler
 * to build a unified timeline of all system events. In-memory only (ring buffer),
 * cleared on service worker restart. Same pattern as decisionLog.ts.
 */

import { eventBus } from '@shared/EventBus';
import { PerfMonitor } from '@shared/PerfMonitor';
import { readStats } from '../stats';
import { getDecisionLog } from '../decisionLog';
import { getAllCacheEntries } from '../../content/adapters/PathPatternCache';
import { SELECTOR_HEALTH_THRESHOLD } from '@shared/constants';
import type { ContentMetadata, RecommendationResult, FeedbackType } from '@shared/types';

// ── Event Types ──────────────────────────────────────────────────────────────

export type MonitorEventType =
  // Core pipeline
  | 'card_detected'
  | 'card_scored'
  | 'feedback_given'
  | 'implicit_signal'
  // Memory & learning
  | 'memory_written'
  | 'pattern_created'
  | 'context_switched'
  | 'topic_blocked'
  | 'topic_liked'
  | 'content_hidden'
  | 'content_boosted'
  // Intelligence & agents
  | 'insight_ready'
  | 'insight_acted'
  | 'insight_dismissed'
  | 'brain_task_started'
  | 'brain_task_completed'
  | 'agent_executed'
  // Smart prompts
  | 'prompt_triggered'
  | 'prompt_responded'
  | 'prompt_dismissed'
  | 'prompt_fatigued'
  // Commerce
  | 'price_recorded'
  | 'price_alert_fired'
  | 'watchlist_changed'
  // Platform imports
  | 'import_started'
  | 'import_completed'
  | 'import_failed'
  // Overlay
  | 'overlay_toggled'
  | 'overlay_theme_changed'
  // System
  | 'alarm_fired'
  | 'search_tracked'
  | 'achievement_unlocked'
  | 'selector_discovered'
  | 'selector_failed'
  | 'sync_started'
  | 'sync_completed'
  | 'sync_conflict'
  | 'error';

export type MonitorEventCategory =
  | 'pipeline'
  | 'learning'
  | 'intelligence'
  | 'commerce'
  | 'prompt'
  | 'overlay'
  | 'sync'
  | 'system';

export interface MonitorEvent {
  id: string;
  timestamp: number;
  type: MonitorEventType;
  source: 'eventbus' | 'message' | 'alarm' | 'agent' | 'system';
  category: MonitorEventCategory;
  summary: string;
  details: Record<string, unknown>;
  traceId?: string;
}

export interface PipelineTrace {
  traceId: string;
  contentTitle: string;
  platform: string;
  events: MonitorEvent[];
  startTime: number;
  endTime?: number;
  finalAction?: string;
  finalScore?: number;
  durationMs?: number;
  agentsInvolved?: string[];
}

export interface PipelineTraceSummary {
  traceId: string;
  contentTitle: string;
  platform: string;
  finalAction?: string;
  finalScore?: number;
  durationMs?: number;
  eventCount: number;
  startTime: number;
}

export interface AgentMetrics {
  agentName: string;
  tasksHandled: number;
  avgLatencyMs: number;
  successRate: number;
  toolsUsed: Record<string, number>;
  lastActive: number;
  insightsSurfaced: number;
  insightsActedOn: number;
}

export interface SystemHealthSnapshot {
  timestamp: number;
  // Core pipeline
  cardDetectionRate: number;
  scoreDistribution: { hide: number; suppress: number; show: number; boost: number };
  avgScoringLatencyMs: number;
  // Memory & learning
  memoryEntryCount: number;
  graphEntityCount: number;
  graphRelationCount: number;
  blockedTopicCount: number;
  likedTopicCount: number;
  // Agents & intelligence
  brainTasksProcessed: number;
  agentMetrics: AgentMetrics[];
  insightsGenerated: number;
  insightActRate: number;
  // Smart prompts
  promptsTriggered: number;
  promptResponseRate: number;
  promptFatigueActive: boolean;
  // Commerce
  trackedPrices: number;
  activeAlerts: number;
  watchlistSize: number;
  // Selectors
  selectorHealthSummary: { healthy: number; degraded: number; failed: number };
  // Overlay
  overlayActive: boolean;
  // Sync (future)
  lastSyncTime: number | null;
  syncStatus: 'idle' | 'syncing' | 'error' | 'disabled';
  // Platform imports
  lastImportTime: number | null;
  importedPlatforms: string[];
  // System
  avgMessageLatency: number;
  lastAlarmRuns: Record<string, number>;
  recentErrors: number;
  totalEventsRecorded: number;
}

export interface TimelineFilters {
  categories?: MonitorEventCategory[];
  types?: MonitorEventType[];
  traceId?: string;
  since?: number;
  limit?: number;
}

// ── Category mapping ─────────────────────────────────────────────────────────

const TYPE_CATEGORY: Record<MonitorEventType, MonitorEventCategory> = {
  card_detected: 'pipeline',
  card_scored: 'pipeline',
  feedback_given: 'pipeline',
  implicit_signal: 'pipeline',
  memory_written: 'learning',
  pattern_created: 'learning',
  context_switched: 'learning',
  topic_blocked: 'learning',
  topic_liked: 'learning',
  content_hidden: 'learning',
  content_boosted: 'learning',
  insight_ready: 'intelligence',
  insight_acted: 'intelligence',
  insight_dismissed: 'intelligence',
  brain_task_started: 'intelligence',
  brain_task_completed: 'intelligence',
  agent_executed: 'intelligence',
  prompt_triggered: 'prompt',
  prompt_responded: 'prompt',
  prompt_dismissed: 'prompt',
  prompt_fatigued: 'prompt',
  price_recorded: 'commerce',
  price_alert_fired: 'commerce',
  watchlist_changed: 'commerce',
  import_started: 'commerce',
  import_completed: 'commerce',
  import_failed: 'commerce',
  overlay_toggled: 'overlay',
  overlay_theme_changed: 'overlay',
  alarm_fired: 'system',
  search_tracked: 'system',
  achievement_unlocked: 'system',
  selector_discovered: 'system',
  selector_failed: 'system',
  sync_started: 'sync',
  sync_completed: 'sync',
  sync_conflict: 'sync',
  error: 'system',
};

// ── Collector ────────────────────────────────────────────────────────────────

const MAX_TIMELINE = 500;
const MAX_TRACES = 100;

class MonitoringCollectorImpl {
  private timeline: MonitorEvent[] = [];
  private traces = new Map<string, PipelineTrace>();
  private traceOrder: string[] = [];
  private alarmRuns: Record<string, number> = {};
  private agentStats = new Map<
    string,
    {
      tasks: number;
      successes: number;
      totalLatency: number;
      tools: Record<string, number>;
      lastActive: number;
      insights: number;
      insightsActed: number;
    }
  >();
  private totalEvents = 0;

  // ── Core recording ──────────────────────────────────────────────────────

  recordEvent(
    type: MonitorEventType,
    source: MonitorEvent['source'],
    summary: string,
    details: Record<string, unknown> = {},
    traceId?: string,
  ): MonitorEvent {
    const event: MonitorEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      type,
      source,
      category: TYPE_CATEGORY[type],
      summary,
      details,
      traceId,
    };
    this.timeline.unshift(event);
    if (this.timeline.length > MAX_TIMELINE) this.timeline.length = MAX_TIMELINE;
    this.totalEvents++;

    // Append to trace if linked
    if (traceId && this.traces.has(traceId)) {
      const trace = this.traces.get(traceId)!;
      trace.events.push(event);
      trace.endTime = event.timestamp;
    }

    return event;
  }

  // ── Pipeline recording ──────────────────────────────────────────────────

  recordPipelineEvent(
    content: ContentMetadata,
    result: RecommendationResult,
    durationMs: number,
  ): void {
    const traceId = content.id;

    // Create trace
    const trace: PipelineTrace = {
      traceId,
      contentTitle: content.title ?? 'Untitled',
      platform: content.platform ?? 'unknown',
      events: [],
      startTime: Date.now() - durationMs,
      endTime: Date.now(),
      finalAction: result.action,
      finalScore: result.score,
      durationMs,
    };

    // Evict oldest trace if at capacity
    if (this.traces.size >= MAX_TRACES) {
      const oldest = this.traceOrder.shift();
      if (oldest) this.traces.delete(oldest);
    }
    this.traces.set(traceId, trace);
    this.traceOrder.push(traceId);

    // Record events
    this.recordEvent(
      'card_detected',
      'message',
      `Card detected: ${content.title ?? 'Untitled'} [${content.platform}]`,
      {
        platform: content.platform,
        title: content.title,
        topics: content.topics,
        contentId: content.id,
      },
      traceId,
    );

    this.recordEvent(
      'card_scored',
      'message',
      `Scored ${result.score.toFixed(3)} → ${result.action} (${durationMs.toFixed(0)}ms)`,
      {
        action: result.action,
        score: result.score,
        confidence: result.confidence,
        factors: result.factors,
        explanation: result.explanation,
        durationMs,
      },
      traceId,
    );
  }

  // ── Feedback recording ──────────────────────────────────────────────────

  recordFeedback(content: ContentMetadata, feedback: FeedbackType): void {
    this.recordEvent(
      'feedback_given',
      'message',
      `Feedback: ${feedback} on "${content.title ?? 'Untitled'}"`,
      { feedback, contentId: content.id, title: content.title, topics: content.topics },
      content.id,
    );
  }

  // ── Brain/agent recording ───────────────────────────────────────────────

  recordBrainTask(
    taskType: string,
    trigger: string,
    agents: string[],
    durationMs: number,
    success: boolean,
  ): void {
    const traceId = `brain-${Date.now()}`;

    this.recordEvent(
      'brain_task_completed',
      'agent',
      `Brain: ${taskType} (${trigger}) → ${agents.join(', ')} [${durationMs.toFixed(0)}ms]`,
      { taskType, trigger, agents, durationMs, success },
      traceId,
    );

    // Update per-agent metrics
    for (const agentName of agents) {
      const stats = this.agentStats.get(agentName) ?? {
        tasks: 0,
        successes: 0,
        totalLatency: 0,
        tools: {},
        lastActive: 0,
        insights: 0,
        insightsActed: 0,
      };
      stats.tasks++;
      if (success) stats.successes++;
      stats.totalLatency += durationMs / agents.length;
      stats.lastActive = Date.now();
      this.agentStats.set(agentName, stats);
    }
  }

  // ── Prompt recording ────────────────────────────────────────────────────

  recordPromptEvent(
    eventType: 'prompt_triggered' | 'prompt_responded' | 'prompt_dismissed' | 'prompt_fatigued',
    triggerType: string,
    contentId?: string,
  ): void {
    this.recordEvent(
      eventType,
      'message',
      `Prompt ${eventType.replace('prompt_', '')}: ${triggerType}`,
      { triggerType, contentId },
      contentId,
    );
  }

  // ── Alarm recording ─────────────────────────────────────────────────────

  recordAlarmFired(alarmName: string): void {
    this.alarmRuns[alarmName] = Date.now();
    this.recordEvent('alarm_fired', 'alarm', `Alarm: ${alarmName}`, { alarmName });
  }

  // ── Error recording ─────────────────────────────────────────────────────

  recordError(source: string, error: string): void {
    this.recordEvent('error', 'system', `Error in ${source}: ${error}`, { source, error });
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  getTimeline(filters?: TimelineFilters): MonitorEvent[] {
    let result = this.timeline;

    if (filters?.categories?.length) {
      const cats = new Set(filters.categories);
      result = result.filter((e) => cats.has(e.category));
    }
    if (filters?.types?.length) {
      const types = new Set(filters.types);
      result = result.filter((e) => types.has(e.type));
    }
    if (filters?.traceId) {
      result = result.filter((e) => e.traceId === filters.traceId);
    }
    if (filters?.since) {
      result = result.filter((e) => e.timestamp >= filters.since!);
    }
    if (filters?.limit) {
      result = result.slice(0, filters.limit);
    }

    return result;
  }

  getTrace(traceId: string): PipelineTrace | null {
    return this.traces.get(traceId) ?? null;
  }

  getAllTraces(): PipelineTraceSummary[] {
    return this.traceOrder
      .slice()
      .reverse()
      .map((id) => {
        const t = this.traces.get(id)!;
        return {
          traceId: t.traceId,
          contentTitle: t.contentTitle,
          platform: t.platform,
          finalAction: t.finalAction,
          finalScore: t.finalScore,
          durationMs: t.durationMs,
          eventCount: t.events.length,
          startTime: t.startTime,
        };
      });
  }

  getAgentMetrics(): AgentMetrics[] {
    const metrics: AgentMetrics[] = [];
    for (const [name, stats] of this.agentStats) {
      metrics.push({
        agentName: name,
        tasksHandled: stats.tasks,
        avgLatencyMs: stats.tasks > 0 ? stats.totalLatency / stats.tasks : 0,
        successRate: stats.tasks > 0 ? stats.successes / stats.tasks : 0,
        toolsUsed: { ...stats.tools },
        lastActive: stats.lastActive,
        insightsSurfaced: stats.insights,
        insightsActedOn: stats.insightsActed,
      });
    }
    return metrics;
  }

  async getHealthSnapshot(): Promise<SystemHealthSnapshot> {
    const now = Date.now();
    const fiveMinAgo = now - 5 * 60 * 1000;
    const recentEvents = this.timeline.filter((e) => e.timestamp >= fiveMinAgo);

    // Score distribution from decision log
    const decisions = getDecisionLog();
    const dist = { hide: 0, suppress: 0, show: 0, boost: 0 };
    for (const d of decisions) {
      const a = d.result.action as keyof typeof dist;
      if (a in dist) dist[a]++;
    }

    // Card detection rate (last 5 min)
    const cardEvents = recentEvents.filter((e) => e.type === 'card_detected');
    const elapsedMin = Math.max((now - fiveMinAgo) / 60_000, 1);
    const cardDetectionRate = cardEvents.length / elapsedMin;

    // Avg scoring latency
    const scoredEvents = recentEvents.filter((e) => e.type === 'card_scored');
    const avgScoringLatencyMs =
      scoredEvents.length > 0
        ? scoredEvents.reduce((sum, e) => sum + ((e.details.durationMs as number) || 0), 0) /
          scoredEvents.length
        : 0;

    // Errors
    const recentErrors = recentEvents.filter((e) => e.type === 'error').length;

    // Selector health
    const selectorHealthSummary = { healthy: 0, degraded: 0, failed: 0 };
    try {
      const selectors = await getAllCacheEntries();
      for (const rec of Object.values(selectors)) {
        if (rec.consecutiveFailures >= 3) selectorHealthSummary.failed++;
        else if (rec.healthScore < SELECTOR_HEALTH_THRESHOLD) selectorHealthSummary.degraded++;
        else selectorHealthSummary.healthy++;
      }
    } catch {
      // Selector health unavailable
    }

    // Perf metrics
    let avgMessageLatency = 0;
    try {
      const perf = await PerfMonitor.getInstance().getAverages();
      avgMessageLatency = perf.message_roundtrip_ms ?? 0;
    } catch {
      // Perf unavailable
    }

    // Stats
    let memoryEntryCount = 0;
    let graphEntityCount = 0;
    let blockedTopicCount = 0;
    let likedTopicCount = 0;
    try {
      const stored = await readStats();
      blockedTopicCount = Object.keys(stored.blocked_topics).length;
    } catch {
      // Stats unavailable
    }

    // Counts from recent memory events
    const memoryEvents = this.timeline.filter((e) => e.type === 'memory_written');
    memoryEntryCount = memoryEvents.length; // approximate from monitoring

    // Prompts
    const promptEvents = recentEvents.filter((e) => e.category === 'prompt');
    const promptsTriggered = promptEvents.filter((e) => e.type === 'prompt_triggered').length;
    const promptResponded = promptEvents.filter((e) => e.type === 'prompt_responded').length;
    const promptResponseRate = promptsTriggered > 0 ? promptResponded / promptsTriggered : 0;
    const promptFatigueActive = promptEvents.some((e) => e.type === 'prompt_fatigued');

    // Intelligence
    const insightEvents = this.timeline.filter((e) => e.type === 'insight_ready');
    const insightActedEvents = this.timeline.filter((e) => e.type === 'insight_acted');
    const insightsGenerated = insightEvents.length;
    const insightActRate =
      insightsGenerated > 0 ? insightActedEvents.length / insightsGenerated : 0;

    // Brain
    const brainEvents = this.timeline.filter((e) => e.type === 'brain_task_completed');

    return {
      timestamp: now,
      cardDetectionRate,
      scoreDistribution: dist,
      avgScoringLatencyMs,
      memoryEntryCount,
      graphEntityCount,
      graphRelationCount: 0,
      blockedTopicCount,
      likedTopicCount,
      brainTasksProcessed: brainEvents.length,
      agentMetrics: this.getAgentMetrics(),
      insightsGenerated,
      insightActRate,
      promptsTriggered,
      promptResponseRate,
      promptFatigueActive,
      trackedPrices: 0,
      activeAlerts: 0,
      watchlistSize: 0,
      selectorHealthSummary,
      overlayActive: false,
      lastSyncTime: null,
      syncStatus: 'disabled',
      lastImportTime: null,
      importedPlatforms: [],
      avgMessageLatency,
      lastAlarmRuns: { ...this.alarmRuns },
      recentErrors,
      totalEventsRecorded: this.totalEvents,
    };
  }

  clear(): void {
    this.timeline.length = 0;
    this.traces.clear();
    this.traceOrder.length = 0;
    this.alarmRuns = {};
    this.agentStats.clear();
    this.totalEvents = 0;
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let collector: MonitoringCollectorImpl | null = null;

export function getMonitoringCollector(): MonitoringCollectorImpl {
  if (!collector) collector = new MonitoringCollectorImpl();
  return collector;
}

// ── EventBus integration ─────────────────────────────────────────────────────

export function registerMonitoring(): void {
  const c = getMonitoringCollector();

  eventBus.on('CONTENT_HIDDEN', (p) => {
    c.recordEvent(
      'content_hidden',
      'eventbus',
      `Hidden: ${p.topics.join(', ') || p.contentId}`,
      p,
      p.contentId,
    );
  });
  eventBus.on('CONTENT_BOOSTED', (p) => {
    c.recordEvent(
      'content_boosted',
      'eventbus',
      `Boosted: ${p.topics.join(', ') || p.contentId}`,
      p,
      p.contentId,
    );
  });
  eventBus.on('TOPIC_BLOCKED', (p) => {
    c.recordEvent('topic_blocked', 'eventbus', `Blocked topic: ${p.topic}`, p);
  });
  eventBus.on('TOPIC_LIKED', (p) => {
    c.recordEvent('topic_liked', 'eventbus', `Liked topic: ${p.topic}`, p);
  });
  eventBus.on('MEMORY_WRITTEN', (p) => {
    c.recordEvent('memory_written', 'eventbus', `Memory: ${p.topicKey} (${p.type})`, p);
  });
  eventBus.on('PATTERN_CREATED', (p) => {
    c.recordEvent('pattern_created', 'eventbus', `Pattern: ${p.topic}`, p);
  });
  eventBus.on('CONTEXT_SWITCHED', (p) => {
    c.recordEvent('context_switched', 'eventbus', `Context → ${p.context}`, p);
  });
  eventBus.on('ACHIEVEMENT_UNLOCKED', (p) => {
    c.recordEvent('achievement_unlocked', 'eventbus', `Achievement: ${p.label}`, p);
  });
  eventBus.on('SEARCH_TRACKED', (p) => {
    c.recordEvent('search_tracked', 'eventbus', `Search: "${p.query}" on ${p.platform}`, p);
  });
  eventBus.on('PROACTIVE_INSIGHT_READY', (p) => {
    c.recordEvent('insight_ready', 'eventbus', `${p.insightCount} insight(s) ready`, p);
  });
}
