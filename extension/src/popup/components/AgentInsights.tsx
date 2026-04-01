import { useEffect, useState, useCallback } from 'react';
import type { AgentActivityEntry } from '@shared/messages';

const AGENT_ICONS: Record<string, string> = {
  filter: '🔍',
  scout: '🔭',
  shopper: '🛒',
  advisor: '💡',
  social: '📡',
  guardian: '🛡️',
};

const AGENT_COLORS: Record<string, string> = {
  filter: '#6366f1',
  scout: '#0891b2',
  shopper: '#059669',
  advisor: '#8b5cf6',
  social: '#ec4899',
  guardian: '#f59e0b',
};

function send(
  type: string,
  payload: unknown = null,
): Promise<{ success: boolean; data?: unknown }> {
  return chrome.runtime.sendMessage({ type, payload });
}

export function AgentInsights() {
  const [agents, setAgents] = useState<AgentActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    send('GET_AGENT_ACTIVITY')
      .then((r) => {
        if (r.success && Array.isArray(r.data)) {
          setAgents(r.data as AgentActivityEntry[]);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return null;
  if (agents.length === 0) return null;

  const totalTasks = agents.reduce((sum, a) => sum + a.tasksHandled, 0);

  return (
    <div className="agent-insights">
      <h3 className="section-title">
        AI Agents
        {totalTasks > 0 && (
          <span className="agent-insights-count">{totalTasks} tasks processed</span>
        )}
      </h3>
      <p className="agent-insights-subtitle">
        These agents work together to personalize your browsing experience.
      </p>
      <div className="agent-module-grid">
        {agents.map((agent) => {
          const icon = AGENT_ICONS[agent.agent] ?? '🤖';
          const color = AGENT_COLORS[agent.agent] ?? '#6366f1';
          const isExpanded = expanded === agent.agent;

          return (
            <div
              key={agent.agent}
              className={`agent-module-card ${isExpanded ? 'expanded' : ''}`}
              style={{ borderLeftColor: color }}
            >
              <button
                className="agent-module-header"
                onClick={() => setExpanded(isExpanded ? null : agent.agent)}
                aria-expanded={isExpanded}
              >
                <span className="agent-module-icon">{icon}</span>
                <div className="agent-module-info">
                  <span className="agent-module-name">{agent.label}</span>
                  {agent.tasksHandled > 0 && (
                    <span className="agent-module-stat">
                      {agent.tasksHandled} task{agent.tasksHandled !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <span className={`agent-module-chevron ${isExpanded ? 'open' : ''}`}>&#9662;</span>
              </button>

              {isExpanded && (
                <div className="agent-module-body">
                  <p className="agent-module-desc">{agent.description}</p>
                  {agent.tasksHandled > 0 && (
                    <div className="agent-module-metrics">
                      <div className="agent-metric">
                        <span className="agent-metric-label">Effectiveness</span>
                        <span className="agent-metric-value">
                          {Math.round(agent.avgConfidence * 100)}%
                        </span>
                      </div>
                      <div className="agent-metric">
                        <span className="agent-metric-label">Tasks</span>
                        <span className="agent-metric-value">{agent.tasksHandled}</span>
                      </div>
                    </div>
                  )}
                  {agent.tasksHandled === 0 && (
                    <p className="agent-module-empty">
                      No activity yet — this agent will activate as you browse.
                    </p>
                  )}
                  {agent.recentInsights.length > 0 && (
                    <div className="agent-module-insights">
                      <span className="agent-insight-heading">Recent insights</span>
                      {agent.recentInsights.slice(0, 3).map((insight, i) => (
                        <div key={i} className="agent-insight-item">
                          <span className="agent-insight-title">{insight.title}</span>
                          <span className="agent-insight-explanation">{insight.explanation}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
