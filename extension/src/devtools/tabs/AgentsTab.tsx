import { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentMetrics {
  agentName: string;
  tasksHandled: number;
  avgLatencyMs: number;
  successRate: number;
  toolsUsed: Record<string, number>;
  lastActive: number;
  insightsSurfaced: number;
  insightsActedOn: number;
}

interface BrainTaskEvent {
  id: string;
  timestamp: number;
  type: string;
  source: string;
  category: string;
  summary: string;
  details: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function send<T>(type: string, payload: unknown = null): Promise<T> {
  return chrome.runtime.sendMessage({ type, payload }).then((r: { success: boolean; data?: T }) => {
    if (!r?.success) throw new Error('Request failed');
    return r.data as T;
  });
}

const EXPECTED_AGENTS = ['Filter', 'Scout', 'Advisor', 'Shopper', 'Social', 'Guardian'] as const;

interface BudgetEntry {
  agent: string;
  budgetMs: number;
}

const PERFORMANCE_BUDGETS: BudgetEntry[] = [
  { agent: 'Filter', budgetMs: 15 },
  { agent: 'Scout', budgetMs: 500 },
  { agent: 'Advisor', budgetMs: 1000 },
  { agent: 'Chat', budgetMs: 3000 },
];

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 5000) return 'just now';
  if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function budgetStatus(actual: number, budget: number): 'green' | 'orange' | 'red' {
  if (actual <= budget) return 'green';
  if (actual <= budget * 1.5) return 'orange';
  return 'red';
}

function budgetBarColor(status: 'green' | 'orange' | 'red'): string {
  if (status === 'green') return 'var(--green)';
  if (status === 'orange') return 'var(--orange)';
  return 'var(--red)';
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AgentsTab() {
  const [agents, setAgents] = useState<AgentMetrics[]>([]);
  const [brainTasks, setBrainTasks] = useState<BrainTaskEvent[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch data ────────────────────────────────────────────────────────────

  const fetchData = useCallback(() => {
    send<AgentMetrics[]>('GET_MONITOR_AGENTS')
      .then((data) => setAgents(data ?? []))
      .catch(() => {});

    send<BrainTaskEvent[]>('GET_MONITOR_TIMELINE', { category: 'intelligence' })
      .then((data) => setBrainTasks(data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchData, 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchData]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const agentMap = new Map(agents.map((a) => [a.agentName, a]));

  const totalInsightsSurfaced = agents.reduce((s, a) => s + a.insightsSurfaced, 0);
  const totalInsightsActedOn = agents.reduce((s, a) => s + a.insightsActedOn, 0);
  const totalInsightsGenerated = totalInsightsSurfaced; // surfaced is the top of funnel we know
  const totalInsightsDismissed = totalInsightsSurfaced - totalInsightsActedOn;

  const sortedBrainTasks = [...brainTasks].sort((a, b) => b.timestamp - a.timestamp);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="dt-agent-root">
      {/* Toolbar */}
      <div className="dt-toolbar">
        <span className="dt-agent-title">Brain & Agents</span>

        <button
          className="dt-agent-refresh-toggle"
          onClick={() => setAutoRefresh((v) => !v)}
          title={autoRefresh ? 'Pause auto-refresh' : 'Resume auto-refresh'}
        >
          <span className={`refresh-dot${autoRefresh ? '' : ' paused'}`} />
        </button>

        <span className="dt-info">
          {agents.length} active agent{agents.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="dt-scroll">
        {/* ── Section 1: Agent Registry ──────────────────────────────────── */}
        <section className="dt-agent-section">
          <h3 className="dt-agent-section-title">Agent Registry</h3>
          <table className="dt-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Tasks</th>
                <th>Avg Latency</th>
                <th>Success Rate</th>
                <th>Insights</th>
                <th>Last Active</th>
              </tr>
            </thead>
            <tbody>
              {EXPECTED_AGENTS.map((name) => {
                const m = agentMap.get(name);
                if (!m) {
                  return (
                    <tr key={name} className="dt-agent-inactive-row">
                      <td>
                        <span className="dt-agent-name">{name}</span>
                      </td>
                      <td colSpan={5} style={{ color: 'var(--text2)', fontStyle: 'italic' }}>
                        Not yet active
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={name}>
                    <td>
                      <span className="dt-agent-name">{m.agentName}</span>
                    </td>
                    <td>{m.tasksHandled}</td>
                    <td>{m.avgLatencyMs.toFixed(1)} ms</td>
                    <td>
                      <span
                        style={{
                          color:
                            m.successRate >= 0.9
                              ? 'var(--green)'
                              : m.successRate >= 0.7
                                ? 'var(--orange)'
                                : 'var(--red)',
                        }}
                      >
                        {(m.successRate * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td>
                      {m.insightsSurfaced} surfaced / {m.insightsActedOn} acted
                    </td>
                    <td>{relativeTime(m.lastActive)}</td>
                  </tr>
                );
              })}
              {/* Show any agents not in expected list */}
              {agents
                .filter(
                  (a) => !EXPECTED_AGENTS.includes(a.agentName as (typeof EXPECTED_AGENTS)[number]),
                )
                .map((m) => (
                  <tr key={m.agentName}>
                    <td>
                      <span className="dt-agent-name">{m.agentName}</span>
                    </td>
                    <td>{m.tasksHandled}</td>
                    <td>{m.avgLatencyMs.toFixed(1)} ms</td>
                    <td>
                      <span
                        style={{
                          color:
                            m.successRate >= 0.9
                              ? 'var(--green)'
                              : m.successRate >= 0.7
                                ? 'var(--orange)'
                                : 'var(--red)',
                        }}
                      >
                        {(m.successRate * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td>
                      {m.insightsSurfaced} surfaced / {m.insightsActedOn} acted
                    </td>
                    <td>{relativeTime(m.lastActive)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>

        {/* ── Section 2: Performance Budgets ─────────────────────────────── */}
        <section className="dt-agent-section">
          <h3 className="dt-agent-section-title">Performance Budgets</h3>
          <div className="dt-agent-budgets">
            {PERFORMANCE_BUDGETS.map(({ agent, budgetMs }) => {
              const m = agentMap.get(agent);
              const actual = m?.avgLatencyMs ?? 0;
              const hasData = !!m;
              const status = hasData ? budgetStatus(actual, budgetMs) : 'green';
              const pct = hasData ? Math.min((actual / (budgetMs * 2)) * 100, 100) : 0;
              const budgetPct = (budgetMs / (budgetMs * 2)) * 100; // 50% mark

              return (
                <div key={agent} className="dt-agent-budget-row">
                  <div className="dt-agent-budget-label">
                    <span className="dt-agent-name">{agent}</span>
                    <span className="dt-agent-budget-limit">&lt;{budgetMs}ms</span>
                  </div>
                  <div className="dt-agent-budget-track">
                    {/* Budget threshold marker */}
                    <div className="dt-agent-budget-marker" style={{ left: `${budgetPct}%` }} />
                    {/* Actual bar */}
                    <div
                      className="dt-agent-budget-bar"
                      style={{
                        width: hasData ? `${pct}%` : '0%',
                        backgroundColor: budgetBarColor(status),
                      }}
                    />
                  </div>
                  <span className="dt-agent-budget-value" style={{ color: budgetBarColor(status) }}>
                    {hasData ? `${actual.toFixed(1)} ms` : '--'}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Section 3: Tool Usage ──────────────────────────────────────── */}
        <section className="dt-agent-section">
          <h3 className="dt-agent-section-title">Tool Usage</h3>
          {agents.length === 0 ? (
            <div className="dt-agent-empty">No agent data yet</div>
          ) : (
            <div className="dt-agent-tools-grid">
              {agents
                .filter((a) => Object.keys(a.toolsUsed).length > 0)
                .map((a) => {
                  const entries = Object.entries(a.toolsUsed).sort((x, y) => y[1] - x[1]);
                  const maxCount = entries.length > 0 ? entries[0]![1] : 1;
                  return (
                    <div key={a.agentName} className="dt-agent-tools-card">
                      <div className="dt-agent-tools-card-title">{a.agentName}</div>
                      {entries.map(([tool, count]) => (
                        <div key={tool} className="dt-agent-tool-row">
                          <span className="dt-agent-tool-name">{tool}</span>
                          <div className="dt-agent-tool-bar-track">
                            <div
                              className="dt-agent-tool-bar"
                              style={{
                                width: `${(count / maxCount) * 100}%`,
                                backgroundColor: 'var(--accent)',
                              }}
                            />
                          </div>
                          <span className="dt-agent-tool-count">{count}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              {agents.every((a) => Object.keys(a.toolsUsed).length === 0) && (
                <div className="dt-agent-empty">No tool usage recorded</div>
              )}
            </div>
          )}
        </section>

        {/* ── Section 4: Insight Pipeline ────────────────────────────────── */}
        <section className="dt-agent-section">
          <h3 className="dt-agent-section-title">Insight Pipeline</h3>
          {totalInsightsGenerated === 0 ? (
            <div className="dt-agent-empty">No insights generated yet</div>
          ) : (
            <div className="dt-agent-funnel">
              <FunnelStep
                label="Generated"
                value={totalInsightsGenerated}
                maxValue={totalInsightsGenerated}
                color="var(--accent)"
              />
              <FunnelArrow />
              <FunnelStep
                label="Surfaced"
                value={totalInsightsSurfaced}
                maxValue={totalInsightsGenerated}
                color="var(--yellow)"
                rate={
                  totalInsightsGenerated > 0 ? totalInsightsSurfaced / totalInsightsGenerated : 0
                }
              />
              <FunnelArrow />
              <FunnelStep
                label="Acted On"
                value={totalInsightsActedOn}
                maxValue={totalInsightsGenerated}
                color="var(--green)"
                rate={totalInsightsSurfaced > 0 ? totalInsightsActedOn / totalInsightsSurfaced : 0}
              />
              <FunnelArrow />
              <FunnelStep
                label="Dismissed"
                value={totalInsightsDismissed}
                maxValue={totalInsightsGenerated}
                color="var(--red)"
                rate={
                  totalInsightsSurfaced > 0 ? totalInsightsDismissed / totalInsightsSurfaced : 0
                }
              />
            </div>
          )}
        </section>

        {/* ── Section 5: Recent Brain Tasks ──────────────────────────────── */}
        <section className="dt-agent-section">
          <h3 className="dt-agent-section-title">Recent Brain Tasks</h3>
          {sortedBrainTasks.length === 0 ? (
            <div className="dt-agent-empty">No intelligence events yet</div>
          ) : (
            <table className="dt-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Source</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {sortedBrainTasks.slice(0, 50).map((evt) => (
                  <tr key={evt.id}>
                    <td className="dt-agent-ts">{formatTimestamp(evt.timestamp)}</td>
                    <td>
                      <span className="dt-agent-task-type">{evt.type}</span>
                    </td>
                    <td>
                      <span className="dt-agent-task-source">{evt.source}</span>
                    </td>
                    <td className="dt-agent-task-summary">
                      {evt.summary}
                      {evt.details?.latencyMs != null && (
                        <span className="dt-agent-task-latency">
                          {' '}
                          {Number(evt.details.latencyMs).toFixed(0)} ms
                        </span>
                      )}
                      {Array.isArray(evt.details?.agents) && (
                        <span className="dt-agent-task-agents">
                          {' '}
                          [{(evt.details!.agents as string[]).join(', ')}]
                        </span>
                      )}
                      {evt.details?.result != null && (
                        <span className="dt-agent-task-result"> {String(evt.details.result)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FunnelStep({
  label,
  value,
  maxValue,
  color,
  rate,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  rate?: number;
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="dt-agent-funnel-step">
      <div className="dt-agent-funnel-bar-track">
        <div
          className="dt-agent-funnel-bar"
          style={{ height: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="dt-agent-funnel-value" style={{ color }}>
        {value}
      </div>
      <div className="dt-agent-funnel-label">{label}</div>
      {rate != null && <div className="dt-agent-funnel-rate">{(rate * 100).toFixed(1)}%</div>}
    </div>
  );
}

function FunnelArrow() {
  return <div className="dt-agent-funnel-arrow">&rarr;</div>;
}
