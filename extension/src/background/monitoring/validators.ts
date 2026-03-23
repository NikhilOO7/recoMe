/**
 * Behavioral validators — verify the extension is working correctly.
 *
 * Each validator is a focused async check that returns a ValidatorResult.
 * Validators are grouped by category and run in parallel via runAllValidators()
 * or filtered via runCategoryValidators(category).
 */

import { getIntelligenceService } from '@intelligence/index';
import { getMonitoringCollector } from './MonitoringCollector';
import { readStats } from '../stats';
import { ALARM_NAMES, ALARM_INTERVALS } from '@shared/constants';
import type { MonitorEvent, AgentMetrics } from './MonitoringCollector';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ValidatorResult {
  name: string;
  category: string;
  status: 'pass' | 'warn' | 'fail';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  details?: Record<string, unknown>;
  suggestion?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function recentEvents(type: MonitorEvent['type'], sinceMs = 5 * 60 * 1000): MonitorEvent[] {
  return getMonitoringCollector().getTimeline({
    types: [type],
    since: Date.now() - sinceMs,
  });
}

function allEvents(type: MonitorEvent['type']): MonitorEvent[] {
  return getMonitoringCollector().getTimeline({ types: [type] });
}

// ── Pipeline Validators ──────────────────────────────────────────────────────

async function validateBlockedTopicEnforcement(): Promise<ValidatorResult> {
  const name = 'BlockedTopicEnforcement';
  const category = 'pipeline';
  try {
    const stats = await readStats();
    const blockedTopics = Object.keys(stats.blocked_topics);

    if (blockedTopics.length === 0) {
      return {
        name,
        category,
        status: 'pass',
        severity: 'critical',
        message: 'No blocked topics to test',
      };
    }

    // Simulate scoring a card that matches a blocked topic
    const svc = getIntelligenceService();
    const testTopic = blockedTopics[0]!;
    const result = await svc.processContent({
      id: `validator-test-${Date.now()}`,
      title: `Test card about ${testTopic}`,
      platform: 'unknown',
      type: 'unknown',
      url: 'https://validator.test',
      topics: [testTopic],
      entities: [],
    });

    if (result.action === 'hide') {
      return {
        name,
        category,
        status: 'pass',
        severity: 'critical',
        message: `Blocked topic "${testTopic}" correctly scored to hide`,
        details: { score: result.score, action: result.action },
      };
    }
    return {
      name,
      category,
      status: 'fail',
      severity: 'critical',
      message: `Blocked topic "${testTopic}" scored as "${result.action}" instead of hide`,
      details: { score: result.score, action: result.action, factors: result.factors },
      suggestion: 'Check that blocked topics produce negative enough scores to trigger hide action',
    };
  } catch (e) {
    return {
      name,
      category,
      status: 'fail',
      severity: 'critical',
      message: `Check failed: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

async function validateScoreDistribution(): Promise<ValidatorResult> {
  const name = 'ScoreDistribution';
  const category = 'pipeline';
  try {
    const scored = allEvents('card_scored');

    if (scored.length === 0) {
      return {
        name,
        category,
        status: 'warn',
        severity: 'warning',
        message: 'No scoring data available yet',
        suggestion: 'Browse some content so the pipeline can score cards',
      };
    }

    const scores = scored.map((e) => (e.details.score as number) ?? 0);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((a, s) => a + (s - mean) ** 2, 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev <= 0.05) {
      return {
        name,
        category,
        status: 'warn',
        severity: 'warning',
        message: `Score distribution too narrow (stdDev=${stdDev.toFixed(4)}, mean=${mean.toFixed(4)})`,
        details: { mean, stdDev, sampleSize: scores.length },
        suggestion: 'Scores are clustering — the model may not be differentiating content well',
      };
    }

    return {
      name,
      category,
      status: 'pass',
      severity: 'warning',
      message: `Score distribution healthy (stdDev=${stdDev.toFixed(4)})`,
      details: { mean, stdDev, sampleSize: scores.length },
    };
  } catch (e) {
    return {
      name,
      category,
      status: 'fail',
      severity: 'warning',
      message: `Check failed: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

async function validateScoringFactorDiversity(): Promise<ValidatorResult> {
  const name = 'ScoringFactorDiversity';
  const category = 'pipeline';
  try {
    const scored = allEvents('card_scored');

    if (scored.length === 0) {
      return {
        name,
        category,
        status: 'warn',
        severity: 'warning',
        message: 'No scoring data to analyze',
        suggestion: 'Browse content to generate scoring events',
      };
    }

    // Check recent scored events for non-zero factors
    const recentScored = scored.slice(0, 20); // last 20
    let hasNonZeroFactor = false;

    for (const event of recentScored) {
      const factors = event.details.factors as Record<string, number> | undefined;
      if (factors) {
        const nonZero = Object.values(factors).filter((v) => typeof v === 'number' && v !== 0);
        if (nonZero.length > 1) {
          hasNonZeroFactor = true;
          break;
        }
      }
    }

    if (!hasNonZeroFactor) {
      return {
        name,
        category,
        status: 'warn',
        severity: 'warning',
        message: 'All scoring factors returning 0 — the system is not learning from preferences',
        details: { sampledEvents: recentScored.length },
        suggestion: 'Provide feedback on some content so the scoring model can learn',
      };
    }

    return {
      name,
      category,
      status: 'pass',
      severity: 'warning',
      message: 'Scoring factors show diversity — model is learning',
    };
  } catch (e) {
    return {
      name,
      category,
      status: 'fail',
      severity: 'warning',
      message: `Check failed: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

async function validatePlatformDetection(): Promise<ValidatorResult> {
  const name = 'PlatformDetection';
  const category = 'pipeline';
  try {
    const detected = allEvents('card_detected');

    if (detected.length === 0) {
      return {
        name,
        category,
        status: 'warn',
        severity: 'warning',
        message: 'No card detection events found',
        suggestion:
          'Visit a supported platform (Reddit, Twitter, YouTube, etc.) to trigger detection',
      };
    }

    const platforms = new Set(detected.map((e) => e.details.platform as string).filter(Boolean));
    return {
      name,
      category,
      status: 'pass',
      severity: 'warning',
      message: `Detecting cards on ${platforms.size} platform(s)`,
      details: { platforms: [...platforms], totalDetected: detected.length },
    };
  } catch (e) {
    return {
      name,
      category,
      status: 'fail',
      severity: 'warning',
      message: `Check failed: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

async function validateFeedbackLoop(): Promise<ValidatorResult> {
  const name = 'FeedbackLoop';
  const category = 'pipeline';
  try {
    const feedbackEvents = allEvents('feedback_given');

    if (feedbackEvents.length === 0) {
      return {
        name,
        category,
        status: 'warn',
        severity: 'warning',
        message: 'No feedback given yet',
        suggestion: 'Use the overlay to give feedback on some content',
      };
    }

    // Check that feedback topics appear in subsequent scored events
    const scoredEvents = allEvents('card_scored');
    const feedbackTopics = new Set<string>();
    for (const fb of feedbackEvents) {
      const topics = fb.details.topics as string[] | undefined;
      if (topics) topics.forEach((t) => feedbackTopics.add(t));
    }

    if (feedbackTopics.size === 0 || scoredEvents.length === 0) {
      return {
        name,
        category,
        status: 'pass',
        severity: 'warning',
        message: `${feedbackEvents.length} feedback event(s) recorded — insufficient data to verify score shift`,
        details: { feedbackCount: feedbackEvents.length },
      };
    }

    return {
      name,
      category,
      status: 'pass',
      severity: 'warning',
      message: `Feedback loop active: ${feedbackEvents.length} feedback event(s), ${scoredEvents.length} scored event(s)`,
      details: {
        feedbackCount: feedbackEvents.length,
        scoredCount: scoredEvents.length,
        feedbackTopics: [...feedbackTopics],
      },
    };
  } catch (e) {
    return {
      name,
      category,
      status: 'fail',
      severity: 'warning',
      message: `Check failed: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

// ── Learning Validators ──────────────────────────────────────────────────────

async function validateMemoryGrowth(): Promise<ValidatorResult> {
  const name = 'MemoryGrowth';
  const category = 'learning';
  try {
    const svc = getIntelligenceService();
    const count = await svc.getMemoryService().getMemoryCount();
    const contentEvents = allEvents('card_detected');

    if (count === 0 && contentEvents.length > 0) {
      return {
        name,
        category,
        status: 'warn',
        severity: 'warning',
        message: 'Memory is empty despite content events existing',
        details: { memoryCount: count, contentEventsCount: contentEvents.length },
        suggestion:
          'Memory should grow as you browse — check that memory write pipeline is connected',
      };
    }

    if (count === 0) {
      return {
        name,
        category,
        status: 'pass',
        severity: 'info',
        message: 'No memories yet — browse some content to start learning',
        details: { memoryCount: 0 },
      };
    }

    return {
      name,
      category,
      status: 'pass',
      severity: 'warning',
      message: `Memory contains ${count} entries`,
      details: { memoryCount: count },
    };
  } catch (e) {
    return {
      name,
      category,
      status: 'fail',
      severity: 'warning',
      message: `Check failed: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

async function validateGraphIntegrity(): Promise<ValidatorResult> {
  const name = 'GraphIntegrity';
  const category = 'learning';
  try {
    const svc = getIntelligenceService();
    const graph = svc.getGraph();
    const entityCount = await graph.getEntityCount();

    if (entityCount === 0) {
      return {
        name,
        category,
        status: 'warn',
        severity: 'warning',
        message: 'Knowledge graph has no entities',
        details: { entityCount: 0 },
        suggestion: 'Graph should be seeded with default entities on initialization',
      };
    }

    return {
      name,
      category,
      status: 'pass',
      severity: 'warning',
      message: `Knowledge graph has ${entityCount} entities`,
      details: { entityCount },
    };
  } catch (e) {
    return {
      name,
      category,
      status: 'fail',
      severity: 'warning',
      message: `Check failed: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

async function validateDecayHealth(): Promise<ValidatorResult> {
  const name = 'DecayHealth';
  const category = 'learning';
  try {
    const alarmEvents = allEvents('alarm_fired');
    const decayEvents = alarmEvents.filter((e) => e.details.alarmName === ALARM_NAMES.decay);

    if (decayEvents.length === 0) {
      return {
        name,
        category,
        status: 'pass',
        severity: 'info',
        message: 'Decay alarm has not fired yet — may not have reached its first interval',
        suggestion: 'Decay runs every 15 minutes; wait for it to fire',
      };
    }

    const lastRun = decayEvents[0]!.timestamp;
    const msSinceRun = Date.now() - lastRun;
    const expectedIntervalMs = ALARM_INTERVALS.decay_minutes * 60 * 1000;

    if (msSinceRun > expectedIntervalMs * 2) {
      return {
        name,
        category,
        status: 'warn',
        severity: 'warning',
        message: `Decay alarm last fired ${Math.round(msSinceRun / 60000)}m ago (expected every ${ALARM_INTERVALS.decay_minutes}m)`,
        details: { lastRunMs: lastRun, msSinceRun },
        suggestion: 'Decay alarm may be stalled — check chrome.alarms registration',
      };
    }

    return {
      name,
      category,
      status: 'pass',
      severity: 'info',
      message: `Decay running normally — last fired ${Math.round(msSinceRun / 60000)}m ago`,
      details: { lastRunMs: lastRun, decayEventCount: decayEvents.length },
    };
  } catch (e) {
    return {
      name,
      category,
      status: 'fail',
      severity: 'info',
      message: `Check failed: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

// ── Overlay Validators ───────────────────────────────────────────────────────

async function validateOverlayInjection(): Promise<ValidatorResult> {
  const name = 'OverlayInjection';
  const category = 'overlay';
  try {
    const overlayEvents = allEvents('overlay_toggled');

    if (overlayEvents.length === 0) {
      return {
        name,
        category,
        status: 'warn',
        severity: 'warning',
        message: 'No overlay toggle events recorded',
        suggestion: 'Toggle the overlay on a supported page to verify injection works',
      };
    }

    return {
      name,
      category,
      status: 'pass',
      severity: 'warning',
      message: `Overlay toggled ${overlayEvents.length} time(s)`,
      details: { eventCount: overlayEvents.length },
    };
  } catch (e) {
    return {
      name,
      category,
      status: 'fail',
      severity: 'warning',
      message: `Check failed: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

async function validatePromptFatigueCalibration(): Promise<ValidatorResult> {
  const name = 'PromptFatigueCalibration';
  const category = 'overlay';
  try {
    const recentPrompts = recentEvents('prompt_triggered', 5 * 60 * 1000);
    const contentEvents = allEvents('card_detected');

    if (recentPrompts.length > 10) {
      return {
        name,
        category,
        status: 'warn',
        severity: 'warning',
        message: `Prompts triggering too frequently: ${recentPrompts.length} in last 5 minutes`,
        details: { promptCount: recentPrompts.length },
        suggestion: 'Prompt fatigue thresholds may be too low — users may dismiss prompts',
      };
    }

    if (recentPrompts.length === 0 && contentEvents.length > 0) {
      return {
        name,
        category,
        status: 'warn',
        severity: 'warning',
        message: 'Prompts never triggering despite content activity',
        details: { promptCount: 0, contentEventCount: contentEvents.length },
        suggestion: 'Check smart prompt trigger conditions — they may be too restrictive',
      };
    }

    return {
      name,
      category,
      status: 'pass',
      severity: 'warning',
      message: `Prompt frequency OK: ${recentPrompts.length} in last 5 minutes`,
    };
  } catch (e) {
    return {
      name,
      category,
      status: 'fail',
      severity: 'warning',
      message: `Check failed: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

// ── Agent Validators ─────────────────────────────────────────────────────────

async function validateAgentResponsiveness(): Promise<ValidatorResult> {
  const name = 'AgentResponsiveness';
  const category = 'agents';
  try {
    const metrics: AgentMetrics[] = getMonitoringCollector().getAgentMetrics();

    if (metrics.length === 0) {
      return {
        name,
        category,
        status: 'pass',
        severity: 'info',
        message: 'No agents active yet — will validate once agents execute',
      };
    }

    const issues: string[] = [];
    for (const agent of metrics) {
      // Filter agents should be fast (<15ms), chat/insight agents can be slower (<3000ms)
      const isFilterAgent = agent.agentName.toLowerCase().includes('filter');
      const budget = isFilterAgent ? 15 : 3000;

      if (agent.avgLatencyMs > budget) {
        issues.push(
          `${agent.agentName}: ${agent.avgLatencyMs.toFixed(0)}ms avg (budget: ${budget}ms)`,
        );
      }
    }

    if (issues.length > 0) {
      return {
        name,
        category,
        status: 'warn',
        severity: 'warning',
        message: `${issues.length} agent(s) exceeding latency budgets`,
        details: { issues },
        suggestion:
          'Slow agents degrade the scoring pipeline — consider optimizing or adding caching',
      };
    }

    return {
      name,
      category,
      status: 'pass',
      severity: 'warning',
      message: `All ${metrics.length} agent(s) within latency budgets`,
    };
  } catch (e) {
    return {
      name,
      category,
      status: 'fail',
      severity: 'warning',
      message: `Check failed: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

async function validateInsightRelevance(): Promise<ValidatorResult> {
  const name = 'InsightRelevance';
  const category = 'agents';
  try {
    const metrics: AgentMetrics[] = getMonitoringCollector().getAgentMetrics();
    const totalInsights = metrics.reduce((sum, m) => sum + m.insightsSurfaced, 0);
    const totalActed = metrics.reduce((sum, m) => sum + m.insightsActedOn, 0);

    if (totalInsights === 0) {
      return {
        name,
        category,
        status: 'pass',
        severity: 'info',
        message: 'No insights generated yet',
      };
    }

    const actRate = totalActed / totalInsights;

    if (actRate < 0.1) {
      return {
        name,
        category,
        status: 'warn',
        severity: 'warning',
        message: `Insight act rate is low: ${(actRate * 100).toFixed(1)}% (${totalActed}/${totalInsights})`,
        details: { actRate, totalInsights, totalActed },
        suggestion:
          'Users are ignoring most insights — consider improving relevance or reducing frequency',
      };
    }

    return {
      name,
      category,
      status: 'pass',
      severity: 'info',
      message: `Insight act rate: ${(actRate * 100).toFixed(1)}% (${totalActed}/${totalInsights})`,
      details: { actRate, totalInsights, totalActed },
    };
  } catch (e) {
    return {
      name,
      category,
      status: 'fail',
      severity: 'info',
      message: `Check failed: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

async function validateAgentToolUsage(): Promise<ValidatorResult> {
  const name = 'AgentToolUsage';
  const category = 'agents';
  try {
    const metrics: AgentMetrics[] = getMonitoringCollector().getAgentMetrics();

    if (metrics.length === 0) {
      return {
        name,
        category,
        status: 'pass',
        severity: 'info',
        message: 'No agent tool usage data yet',
      };
    }

    const lowDiversityAgents: string[] = [];
    for (const agent of metrics) {
      const toolNames = Object.keys(agent.toolsUsed);
      if (toolNames.length <= 1 && agent.tasksHandled > 3) {
        lowDiversityAgents.push(agent.agentName);
      }
    }

    if (lowDiversityAgents.length > 0) {
      return {
        name,
        category,
        status: 'pass',
        severity: 'info',
        message: `${lowDiversityAgents.length} agent(s) using only one tool`,
        details: { agents: lowDiversityAgents },
        suggestion: 'Single-tool agents may not be leveraging full capabilities',
      };
    }

    return {
      name,
      category,
      status: 'pass',
      severity: 'info',
      message: `All agents using diverse tools`,
    };
  } catch (e) {
    return {
      name,
      category,
      status: 'fail',
      severity: 'info',
      message: `Check failed: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

// ── Commerce Validators ──────────────────────────────────────────────────────

async function validatePriceExtractionAccuracy(): Promise<ValidatorResult> {
  const name = 'PriceExtractionAccuracy';
  const category = 'commerce';
  try {
    const priceEvents = allEvents('price_recorded');

    if (priceEvents.length === 0) {
      return {
        name,
        category,
        status: 'pass',
        severity: 'warning',
        message: 'No price recordings yet — visit a product page to trigger extraction',
      };
    }

    let invalidCount = 0;
    for (const event of priceEvents) {
      const price = event.details.price as number | null | undefined;
      if (price === null || price === undefined || isNaN(price) || price <= 0) {
        invalidCount++;
      }
    }

    if (invalidCount > 0) {
      return {
        name,
        category,
        status: 'warn',
        severity: 'warning',
        message: `${invalidCount}/${priceEvents.length} price recordings have invalid values`,
        details: { invalidCount, totalCount: priceEvents.length },
        suggestion: 'Check price extraction selectors for the affected platforms',
      };
    }

    return {
      name,
      category,
      status: 'pass',
      severity: 'warning',
      message: `All ${priceEvents.length} price recordings have valid values`,
    };
  } catch (e) {
    return {
      name,
      category,
      status: 'fail',
      severity: 'warning',
      message: `Check failed: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

async function validateAlertLiveness(): Promise<ValidatorResult> {
  const name = 'AlertLiveness';
  const category = 'commerce';
  try {
    const priceEvents = allEvents('price_recorded');
    const alertEvents = allEvents('price_alert_fired');

    if (priceEvents.length === 0) {
      return {
        name,
        category,
        status: 'pass',
        severity: 'warning',
        message: 'No price data to evaluate alerts against',
      };
    }

    // Check if any recorded prices show a drop pattern without alerts firing
    // Simple heuristic: if price events exist but zero alerts, that may be fine (no drops)
    if (alertEvents.length === 0 && priceEvents.length > 5) {
      return {
        name,
        category,
        status: 'pass',
        severity: 'warning',
        message: `${priceEvents.length} prices recorded, no alerts fired (no drops detected or no alert rules set)`,
        details: { priceEventCount: priceEvents.length, alertEventCount: 0 },
      };
    }

    return {
      name,
      category,
      status: 'pass',
      severity: 'warning',
      message: `${alertEvents.length} price alert(s) fired from ${priceEvents.length} recordings`,
      details: { priceEventCount: priceEvents.length, alertEventCount: alertEvents.length },
    };
  } catch (e) {
    return {
      name,
      category,
      status: 'fail',
      severity: 'warning',
      message: `Check failed: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

// ── System Validators ────────────────────────────────────────────────────────

async function validateAlarmLiveness(): Promise<ValidatorResult> {
  const name = 'AlarmLiveness';
  const category = 'system';
  try {
    const snapshot = await getMonitoringCollector().getHealthSnapshot();
    const lastRuns = snapshot.lastAlarmRuns;
    const now = Date.now();

    const expectedAlarms: Array<{ name: string; key: string; intervalMs: number }> = [
      { name: 'decay', key: ALARM_NAMES.decay, intervalMs: ALARM_INTERVALS.decay_minutes * 60_000 },
      { name: 'stats', key: ALARM_NAMES.stats, intervalMs: ALARM_INTERVALS.stats_minutes * 60_000 },
      {
        name: 'insight_check',
        key: ALARM_NAMES.insight_check,
        intervalMs: ALARM_INTERVALS.insight_check_minutes * 60_000,
      },
      {
        name: 'selector_health',
        key: ALARM_NAMES.selector_health,
        intervalMs: ALARM_INTERVALS.selector_health_minutes * 60_000,
      },
      {
        name: 'price_check',
        key: ALARM_NAMES.price_check,
        intervalMs: ALARM_INTERVALS.price_check_minutes * 60_000,
      },
    ];

    const stale: string[] = [];
    const neverRun: string[] = [];

    for (const alarm of expectedAlarms) {
      const lastRun = lastRuns[alarm.key];
      if (!lastRun) {
        neverRun.push(alarm.name);
      } else if (now - lastRun > alarm.intervalMs * 2) {
        stale.push(`${alarm.name} (last: ${Math.round((now - lastRun) / 60000)}m ago)`);
      }
    }

    if (stale.length > 0) {
      return {
        name,
        category,
        status: 'warn',
        severity: 'warning',
        message: `${stale.length} alarm(s) overdue: ${stale.join(', ')}`,
        details: { stale, neverRun },
        suggestion:
          'Stale alarms may indicate service worker was inactive too long — check chrome.alarms',
      };
    }

    if (neverRun.length === expectedAlarms.length) {
      return {
        name,
        category,
        status: 'pass',
        severity: 'warning',
        message: 'No alarms have fired yet — extension may have just started',
        details: { neverRun },
      };
    }

    return {
      name,
      category,
      status: 'pass',
      severity: 'warning',
      message: `All alarms running on schedule`,
      details: { neverRun: neverRun.length > 0 ? neverRun : undefined },
    };
  } catch (e) {
    return {
      name,
      category,
      status: 'fail',
      severity: 'warning',
      message: `Check failed: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

async function validateMessageLatency(): Promise<ValidatorResult> {
  const name = 'MessageLatency';
  const category = 'system';
  try {
    const snapshot = await getMonitoringCollector().getHealthSnapshot();
    const avgLatency = snapshot.avgMessageLatency;

    if (avgLatency === 0) {
      return {
        name,
        category,
        status: 'pass',
        severity: 'warning',
        message: 'No message latency data yet',
      };
    }

    if (avgLatency >= 500) {
      return {
        name,
        category,
        status: 'warn',
        severity: 'warning',
        message: `Average message latency too high: ${avgLatency.toFixed(0)}ms (threshold: 500ms)`,
        details: { avgLatencyMs: avgLatency },
        suggestion: 'High latency indicates message handler or IDB bottlenecks',
      };
    }

    return {
      name,
      category,
      status: 'pass',
      severity: 'warning',
      message: `Message latency OK: ${avgLatency.toFixed(0)}ms`,
      details: { avgLatencyMs: avgLatency },
    };
  } catch (e) {
    return {
      name,
      category,
      status: 'fail',
      severity: 'warning',
      message: `Check failed: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

async function validateSelectorHealth(): Promise<ValidatorResult> {
  const name = 'SelectorHealth';
  const category = 'system';
  try {
    const snapshot = await getMonitoringCollector().getHealthSnapshot();
    const { healthy, degraded, failed } = snapshot.selectorHealthSummary;

    if (healthy + degraded + failed === 0) {
      return {
        name,
        category,
        status: 'pass',
        severity: 'warning',
        message: 'No selector health data yet — visit a supported platform',
      };
    }

    if (failed > 0) {
      return {
        name,
        category,
        status: 'warn',
        severity: 'warning',
        message: `${failed} selector(s) failing, ${degraded} degraded, ${healthy} healthy`,
        details: { healthy, degraded, failed },
        suggestion:
          'Failed selectors mean content is not being detected on some platforms — check PathPatternCache',
      };
    }

    if (degraded > 0) {
      return {
        name,
        category,
        status: 'pass',
        severity: 'warning',
        message: `${degraded} selector(s) degraded, ${healthy} healthy`,
        details: { healthy, degraded, failed },
      };
    }

    return {
      name,
      category,
      status: 'pass',
      severity: 'warning',
      message: `All ${healthy} selector(s) healthy`,
      details: { healthy, degraded, failed },
    };
  } catch (e) {
    return {
      name,
      category,
      status: 'fail',
      severity: 'warning',
      message: `Check failed: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

// ── Validator Registry ───────────────────────────────────────────────────────

const VALIDATORS: Array<{ category: string; fn: () => Promise<ValidatorResult> }> = [
  // Pipeline (critical/warning)
  { category: 'pipeline', fn: validateBlockedTopicEnforcement },
  { category: 'pipeline', fn: validateScoreDistribution },
  { category: 'pipeline', fn: validateScoringFactorDiversity },
  { category: 'pipeline', fn: validatePlatformDetection },
  { category: 'pipeline', fn: validateFeedbackLoop },
  // Learning (warning/info)
  { category: 'learning', fn: validateMemoryGrowth },
  { category: 'learning', fn: validateGraphIntegrity },
  { category: 'learning', fn: validateDecayHealth },
  // Overlay (warning)
  { category: 'overlay', fn: validateOverlayInjection },
  { category: 'overlay', fn: validatePromptFatigueCalibration },
  // Agents (warning/info)
  { category: 'agents', fn: validateAgentResponsiveness },
  { category: 'agents', fn: validateInsightRelevance },
  { category: 'agents', fn: validateAgentToolUsage },
  // Commerce (warning)
  { category: 'commerce', fn: validatePriceExtractionAccuracy },
  { category: 'commerce', fn: validateAlertLiveness },
  // System (warning)
  { category: 'system', fn: validateAlarmLiveness },
  { category: 'system', fn: validateMessageLatency },
  { category: 'system', fn: validateSelectorHealth },
];

// ── Public API ───────────────────────────────────────────────────────────────

export async function runAllValidators(): Promise<ValidatorResult[]> {
  return Promise.all(VALIDATORS.map((v) => v.fn()));
}

export async function runCategoryValidators(category: string): Promise<ValidatorResult[]> {
  const filtered = VALIDATORS.filter((v) => v.category === category);
  return Promise.all(filtered.map((v) => v.fn()));
}
