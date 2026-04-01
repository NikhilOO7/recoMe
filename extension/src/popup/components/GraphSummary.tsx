import { useEffect, useState } from 'react';

interface GraphSummaryData {
  entityCount: number;
  relationCount: number;
  memoryCount: number;
  entitiesByType: Record<string, number>;
  relationsByType: Record<string, number>;
  topInterests: Array<{
    id: string;
    name: string;
    type: string;
    weight: number;
    relation: string;
  }>;
  topBlocks: Array<{
    id: string;
    name: string;
    type: string;
    weight: number;
    relation: string;
  }>;
  recentEntities: Array<{
    id: string;
    name: string;
    type: string;
    updated_at: number;
  }>;
}

function send(
  type: string,
  payload: unknown = null,
): Promise<{ success: boolean; data?: unknown }> {
  return chrome.runtime.sendMessage({ type, payload });
}

const ENTITY_TYPE_ICONS: Record<string, string> = {
  topic: 'T',
  creator: 'C',
  brand: 'B',
  product: 'P',
  category: '#',
  content: '*',
  user: 'U',
  sentiment: 'S',
  audience: 'A',
  format: 'F',
  content_type: 'CT',
};

function weightBar(weight: number): string {
  const pct = Math.min(Math.max(weight, 0), 1) * 100;
  return `${pct.toFixed(0)}%`;
}

export function GraphSummary() {
  const [data, setData] = useState<GraphSummaryData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    send('GET_GRAPH_SUMMARY')
      .then((r) => {
        if (r.success && r.data) setData(r.data as GraphSummaryData);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (!data || (data.entityCount === 0 && data.memoryCount === 0)) return null;

  return (
    <div className="graph-summary">
      <h3
        className="section-title graph-summary-header"
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer' }}
      >
        <span>Preference Graph</span>
        <span className="graph-summary-toggle">{expanded ? '\u25B2' : '\u25BC'}</span>
      </h3>

      {/* Always-visible mini stats */}
      <div className="graph-mini-stats">
        <div className="graph-mini-stat">
          <span className="graph-mini-value">{data.entityCount}</span>
          <span className="graph-mini-label">entities</span>
        </div>
        <div className="graph-mini-stat">
          <span className="graph-mini-value">{data.relationCount}</span>
          <span className="graph-mini-label">relations</span>
        </div>
        <div className="graph-mini-stat">
          <span className="graph-mini-value">{data.memoryCount}</span>
          <span className="graph-mini-label">memories</span>
        </div>
      </div>

      {expanded && (
        <div className="graph-expanded">
          {/* Entity type breakdown */}
          {Object.keys(data.entitiesByType).length > 0 && (
            <div className="graph-section">
              <h4 className="graph-section-title">Entity Types</h4>
              <div className="graph-type-grid">
                {Object.entries(data.entitiesByType)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <div key={type} className="graph-type-chip">
                      <span className="graph-type-icon">{ENTITY_TYPE_ICONS[type] ?? '?'}</span>
                      <span className="graph-type-name">{type}</span>
                      <span className="graph-type-count">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Top interests */}
          {data.topInterests.length > 0 && (
            <div className="graph-section">
              <h4 className="graph-section-title">Top Interests</h4>
              <ul className="graph-entity-list">
                {data.topInterests.slice(0, 5).map((item) => (
                  <li key={item.id} className="graph-entity-item">
                    <span className="graph-entity-name">{item.name}</span>
                    <span className="graph-entity-bar-wrap">
                      <span
                        className="graph-entity-bar interest"
                        style={{ width: weightBar(item.weight) }}
                      />
                    </span>
                    <span className="graph-entity-weight">{(item.weight * 100).toFixed(0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Top blocks */}
          {data.topBlocks.length > 0 && (
            <div className="graph-section">
              <h4 className="graph-section-title">Top Blocks</h4>
              <ul className="graph-entity-list">
                {data.topBlocks.slice(0, 5).map((item) => (
                  <li key={item.id} className="graph-entity-item">
                    <span className="graph-entity-name">{item.name}</span>
                    <span className="graph-entity-bar-wrap">
                      <span
                        className="graph-entity-bar block"
                        style={{ width: weightBar(item.weight) }}
                      />
                    </span>
                    <span className="graph-entity-weight">{(item.weight * 100).toFixed(0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recently updated */}
          {data.recentEntities.length > 0 && (
            <div className="graph-section">
              <h4 className="graph-section-title">Recently Learned</h4>
              <div className="graph-recent-list">
                {data.recentEntities.map((e) => (
                  <div key={e.id} className="graph-recent-item">
                    <span className="graph-type-icon small">
                      {ENTITY_TYPE_ICONS[e.type] ?? '?'}
                    </span>
                    <span className="graph-recent-name">{e.name}</span>
                    <span className="graph-recent-time">{timeAgo(e.updated_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
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
