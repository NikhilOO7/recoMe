import { useState, useEffect, useCallback, useRef } from 'react';
import type { DecisionLogEntry } from '@background/decisionLog';
import type { MemoryEntry, GraphEntity, GraphRelation, ContextBucket } from '@shared/types';
import type { SelectorHealthRecord } from '../content/adapters/SelectorHealth';
import { HealthTab } from './tabs/HealthTab';
import { TimelineTab } from './tabs/TimelineTab';
import { ValidatorsTab } from './tabs/ValidatorsTab';
import { SimulatorTab } from './tabs/SimulatorTab';
import { AgentsTab } from './tabs/AgentsTab';
import { FlowsTab } from './tabs/FlowsTab';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab =
  | 'decisions'
  | 'memory'
  | 'graph'
  | 'selectors'
  | 'storage'
  | 'health'
  | 'timeline'
  | 'validators'
  | 'simulator'
  | 'agents'
  | 'flows';

const CONTEXTS: ContextBucket[] = [
  'general',
  'work',
  'shopping',
  'entertainment',
  'learning',
  'social',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 5000) return 'just now';
  if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

function scoreColor(score: number): string {
  if (score <= -0.5) return '#ef5350';
  if (score < 0) return '#ff9800';
  if (score > 0.5) return '#4caf7d';
  if (score > 0) return '#81c784';
  return '#5c6bc0';
}

function scoreBarWidth(score: number): string {
  // –1..+1 mapped to 0..100%
  return `${Math.round(((score + 1) / 2) * 100)}%`;
}

function send<T>(type: string, payload: unknown = null): Promise<T> {
  return chrome.runtime.sendMessage({ type, payload }).then((r: { success: boolean; data?: T }) => {
    if (!r?.success) throw new Error('Request failed');
    return r.data as T;
  });
}

// ── Root App ──────────────────────────────────────────────────────────────────

export function DevToolsApp() {
  const [tab, setTab] = useState<Tab>('decisions');

  return (
    <div className="dt-root">
      <header className="dt-header">
        <span className="dt-title">RecoMe DevTools</span>
        <span className="dt-badge">developer only</span>
      </header>
      <nav className="dt-nav">
        {(['decisions', 'memory', 'graph', 'selectors', 'storage'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`dt-nav-btn ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'decisions' ? 'Decision Log' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <div className="dt-nav-divider" />
        {(['health', 'timeline', 'validators', 'simulator', 'agents', 'flows'] as Tab[]).map(
          (t) => (
            <button
              key={t}
              className={`dt-nav-btn ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ),
        )}
      </nav>
      <div className="dt-body">
        {tab === 'decisions' && <DecisionLogTab />}
        {tab === 'memory' && <MemoryTab />}
        {tab === 'graph' && <GraphTab />}
        {tab === 'selectors' && <SelectorsTab />}
        {tab === 'storage' && <StorageTab />}
        {tab === 'health' && <HealthTab />}
        {tab === 'timeline' && <TimelineTab />}
        {tab === 'validators' && <ValidatorsTab />}
        {tab === 'simulator' && <SimulatorTab />}
        {tab === 'agents' && <AgentsTab />}
        {tab === 'flows' && <FlowsTab />}
      </div>
    </div>
  );
}

// ── Decision Log Tab ──────────────────────────────────────────────────────────

function DecisionLogTab() {
  const [entries, setEntries] = useState<DecisionLogEntry[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'hide' | 'boost' | 'show'>('all');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    send<DecisionLogEntry[]>('GET_DECISION_LOG')
      .then(setEntries)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefresh) {
      timerRef.current = setInterval(load, 2000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, load]);

  const clearLog = () => {
    send('CLEAR_DECISION_LOG')
      .then(load)
      .catch(() => undefined);
  };

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.result.action === filter);

  return (
    <>
      <div className="dt-toolbar">
        <div className={`refresh-dot ${autoRefresh ? '' : 'paused'}`} />
        <button className="dt-btn" onClick={() => setAutoRefresh((v) => !v)}>
          {autoRefresh ? 'Pause' : 'Resume'} auto-refresh
        </button>
        <button className="dt-btn" onClick={load}>
          Refresh now
        </button>
        <button className="dt-btn danger" onClick={clearLog}>
          Clear log
        </button>
        <span style={{ marginLeft: 8, color: 'var(--text2)', fontSize: 11 }}>Filter:</span>
        {(['all', 'hide', 'boost', 'show'] as const).map((f) => (
          <button
            key={f}
            className="dt-btn"
            style={
              filter === f
                ? { background: 'var(--accent)', borderColor: 'var(--accent)' }
                : undefined
            }
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
        <span className="dt-info">{filtered.length} entries</span>
      </div>
      <div className="dt-scroll">
        {filtered.length === 0 ? (
          <div className="dt-empty">
            <span className="dt-empty-icon">📭</span>
            <span>No decisions yet — browse a supported site to see data here</span>
          </div>
        ) : (
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ width: 70 }}>Time</th>
                <th style={{ width: 80 }}>Platform</th>
                <th style={{ width: 70 }}>Action</th>
                <th>Title</th>
                <th style={{ width: 130 }}>Score</th>
                <th style={{ width: 180 }}>Explanation</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <>
                  <tr
                    key={entry.id}
                    className={`expandable ${expandedId === entry.id ? 'expanded' : ''}`}
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  >
                    <td style={{ color: 'var(--text2)' }}>{relativeTime(entry.timestamp)}</td>
                    <td>
                      <span className={`platform-badge platform-${entry.content.platform}`}>
                        {entry.content.platform}
                      </span>
                    </td>
                    <td className={`action-${entry.result.action}`}>{entry.result.action}</td>
                    <td style={{ maxWidth: 260 }} title={entry.content.title}>
                      {entry.content.title}
                    </td>
                    <td>
                      <div className="score-bar-wrap">
                        <div className="score-bar">
                          <div
                            className="score-bar-fill"
                            style={{
                              width: scoreBarWidth(entry.result.score),
                              background: scoreColor(entry.result.score),
                            }}
                          />
                        </div>
                        <span
                          className="score-val"
                          style={{ color: scoreColor(entry.result.score) }}
                        >
                          {entry.result.score.toFixed(3)}
                        </span>
                      </div>
                    </td>
                    <td
                      style={{ color: 'var(--text1)', fontSize: 11 }}
                      title={entry.result.explanation}
                    >
                      {entry.result.explanation}
                    </td>
                  </tr>
                  {expandedId === entry.id && (
                    <tr key={`${entry.id}-expand`} className="dt-expand-row">
                      <td colSpan={6}>
                        <ExpandedDecision entry={entry} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function ExpandedDecision({ entry }: { entry: DecisionLogEntry }) {
  return (
    <div className="dt-expand-grid">
      <div className="dt-expand-section">
        <h4>Scoring Factors</h4>
        {entry.result.factors.map((f) => (
          <div key={f.name} className="factor-row">
            <span className="factor-name">{f.name}</span>
            <div className="factor-bar-wrap">
              <div className="factor-bar">
                <div
                  className="factor-bar-fill"
                  style={{
                    width: scoreBarWidth(f.score),
                    background: scoreColor(f.score),
                  }}
                />
              </div>
              <span className="factor-score" style={{ color: scoreColor(f.score) }}>
                {(f.score * f.weight).toFixed(3)}
              </span>
            </div>
            <div className="factor-expl">{f.explanation}</div>
          </div>
        ))}
      </div>
      <div className="dt-expand-section">
        <h4>Content Metadata</h4>
        <div style={{ marginBottom: 8, color: 'var(--text1)', fontSize: 11 }}>
          <div>
            <span style={{ color: 'var(--text2)' }}>id:</span> {entry.content.id}
          </div>
          <div>
            <span style={{ color: 'var(--text2)' }}>type:</span> {entry.content.type}
          </div>
          {entry.content.creator && (
            <div>
              <span style={{ color: 'var(--text2)' }}>creator:</span> {entry.content.creator}
            </div>
          )}
          <div>
            <span style={{ color: 'var(--text2)' }}>confidence:</span>{' '}
            {entry.result.confidence.toFixed(3)}
          </div>
          {entry.content.url && (
            <div style={{ marginTop: 4 }}>
              <a
                href={entry.content.url}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 10 }}
              >
                open page ↗
              </a>
            </div>
          )}
        </div>
        {entry.content.topics.length > 0 && (
          <>
            <h4 style={{ marginTop: 8 }}>Topics</h4>
            <div className="tag-list">
              {entry.content.topics.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
          </>
        )}
        {entry.content.entities.length > 0 && (
          <>
            <h4 style={{ marginTop: 8 }}>Entities</h4>
            <div className="tag-list">
              {entry.content.entities.map((e) => (
                <span key={e} className="tag">
                  {e}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Memory Tab ────────────────────────────────────────────────────────────────

function MemoryTab() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [context, setContext] = useState<ContextBucket>('general');
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    send<{ entries: MemoryEntry[]; general_overlay: { entries: MemoryEntry[] } }>(
      'GET_MEMORY_PACK',
      { context_bucket: context },
    )
      .then((pack) => {
        const all = [
          ...pack.entries.map((e) => ({ ...e, _source: 'context' })),
          ...pack.general_overlay.entries.map((e) => ({ ...e, _source: 'general' })),
        ];
        setEntries(all as MemoryEntry[]);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [context]);

  useEffect(() => {
    load();
  }, [load]);

  const active = entries.filter((e) => !e.is_deleted && e.status !== 'deleted');
  const blocked = active.filter((e) => e.topic_key.startsWith('blocked:'));
  const interested = active.filter((e) => e.topic_key.startsWith('interested:'));
  const other = active.filter(
    (e) => !e.topic_key.startsWith('blocked:') && !e.topic_key.startsWith('interested:'),
  );

  return (
    <>
      <div className="dt-toolbar">
        <span style={{ color: 'var(--text2)', fontSize: 11 }}>Context:</span>
        {CONTEXTS.map((c) => (
          <button
            key={c}
            className="dt-btn"
            style={
              context === c
                ? { background: 'var(--accent)', borderColor: 'var(--accent)' }
                : undefined
            }
            onClick={() => setContext(c)}
          >
            {c}
          </button>
        ))}
        <button className="dt-btn" onClick={load}>
          Refresh
        </button>
        <span className="dt-info">
          {active.length} active · {entries.length} total
        </span>
        {loading && <span className="dt-info">loading…</span>}
      </div>
      <div className="dt-scroll">
        {entries.length === 0 ? (
          <div className="dt-empty">
            <span className="dt-empty-icon">🧠</span>
            <span>No memory entries in this context yet</span>
          </div>
        ) : (
          <table className="dt-table">
            <thead>
              <tr>
                <th>Topic Key</th>
                <th style={{ width: 80 }}>Type</th>
                <th style={{ width: 70 }}>Status</th>
                <th style={{ width: 80 }}>Sentiment</th>
                <th style={{ width: 60 }}>Strength</th>
                <th style={{ width: 80 }}>Context</th>
                <th style={{ width: 100 }}>Created</th>
                <th style={{ width: 60 }}>Access</th>
              </tr>
            </thead>
            <tbody>
              {[...blocked, ...interested, ...other].map((e) => (
                <tr key={e.entry_id}>
                  <td
                    style={{
                      color: e.topic_key.startsWith('blocked:')
                        ? 'var(--red)'
                        : e.topic_key.startsWith('interested:')
                          ? 'var(--green)'
                          : 'var(--text0)',
                    }}
                  >
                    {e.topic_key}
                  </td>
                  <td>
                    <span className="mem-type-badge">{e.memory_type}</span>
                  </td>
                  <td className={`status-${e.status}`}>{e.status}</td>
                  <td className={`sentiment-${e.value.sentiment ?? 'neutral'}`}>
                    {e.value.sentiment ?? '—'}
                  </td>
                  <td style={{ color: 'var(--text1)' }}>{e.value.strength?.toFixed(2) ?? '—'}</td>
                  <td style={{ color: 'var(--text2)' }}>{e.context_bucket}</td>
                  <td style={{ color: 'var(--text2)' }}>
                    {new Date(e.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ color: 'var(--text2)' }}>{e.access_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ── Graph Tab ─────────────────────────────────────────────────────────────────

const ENTITY_TYPE_COLORS: Record<string, string> = {
  topic: '#6366f1',
  creator: '#ec4899',
  brand: '#f59e0b',
  product: '#06b6d4',
  category: '#10b981',
  content_type: '#8b5cf6',
  sentiment: '#ef4444',
  audience: '#84cc16',
  format: '#0ea5e9',
  user: '#f97316',
  content: '#94a3b8',
};

function typeColor(type: string): string {
  return ENTITY_TYPE_COLORS[type] ?? '#64748b';
}

function GraphTab() {
  const [entities, setEntities] = useState<GraphEntity[]>([]);
  const [relations, setRelations] = useState<GraphRelation[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [visual, setVisual] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    send<{ entities: GraphEntity[]; relations: GraphRelation[] }>('GET_GRAPH_DATA')
      .then((d) => {
        setEntities(d.entities);
        setRelations(d.relations ?? []);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = search
    ? entities.filter(
        (e) =>
          e.name.toLowerCase().includes(search.toLowerCase()) ||
          e.type.toLowerCase().includes(search.toLowerCase()),
      )
    : entities;

  return (
    <>
      <div className="dt-toolbar">
        <input
          type="text"
          value={search}
          onChange={(ev) => setSearch(ev.target.value)}
          placeholder="Search entities…"
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '4px 8px',
            color: 'var(--text0)',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            width: 200,
          }}
        />
        <button className="dt-btn" onClick={load}>
          Refresh
        </button>
        <button
          className="dt-btn"
          style={visual ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
          onClick={() => setVisual((v) => !v)}
        >
          {visual ? 'Table view' : 'Visual view'}
        </button>
        <span className="dt-info">
          {filtered.length} / {entities.length} entities
        </span>
        {loading && <span className="dt-info">loading…</span>}
      </div>
      <div className="dt-scroll">
        {entities.length === 0 ? (
          <div className="dt-empty">
            <span className="dt-empty-icon">🕸</span>
            <span>No graph entities yet</span>
          </div>
        ) : visual ? (
          <GraphVisual entities={filtered} relations={relations} allEntities={entities} />
        ) : (
          <table className="dt-table">
            <thead>
              <tr>
                <th>Name</th>
                <th style={{ width: 100 }}>Type</th>
                <th>Aliases</th>
                <th style={{ width: 120 }}>Created</th>
                <th style={{ width: 120 }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td style={{ color: 'var(--text0)' }}>{e.name}</td>
                  <td>
                    <span className="entity-type-badge">{e.type}</span>
                  </td>
                  <td style={{ color: 'var(--text2)', fontSize: 10 }}>
                    {e.aliases.join(', ') || '—'}
                  </td>
                  <td style={{ color: 'var(--text2)' }}>
                    {new Date(e.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ color: 'var(--text2)' }}>
                    {new Date(e.updated_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function GraphVisual({
  entities,
  relations,
  allEntities,
}: {
  entities: GraphEntity[];
  relations: GraphRelation[];
  allEntities: GraphEntity[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Group entities by type
  const byType = entities.reduce<Record<string, GraphEntity[]>>((acc, e) => {
    (acc[e.type] ??= []).push(e);
    return acc;
  }, {});

  const types = Object.keys(byType).sort((a, b) => byType[b]!.length - byType[a]!.length);

  // Build entity lookup for resolving relation targets
  const entityMap = new Map(allEntities.map((e) => [e.id, e]));

  // Get relations for selected entity
  const selectedRelations = selectedId
    ? relations.filter(
        (r) => r.source_id === selectedId || (r.bidirectional && r.target_id === selectedId),
      )
    : [];

  const selectedEntity = selectedId ? entityMap.get(selectedId) : null;

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Type distribution bar */}
      <div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--text2)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 8,
          }}
        >
          Entity distribution — {entities.length} entities · {relations.length} relations
        </div>
        <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 1 }}>
          {types.map((type) => (
            <div
              key={type}
              title={`${type}: ${byType[type]!.length}`}
              style={{
                background: typeColor(type),
                flex: byType[type]!.length,
                opacity: 0.85,
                transition: 'flex 300ms ease',
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 8 }}>
          {types.map((type) => (
            <span
              key={type}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 10,
                color: 'var(--text1)',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: typeColor(type),
                  display: 'inline-block',
                }}
              />
              {type} <span style={{ color: 'var(--text2)' }}>({byType[type]!.length})</span>
            </span>
          ))}
        </div>
      </div>

      {/* Selected entity detail panel with radial neighbor view */}
      {selectedEntity && (
        <div
          style={{
            background: 'var(--bg2)',
            border: `1px solid ${typeColor(selectedEntity.type)}66`,
            borderRadius: 8,
            padding: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: typeColor(selectedEntity.type),
                  display: 'inline-block',
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text0)' }}>
                {selectedEntity.name}
              </span>
              <span className="entity-type-badge">{selectedEntity.type}</span>
            </div>
            <button
              className="dt-btn"
              style={{ fontSize: 10, padding: '2px 8px' }}
              onClick={() => setSelectedId(null)}
            >
              ✕ Close
            </button>
          </div>
          {selectedEntity.aliases.length > 0 && (
            <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 8 }}>
              Aliases: {selectedEntity.aliases.join(', ')}
            </div>
          )}

          {/* Radial neighbor visualization */}
          {selectedRelations.length > 0 && (
            <div style={{ position: 'relative', width: '100%', height: 200, marginBottom: 12 }}>
              {/* Center node */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: typeColor(selectedEntity.type),
                  color: '#fff',
                  borderRadius: 20,
                  padding: '4px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  zIndex: 2,
                  whiteSpace: 'nowrap',
                  maxWidth: 140,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {selectedEntity.name}
              </div>

              {/* Neighbor nodes arranged in a circle */}
              {selectedRelations.slice(0, 12).map((r, i) => {
                const targetId = r.source_id === selectedId ? r.target_id : r.source_id;
                const target = entityMap.get(targetId);
                const angle =
                  (i / Math.min(selectedRelations.length, 12)) * 2 * Math.PI - Math.PI / 2;
                const radius = 80;
                const x = 50 + (radius / 200) * 100 * Math.cos(angle);
                const y = 50 + (radius / 200) * 100 * Math.sin(angle);
                const tColor = target ? typeColor(target.type) : '#64748b';

                return (
                  <div key={r.id}>
                    {/* Edge line using SVG */}
                    <svg
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: 'none',
                        zIndex: 0,
                      }}
                    >
                      <line
                        x1="50%"
                        y1="50%"
                        x2={`${x}%`}
                        y2={`${y}%`}
                        stroke={tColor}
                        strokeWidth={Math.max(1, r.weight * 3)}
                        strokeOpacity={0.35}
                      />
                    </svg>
                    {/* Neighbor node */}
                    <div
                      style={{
                        position: 'absolute',
                        left: `${x}%`,
                        top: `${y}%`,
                        transform: 'translate(-50%, -50%)',
                        background: `${tColor}30`,
                        border: `1px solid ${tColor}`,
                        borderRadius: 16,
                        padding: '2px 8px',
                        fontSize: 9,
                        color: 'var(--text0)',
                        cursor: target ? 'pointer' : 'default',
                        zIndex: 1,
                        whiteSpace: 'nowrap',
                        maxWidth: 100,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={`${r.type}: ${target?.name ?? targetId} (w: ${r.weight.toFixed(2)})`}
                      onClick={() => target && setSelectedId(targetId)}
                    >
                      {target?.name ?? targetId.slice(0, 12)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selectedRelations.length > 0 ? (
            <div>
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--text2)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 6,
                }}
              >
                Relations ({selectedRelations.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {selectedRelations.map((r) => {
                  const targetId = r.source_id === selectedId ? r.target_id : r.source_id;
                  const target = entityMap.get(targetId);
                  return (
                    <div
                      key={r.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 11,
                        padding: '4px 8px',
                        background: 'var(--bg1)',
                        borderRadius: 4,
                        cursor: target ? 'pointer' : 'default',
                      }}
                      onClick={() => target && setSelectedId(targetId)}
                    >
                      <span
                        style={{
                          fontSize: 9,
                          padding: '1px 6px',
                          borderRadius: 3,
                          background: 'var(--border)',
                          color: 'var(--text1)',
                          fontFamily: 'var(--mono)',
                        }}
                      >
                        {r.type}
                      </span>
                      <span style={{ color: 'var(--text0)' }}>{target?.name ?? targetId}</span>
                      {target && (
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 2,
                            background: typeColor(target.type),
                            display: 'inline-block',
                          }}
                        />
                      )}
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: 10,
                          color:
                            r.weight >= 0.8
                              ? 'var(--green)'
                              : r.weight >= 0.5
                                ? 'var(--text1)'
                                : 'var(--text2)',
                          fontFamily: 'var(--mono)',
                        }}
                      >
                        {r.weight.toFixed(2)}
                      </span>
                      {r.bidirectional && (
                        <span style={{ fontSize: 9, color: 'var(--text2)' }}>↔</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>No relations found</div>
          )}
        </div>
      )}

      {/* Entity clusters by type */}
      {types.map((type) => (
        <div key={type}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: typeColor(type),
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: typeColor(type),
                display: 'inline-block',
              }}
            />
            {type}
            <span style={{ fontWeight: 400, color: 'var(--text2)' }}>· {byType[type]!.length}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {byType[type]!.map((e) => {
              const isSelected = e.id === selectedId;
              const relCount = relations.filter(
                (r) => r.source_id === e.id || (r.bidirectional && r.target_id === e.id),
              ).length;
              return (
                <div
                  key={e.id}
                  title={`${e.name}${e.aliases.length ? ` (aliases: ${e.aliases.join(', ')})` : ''}${relCount ? ` — ${relCount} relations` : ''}`}
                  style={{
                    background: isSelected ? `${typeColor(type)}40` : `${typeColor(type)}18`,
                    border: `1px solid ${isSelected ? typeColor(type) : `${typeColor(type)}44`}`,
                    borderRadius: 20,
                    padding: '3px 10px',
                    fontSize: 11,
                    color: 'var(--text0)',
                    cursor: 'pointer',
                    transition: 'all 120ms',
                    boxShadow: isSelected ? `0 0 8px ${typeColor(type)}44` : 'none',
                  }}
                  onClick={() => setSelectedId(isSelected ? null : e.id)}
                  onMouseEnter={(ev) => {
                    if (!isSelected)
                      (ev.target as HTMLElement).style.background = `${typeColor(type)}30`;
                  }}
                  onMouseLeave={(ev) => {
                    if (!isSelected)
                      (ev.target as HTMLElement).style.background = `${typeColor(type)}18`;
                  }}
                >
                  {e.name}
                  {relCount > 0 && (
                    <span
                      style={{
                        color: typeColor(type),
                        fontSize: 9,
                        marginLeft: 4,
                        fontWeight: 600,
                      }}
                    >
                      {relCount}
                    </span>
                  )}
                  {e.aliases.length > 0 && (
                    <span style={{ color: 'var(--text2)', fontSize: 9, marginLeft: 4 }}>
                      +{e.aliases.length}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Selectors Tab ─────────────────────────────────────────────────────────

function healthColor(score: number): string {
  if (score >= 0.7) return '#4caf7d';
  if (score >= 0.3) return '#ff9800';
  return '#ef5350';
}

function SelectorsTab() {
  const [entries, setEntries] = useState<Record<string, SelectorHealthRecord>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    send<Record<string, SelectorHealthRecord>>('GET_SELECTOR_HEALTH')
      .then(setEntries)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const keys = Object.keys(entries).sort();

  return (
    <>
      <div className="dt-toolbar">
        <button className="dt-btn" onClick={load}>
          Refresh
        </button>
        <span className="dt-info">{keys.length} cached selectors</span>
        {loading && <span className="dt-info">loading…</span>}
      </div>
      <div className="dt-scroll">
        {keys.length === 0 ? (
          <div className="dt-empty">
            <span className="dt-empty-icon">🎯</span>
            <span>No cached selectors yet — browse a site to trigger discovery</span>
          </div>
        ) : (
          <table className="dt-table">
            <thead>
              <tr>
                <th>Domain</th>
                <th style={{ width: 90 }}>Path</th>
                <th>Card Selector</th>
                <th style={{ width: 110 }}>Health</th>
                <th style={{ width: 70 }}>Matches</th>
                <th style={{ width: 60 }}>Fails</th>
                <th style={{ width: 100 }}>Discovered</th>
                <th style={{ width: 90 }}>Last Check</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => {
                const record = entries[key]!;
                const [domain, ...pathParts] = key.split(':');
                const path = pathParts.join(':') || 'home';
                const lastMatch =
                  record.matchHistory.length > 0
                    ? record.matchHistory[record.matchHistory.length - 1]!.count
                    : 0;
                return (
                  <tr key={key}>
                    <td style={{ color: 'var(--text0)' }}>{domain}</td>
                    <td>
                      <span
                        style={{
                          fontSize: 10,
                          padding: '1px 6px',
                          borderRadius: 3,
                          background: 'var(--border)',
                          color: 'var(--text1)',
                          fontFamily: 'var(--mono)',
                        }}
                      >
                        {path}
                      </span>
                    </td>
                    <td
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 10,
                        color: 'var(--text1)',
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={record.cardSelector}
                    >
                      {record.cardSelector}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div
                          style={{
                            flex: 1,
                            height: 6,
                            borderRadius: 3,
                            background: 'var(--bg2)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.round(record.healthScore * 100)}%`,
                              height: '100%',
                              borderRadius: 3,
                              background: healthColor(record.healthScore),
                              transition: 'width 300ms',
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: 'var(--mono)',
                            color: healthColor(record.healthScore),
                            minWidth: 30,
                          }}
                        >
                          {(record.healthScore * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td
                      style={{
                        fontFamily: 'var(--mono)',
                        color: 'var(--text1)',
                        textAlign: 'center',
                      }}
                    >
                      {lastMatch}
                    </td>
                    <td
                      style={{
                        fontFamily: 'var(--mono)',
                        textAlign: 'center',
                        color: record.consecutiveFailures > 0 ? '#ef5350' : 'var(--text2)',
                      }}
                    >
                      {record.consecutiveFailures}
                    </td>
                    <td style={{ color: 'var(--text2)', fontSize: 11 }}>
                      {new Date(record.discoveredAt).toLocaleDateString()}
                    </td>
                    <td style={{ color: 'var(--text2)', fontSize: 11 }}>
                      {relativeTime(record.lastChecked)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ── Storage Tab ───────────────────────────────────────────────────────────────

interface DbStats {
  indexeddb: Record<string, number>;
  blocked: string[];
  active_entries: MemoryEntry[];
}

function StorageTab() {
  const [storageData, setStorageData] = useState<{
    local: Record<string, unknown>;
    sync: Record<string, unknown>;
  } | null>(null);
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'idb' | 'local' | 'sync'>('idb');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      send<{ local: Record<string, unknown>; sync: Record<string, unknown> }>('GET_RAW_STORAGE'),
      send<DbStats>('GET_DB_STATS'),
    ])
      .then(([s, d]) => {
        setStorageData(s);
        setDbStats(d);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="dt-toolbar">
        {(['idb', 'local', 'sync'] as const).map((v) => (
          <button
            key={v}
            className="dt-btn"
            style={
              view === v ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : undefined
            }
            onClick={() => setView(v)}
          >
            {v === 'idb' ? 'IndexedDB' : `chrome.storage.${v}`}
          </button>
        ))}
        <button className="dt-btn" onClick={load}>
          Refresh
        </button>
        {loading && <span className="dt-info">loading…</span>}
      </div>
      <div className="dt-scroll">
        {view === 'idb' && <IdbView stats={dbStats} />}
        {view === 'local' && (
          <JsonView data={storageData?.local ?? null} label="chrome.storage.local" />
        )}
        {view === 'sync' && (
          <JsonView data={storageData?.sync ?? null} label="chrome.storage.sync" />
        )}
      </div>
    </>
  );
}

function IdbView({ stats }: { stats: DbStats | null }) {
  if (!stats)
    return (
      <div className="dt-empty">
        <span className="dt-empty-icon">💾</span>
        <span>Loading…</span>
      </div>
    );

  return (
    <div style={{ padding: 16 }}>
      {/* Row counts */}
      <h4
        style={{
          color: 'var(--text2)',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 10,
        }}
      >
        IndexedDB Table Counts
      </h4>
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 20 }}
      >
        {Object.entries(stats.indexeddb).map(([table, count]) => (
          <div
            key={table}
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '10px 12px',
            }}
          >
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: count > 0 ? 'var(--accent)' : 'var(--text2)',
              }}
            >
              {count}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>
              {table.replace(/_/g, ' ')}
            </div>
          </div>
        ))}
      </div>

      {/* Blocked topics */}
      <h4
        style={{
          color: 'var(--text2)',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 8,
        }}
      >
        Active Blocks ({stats.blocked.length})
      </h4>
      {stats.blocked.length === 0 ? (
        <div
          style={{
            color: 'var(--text2)',
            fontSize: 11,
            marginBottom: 20,
            padding: '8px 12px',
            background: 'var(--bg2)',
            borderRadius: 4,
            border: '1px solid var(--border)',
          }}
        >
          No topics blocked yet — use Quick Block in the popup to block a topic (e.g. "fire tv")
        </div>
      ) : (
        <div className="tag-list" style={{ marginBottom: 20 }}>
          {stats.blocked.map((k) => (
            <span
              key={k}
              className="tag"
              style={{ color: 'var(--red)', borderColor: 'rgba(239,83,80,0.3)' }}
            >
              {k}
            </span>
          ))}
        </div>
      )}

      {/* All active memory entries */}
      <h4
        style={{
          color: 'var(--text2)',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 8,
        }}
      >
        All Active Memory Entries ({stats.active_entries.length})
      </h4>
      {stats.active_entries.length === 0 ? (
        <div
          style={{
            color: 'var(--text2)',
            fontSize: 11,
            padding: '8px 12px',
            background: 'var(--bg2)',
            borderRadius: 4,
            border: '1px solid var(--border)',
          }}
        >
          No entries yet — interact with content (👍/👎/🚫 buttons on posts) to build memory
        </div>
      ) : (
        <table className="dt-table" style={{ marginTop: 0 }}>
          <thead>
            <tr>
              <th>Topic Key</th>
              <th style={{ width: 80 }}>Type</th>
              <th style={{ width: 70 }}>Status</th>
              <th style={{ width: 80 }}>Context</th>
              <th style={{ width: 70 }}>Strength</th>
            </tr>
          </thead>
          <tbody>
            {stats.active_entries.map((e) => (
              <tr key={e.entry_id}>
                <td
                  style={{
                    color: e.topic_key.startsWith('blocked:')
                      ? 'var(--red)'
                      : e.topic_key.startsWith('interested:')
                        ? 'var(--green)'
                        : 'var(--text0)',
                  }}
                >
                  {e.topic_key}
                </td>
                <td>
                  <span className="mem-type-badge">{e.memory_type}</span>
                </td>
                <td className={`status-${e.status}`}>{e.status}</td>
                <td style={{ color: 'var(--text2)' }}>{e.context_bucket}</td>
                <td style={{ color: 'var(--text1)' }}>{e.value.strength?.toFixed(2) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function JsonView({ data, label }: { data: Record<string, unknown> | null; label: string }) {
  if (!data)
    return (
      <div className="dt-empty">
        <span className="dt-empty-icon">💾</span>
        <span>No data in {label}</span>
      </div>
    );
  const keys = Object.keys(data);
  return (
    <>
      <div
        style={{
          padding: '8px 16px',
          color: 'var(--text2)',
          fontSize: 11,
          borderBottom: '1px solid var(--border)',
        }}
      >
        {keys.length} keys in {label}
        {keys.length === 0 && (
          <span style={{ marginLeft: 8, color: 'var(--text2)' }}>
            — note: memory/graph data lives in IndexedDB, not here
          </span>
        )}
      </div>
      <div className="json-view">{JSON.stringify(data, null, 2)}</div>
    </>
  );
}
