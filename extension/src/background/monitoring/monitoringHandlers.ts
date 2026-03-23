/**
 * Monitoring message handlers — delegates to MonitoringCollector and validators.
 * Returns null for non-monitoring messages (pass-through to existing dispatch).
 */

import { ok } from '@shared/messages';
import { getMonitoringCollector } from './MonitoringCollector';
import { runAllValidators, runCategoryValidators } from './validators';
import { getIntelligenceService } from '@intelligence/index';
import type { MessageResponse } from '@shared/messages';
import type { TimelineFilters } from './MonitoringCollector';

export function handleMonitoringMessage(
  type: string,
  payload: unknown,
): Promise<MessageResponse> | null {
  switch (type) {
    case 'GET_MONITOR_TIMELINE':
      return handleGetTimeline(payload as TimelineFilters | null);
    case 'GET_MONITOR_HEALTH':
      return handleGetHealth();
    case 'GET_MONITOR_TRACE':
      return handleGetTrace(payload as { traceId: string });
    case 'GET_MONITOR_TRACES':
      return handleGetTraces();
    case 'GET_MONITOR_AGENTS':
      return handleGetAgents();
    case 'RUN_VALIDATORS':
      return handleRunValidators(payload as { category?: string } | null);
    case 'SIMULATE_CONTENT':
      return handleSimulateContent(payload);
    case 'SIMULATE_FLOW':
      return handleSimulateFlow(payload as { flowId: string });
    case 'MONITOR_CLEAR':
      return handleClear();
    default:
      return null;
  }
}

async function handleGetTimeline(filters: TimelineFilters | null): Promise<MessageResponse> {
  const events = getMonitoringCollector().getTimeline(filters ?? undefined);
  return ok(events);
}

async function handleGetHealth(): Promise<MessageResponse> {
  const snapshot = await getMonitoringCollector().getHealthSnapshot();
  return ok(snapshot);
}

async function handleGetTrace(payload: { traceId: string }): Promise<MessageResponse> {
  const trace = getMonitoringCollector().getTrace(payload.traceId);
  return ok(trace);
}

async function handleGetTraces(): Promise<MessageResponse> {
  const traces = getMonitoringCollector().getAllTraces();
  return ok(traces);
}

async function handleGetAgents(): Promise<MessageResponse> {
  const metrics = getMonitoringCollector().getAgentMetrics();
  return ok(metrics);
}

async function handleRunValidators(
  payload: { category?: string } | null,
): Promise<MessageResponse> {
  const results = payload?.category
    ? await runCategoryValidators(payload.category)
    : await runAllValidators();
  return ok(results);
}

async function handleSimulateContent(payload: unknown): Promise<MessageResponse> {
  // Dry-run scoring — calls processContent but does NOT write to decision log or emit events
  try {
    const svc = getIntelligenceService();
    const result = await svc.processContent(payload as Parameters<typeof svc.processContent>[0]);
    return ok(result);
  } catch (e) {
    return ok({ error: e instanceof Error ? e.message : 'Simulation failed' });
  }
}

async function handleSimulateFlow(payload: { flowId: string }): Promise<MessageResponse> {
  // Flow simulation is handled client-side in the FlowsTab
  // This endpoint just provides a hook for flows that need background interaction
  return ok({ flowId: payload.flowId, status: 'not_implemented' });
}

async function handleClear(): Promise<MessageResponse> {
  getMonitoringCollector().clear();
  return ok(undefined);
}
