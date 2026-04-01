import { useState, useEffect, useCallback, useRef } from 'react';
import { StatusIndicator } from '../components/StatusIndicator';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SystemHealthSnapshot {
  timestamp: number;
  cardDetectionRate: number;
  scoreDistribution: { hide: number; suppress: number; show: number; boost: number };
  avgScoringLatencyMs: number;
  memoryEntryCount: number;
  graphEntityCount: number;
  graphRelationCount: number;
  blockedTopicCount: number;
  likedTopicCount: number;
  brainTasksProcessed: number;
  agentMetrics: Array<{
    agentName: string;
    tasksHandled: number;
    avgLatencyMs: number;
    successRate: number;
  }>;
  insightsGenerated: number;
  insightActRate: number;
  promptsTriggered: number;
  promptResponseRate: number;
  promptFatigueActive: boolean;
  trackedPrices: number;
  activeAlerts: number;
  watchlistSize: number;
  selectorHealthSummary: { healthy: number; degraded: number; failed: number };
  overlayActive: boolean;
  lastSyncTime: number | null;
  syncStatus: 'idle' | 'syncing' | 'error' | 'disabled';
  lastImportTime: number | null;
  importedPlatforms: string[];
  avgMessageLatency: number;
  lastAlarmRuns: Record<string, number>;
  recentErrors: number;
  totalEventsRecorded: number;
}

interface ValidatorResult {
  name: string;
  category: string;
  status: 'pass' | 'warn' | 'fail';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  details?: Record<string, unknown>;
  suggestion?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function send<T>(type: string, payload: unknown = null): Promise<T> {
  return chrome.runtime.sendMessage({ type, payload }).then((r: { success: boolean; data?: T }) => {
    if (!r?.success) throw new Error('Request failed');
    return r.data as T;
  });
}

function relativeTime(ts: number | null): string {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.round(diff / 1_000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

function overallStatus(h: SystemHealthSnapshot): 'ok' | 'degraded' | 'error' {
  if (h.recentErrors > 10 || h.selectorHealthSummary.failed > 2 || h.syncStatus === 'error') {
    return 'error';
  }
  if (
    h.recentErrors > 0 ||
    h.selectorHealthSummary.degraded > 0 ||
    h.promptFatigueActive ||
    h.avgScoringLatencyMs > 200
  ) {
    return 'degraded';
  }
  return 'ok';
}

function statusLabel(s: 'ok' | 'degraded' | 'error'): string {
  if (s === 'ok') return 'Healthy';
  if (s === 'degraded') return 'Degraded';
  return 'Unhealthy';
}

function statusBannerColor(s: 'ok' | 'degraded' | 'error'): string {
  if (s === 'ok') return 'var(--green)';
  if (s === 'degraded') return 'var(--yellow)';
  return 'var(--red)';
}

function validatorStatusColor(status: 'pass' | 'warn' | 'fail'): string {
  if (status === 'pass') return 'var(--green)';
  if (status === 'warn') return 'var(--orange)';
  return 'var(--red)';
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HealthTab() {
  const [health, setHealth] = useState<SystemHealthSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validators, setValidators] = useState<ValidatorResult[] | null>(null);
  const [validatorsLoading, setValidatorsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHealth = useCallback(() => {
    send<SystemHealthSnapshot>('GET_MONITOR_HEALTH')
      .then((data) => {
        setHealth(data);
        setError(null);
      })
      .catch((err) => setError(err.message ?? 'Failed to fetch health'));
  }, []);

  useEffect(() => {
    fetchHealth();
    timerRef.current = setInterval(fetchHealth, 3_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchHealth]);

  const runValidators = useCallback(() => {
    setValidatorsLoading(true);
    send<ValidatorResult[]>('RUN_VALIDATORS')
      .then((data) => setValidators(data))
      .catch(() => setValidators(null))
      .finally(() => setValidatorsLoading(false));
  }, []);

  // ── Loading / Error states ──────────────────────────────────────────────────

  if (error && !health) {
    return (
      <div className="dt-health-root" style={{ padding: 16, color: 'var(--red)' }}>
        Error: {error}
      </div>
    );
  }

  if (!health) {
    return (
      <div className="dt-health-root" style={{ padding: 16, color: 'var(--text2)' }}>
        Loading health data...
      </div>
    );
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const status = overallStatus(health);
  const dist = health.scoreDistribution;
  const distTotal = dist.hide + dist.suppress + dist.show + dist.boost || 1;
  const sel = health.selectorHealthSummary;

  return (
    <div
      className="dt-health-root"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12 }}
    >
      {/* ── Status Banner ──────────────────────────────────────────────────── */}
      <div
        className="dt-health-banner"
        style={{
          background: statusBannerColor(status),
          color: '#fff',
          borderRadius: 6,
          padding: '10px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontWeight: 600,
        }}
      >
        <span>System: {statusLabel(status)}</span>
        <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.85 }}>
          Updated {relativeTime(health.timestamp)}
        </span>
      </div>

      {error && (
        <div className="dt-health-error-inline" style={{ color: 'var(--orange)', fontSize: 12 }}>
          Refresh error: {error}
        </div>
      )}

      {/* ── Grid Sections ──────────────────────────────────────────────────── */}
      <div
        className="dt-health-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 12,
        }}
      >
        {/* Core Pipeline */}
        <Section title="Core Pipeline">
          <Stat label="Card Detection Rate" value={`${health.cardDetectionRate.toFixed(1)}/s`} />
          <Stat label="Avg Scoring Latency" value={`${health.avgScoringLatencyMs.toFixed(0)}ms`} />
          <div className="dt-health-dist" style={{ marginTop: 6 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>
              Score Distribution
            </div>
            <div
              style={{
                display: 'flex',
                height: 10,
                borderRadius: 4,
                overflow: 'hidden',
                background: 'var(--bg0)',
              }}
            >
              <div
                style={{ flex: dist.hide / distTotal, background: 'var(--red)' }}
                title={`Hide: ${dist.hide}`}
              />
              <div
                style={{ flex: dist.suppress / distTotal, background: 'var(--orange)' }}
                title={`Suppress: ${dist.suppress}`}
              />
              <div
                style={{ flex: dist.show / distTotal, background: 'var(--green)' }}
                title={`Show: ${dist.show}`}
              />
              <div
                style={{ flex: dist.boost / distTotal, background: 'var(--accent)' }}
                title={`Boost: ${dist.boost}`}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 10,
                color: 'var(--text2)',
                marginTop: 2,
              }}
            >
              <span>Hide {dist.hide}</span>
              <span>Suppress {dist.suppress}</span>
              <span>Show {dist.show}</span>
              <span>Boost {dist.boost}</span>
            </div>
          </div>
        </Section>

        {/* Memory & Learning */}
        <Section title="Memory & Learning">
          <Stat label="Memory Entries" value={health.memoryEntryCount} />
          <Stat label="Graph Entities" value={health.graphEntityCount} />
          <Stat label="Graph Relations" value={health.graphRelationCount} />
          <Stat label="Blocked Topics" value={health.blockedTopicCount} />
          <Stat label="Liked Topics" value={health.likedTopicCount} />
        </Section>

        {/* Agents & Intelligence */}
        <Section title="Agents & Intelligence">
          <Stat label="Brain Tasks Processed" value={health.brainTasksProcessed} />
          <Stat label="Insights Generated" value={health.insightsGenerated} />
          <Stat label="Insight Act Rate" value={pct(health.insightActRate)} />
          <Stat label="Active Agents" value={health.agentMetrics.length} />
          {health.agentMetrics.length > 0 && (
            <div className="dt-health-agents" style={{ marginTop: 6 }}>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--text2)', textAlign: 'left' }}>
                    <th style={{ padding: '2px 4px' }}>Agent</th>
                    <th style={{ padding: '2px 4px' }}>Tasks</th>
                    <th style={{ padding: '2px 4px' }}>Latency</th>
                    <th style={{ padding: '2px 4px' }}>Success</th>
                  </tr>
                </thead>
                <tbody>
                  {health.agentMetrics.map((a) => (
                    <tr key={a.agentName} style={{ color: 'var(--text1)' }}>
                      <td style={{ padding: '2px 4px' }}>{a.agentName}</td>
                      <td style={{ padding: '2px 4px' }}>{a.tasksHandled}</td>
                      <td style={{ padding: '2px 4px' }}>{a.avgLatencyMs.toFixed(0)}ms</td>
                      <td style={{ padding: '2px 4px' }}>{pct(a.successRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Smart Prompts */}
        <Section title="Smart Prompts">
          <Stat label="Prompts Triggered" value={health.promptsTriggered} />
          <Stat label="Response Rate" value={pct(health.promptResponseRate)} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <StatusIndicator
              status={health.promptFatigueActive ? 'degraded' : 'ok'}
              label={health.promptFatigueActive ? 'Fatigue Active' : 'No Fatigue'}
            />
          </div>
        </Section>

        {/* Commerce */}
        <Section title="Commerce">
          {health.trackedPrices === 0 && health.activeAlerts === 0 && health.watchlistSize === 0 ? (
            <div style={{ color: 'var(--text2)', fontSize: 12, fontStyle: 'italic' }}>
              No commerce activity yet
            </div>
          ) : (
            <>
              <Stat label="Tracked Prices" value={health.trackedPrices} />
              <Stat label="Active Alerts" value={health.activeAlerts} />
              <Stat label="Watchlist Size" value={health.watchlistSize} />
            </>
          )}
        </Section>

        {/* Selectors */}
        <Section title="Selectors">
          <div style={{ display: 'flex', gap: 12 }}>
            <StatusIndicator status="ok" label={`${sel.healthy} healthy`} />
            <StatusIndicator status="degraded" label={`${sel.degraded} degraded`} />
            <StatusIndicator status="error" label={`${sel.failed} failed`} />
          </div>
        </Section>

        {/* Sync */}
        <Section title="Sync">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusIndicator
              status={
                health.syncStatus === 'error'
                  ? 'error'
                  : health.syncStatus === 'syncing'
                    ? 'degraded'
                    : health.syncStatus === 'disabled'
                      ? 'placeholder'
                      : 'ok'
              }
              label={health.syncStatus}
            />
          </div>
          <Stat label="Last Sync" value={relativeTime(health.lastSyncTime)} />
          <Stat label="Avg Message Latency" value={`${health.avgMessageLatency.toFixed(0)}ms`} />
        </Section>

        {/* Imports */}
        <Section title="Imports">
          <Stat label="Last Import" value={relativeTime(health.lastImportTime)} />
          {health.importedPlatforms.length > 0 ? (
            <Stat label="Platforms" value={health.importedPlatforms.join(', ')} />
          ) : (
            <div style={{ color: 'var(--text2)', fontSize: 12, fontStyle: 'italic' }}>
              No imports yet
            </div>
          )}
        </Section>

        {/* Alarms */}
        <Section title="Alarms">
          {Object.keys(health.lastAlarmRuns).length === 0 ? (
            <div style={{ color: 'var(--text2)', fontSize: 12, fontStyle: 'italic' }}>
              No alarm runs recorded
            </div>
          ) : (
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text2)', textAlign: 'left' }}>
                  <th style={{ padding: '2px 4px' }}>Alarm</th>
                  <th style={{ padding: '2px 4px' }}>Last Run</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(health.lastAlarmRuns).map(([name, ts]) => (
                  <tr key={name} style={{ color: 'var(--text1)' }}>
                    <td style={{ padding: '2px 4px' }}>{name}</td>
                    <td style={{ padding: '2px 4px' }}>{relativeTime(ts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Errors */}
        <Section title="Errors">
          <Stat label="Recent Errors" value={health.recentErrors} />
          <Stat label="Total Events Recorded" value={health.totalEventsRecorded} />
          {health.recentErrors > 0 && (
            <StatusIndicator
              status={health.recentErrors > 10 ? 'error' : 'degraded'}
              label={`${health.recentErrors} recent error${health.recentErrors !== 1 ? 's' : ''}`}
            />
          )}
        </Section>
      </div>

      {/* ── Validators ─────────────────────────────────────────────────────── */}
      <div
        className="dt-health-validators"
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        <button
          className="dt-health-validators-btn"
          onClick={runValidators}
          disabled={validatorsLoading}
          style={{
            alignSelf: 'flex-start',
            padding: '6px 14px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: validatorsLoading ? 'wait' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
            opacity: validatorsLoading ? 0.6 : 1,
          }}
        >
          {validatorsLoading ? 'Running...' : 'Run Validators'}
        </button>

        {validators && validators.length > 0 && (
          <div
            className="dt-health-validators-list"
            style={{
              background: 'var(--bg1)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {validators.map((v, i) => (
              <div
                key={`${v.name}-${i}`}
                className="dt-health-validator-item"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  padding: '6px 8px',
                  background: 'var(--bg2)',
                  borderRadius: 4,
                  borderLeft: `3px solid ${validatorStatusColor(v.status)}`,
                }}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text0)' }}>
                    {v.name}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 3,
                      background: validatorStatusColor(v.status),
                      color: '#fff',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}
                  >
                    {v.status}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text1)' }}>{v.message}</div>
                <div style={{ fontSize: 10, color: 'var(--text2)' }}>
                  {v.category} &middot; {v.severity}
                </div>
                {v.suggestion && (
                  <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 2 }}>
                    Suggestion: {v.suggestion}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {validators && validators.length === 0 && (
          <div style={{ color: 'var(--green)', fontSize: 12 }}>All validators passed.</div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="dt-health-section"
      style={{
        background: 'var(--bg1)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div
        className="dt-health-section-title"
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--text0)',
          marginBottom: 4,
          borderBottom: '1px solid var(--border)',
          paddingBottom: 4,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="dt-health-stat"
      style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}
    >
      <span style={{ color: 'var(--text2)' }}>{label}</span>
      <span style={{ color: 'var(--text0)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}
