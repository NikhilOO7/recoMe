import { useEffect, useState } from 'react';

interface ActionEntry {
  id: string;
  timestamp: number;
  action: string;
  score: number;
  title: string;
  platform: string;
  type: string;
  creator?: string;
  reasons: string[];
  factors: Array<{ name: string; score: number; weight: number; explanation: string }>;
}

function send(
  type: string,
  payload: unknown = null,
): Promise<{ success: boolean; data?: unknown }> {
  return chrome.runtime.sendMessage({ type, payload });
}

const ACTION_STYLES: Record<string, { icon: string; color: string }> = {
  hide: { icon: '\u2716', color: 'var(--accent6, #dc2626)' },
  boost: { icon: '\u2605', color: 'var(--accent4, #059669)' },
  show: { icon: '\u2713', color: 'var(--text-muted, #94a3b8)' },
  ignore: { icon: '\u2014', color: 'var(--text-muted, #94a3b8)' },
};

const PLATFORM_ICONS: Record<string, string> = {
  youtube: '\u25B6',
  amazon: '\uD83D\uDCE6',
  twitter: 'X',
  facebook: 'F',
  instagram: '\uD83D\uDCF8',
  ebay: '\uD83D\uDED2',
  walmart: 'W',
  linkedin: 'in',
};

export function ActionHistory() {
  const [actions, setActions] = useState<ActionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    send('GET_ACTION_HISTORY', { limit: 30 })
      .then((r) => {
        if (r.success && r.data) setActions(r.data as ActionEntry[]);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (actions.length === 0) {
    return (
      <div className="action-history">
        <h3 className="section-title">Recent Actions</h3>
        <p className="action-empty">
          No decisions yet. Browse a supported site to see RecoMe in action.
        </p>
      </div>
    );
  }

  return (
    <div className="action-history">
      <h3 className="section-title">
        Recent Actions
        <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 6 }}>
          ({actions.length})
        </span>
      </h3>
      <div className="action-timeline">
        {actions.slice(0, 20).map((entry) => {
          const style = ACTION_STYLES[entry.action] ?? {
            icon: '\u2014',
            color: 'var(--text-muted, #94a3b8)',
          };
          const isExpanded = expandedId === entry.id;
          return (
            <div
              key={entry.id}
              className={`action-item ${isExpanded ? 'expanded' : ''}`}
              onClick={() => setExpandedId(isExpanded ? null : entry.id)}
            >
              <div className="action-item-header">
                <span className="action-icon" style={{ color: style.color }}>
                  {style.icon}
                </span>
                <span className="action-platform">{PLATFORM_ICONS[entry.platform] ?? '?'}</span>
                <span className="action-title" title={entry.title}>
                  {entry.title.length > 40 ? entry.title.slice(0, 40) + '\u2026' : entry.title}
                </span>
                <span className="action-time">{timeAgo(entry.timestamp)}</span>
              </div>

              {isExpanded && (
                <div className="action-details">
                  <div className="action-detail-row">
                    <span className="action-detail-label">Action:</span>
                    <span className="action-detail-value" style={{ color: style.color }}>
                      {entry.action}
                    </span>
                  </div>
                  <div className="action-detail-row">
                    <span className="action-detail-label">Score:</span>
                    <span className="action-detail-value">
                      {(entry.score * 100).toFixed(0)}/100
                    </span>
                  </div>
                  {entry.creator && (
                    <div className="action-detail-row">
                      <span className="action-detail-label">Creator:</span>
                      <span className="action-detail-value">{entry.creator}</span>
                    </div>
                  )}
                  {entry.factors.length > 0 && (
                    <div className="action-factors">
                      <span className="action-detail-label">Why:</span>
                      <ul className="action-factor-list">
                        {entry.factors.map((f, i) => (
                          <li key={i} className="action-factor-item">
                            <span className="action-factor-name">{f.name}</span>
                            <span
                              className="action-factor-score"
                              style={{
                                color:
                                  f.score > 0
                                    ? 'var(--accent4)'
                                    : f.score < 0
                                      ? 'var(--accent6)'
                                      : 'var(--text-muted)',
                              }}
                            >
                              {f.score > 0 ? '+' : ''}
                              {(f.score * 100).toFixed(0)}
                            </span>
                          </li>
                        ))}
                      </ul>
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

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
