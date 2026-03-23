import { useState, useEffect, useCallback, useRef } from 'react';
import { PipelineTraceView } from '../components/PipelineTraceView';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MonitorEvent {
  id: string;
  timestamp: number;
  type: string;
  source: string;
  category: string;
  summary: string;
  details: Record<string, unknown>;
  traceId?: string;
}

interface PipelineTrace {
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

interface TimelineFilters {
  category?: string;
  type?: string;
  since?: number;
  traceId?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function send<T>(type: string, payload: unknown = null): Promise<T> {
  return chrome.runtime.sendMessage({ type, payload }).then((r: { success: boolean; data?: T }) => {
    if (!r?.success) throw new Error('Request failed');
    return r.data as T;
  });
}

const CATEGORIES = [
  'pipeline',
  'learning',
  'intelligence',
  'commerce',
  'prompt',
  'overlay',
  'sync',
  'system',
] as const;

type Category = (typeof CATEGORIES)[number];

const CATEGORY_STYLES: Record<Category, string> = {
  pipeline: 'var(--accent)',
  learning: 'var(--green)',
  intelligence: '#bb86fc',
  commerce: '#80deea',
  prompt: 'var(--orange)',
  overlay: 'var(--yellow)',
  sync: '#64b5f6',
  system: 'var(--text2)',
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TimelineTab() {
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [activeCategories, setActiveCategories] = useState<Set<Category>>(
    () => new Set(CATEGORIES),
  );
  const [typeSearch, setTypeSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedTrace, setSelectedTrace] = useState<PipelineTrace | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch events ──────────────────────────────────────────────────────────

  const fetchEvents = useCallback(() => {
    const filters: TimelineFilters | null = null;
    send<MonitorEvent[]>('GET_MONITOR_TIMELINE', filters)
      .then((data) => setEvents(data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchEvents, 3000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchEvents]);

  // ── Trace detail ──────────────────────────────────────────────────────────

  const openTrace = useCallback((traceId: string) => {
    send<PipelineTrace>('GET_MONITOR_TRACE', { traceId })
      .then((trace) => {
        if (trace) setSelectedTrace(trace);
      })
      .catch(() => {});
  }, []);

  // ── Filter logic ──────────────────────────────────────────────────────────

  const toggleCategory = (cat: Category) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const filtered = events
    .filter((e) => activeCategories.has(e.category as Category))
    .filter((e) => !typeSearch || e.type.toLowerCase().includes(typeSearch.toLowerCase()))
    .sort((a, b) => b.timestamp - a.timestamp);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recome-timeline-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    send('MONITOR_CLEAR')
      .then(() => setEvents([]))
      .catch(() => {});
  };

  // ── Trace detail view ─────────────────────────────────────────────────────

  if (selectedTrace) {
    return (
      <div className="dt-timeline-trace-wrap">
        <PipelineTraceView trace={selectedTrace} onClose={() => setSelectedTrace(null)} />
      </div>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────

  return (
    <div className="dt-timeline-root">
      {/* Filter bar */}
      <div className="dt-toolbar">
        <div className="dt-timeline-categories">
          {CATEGORIES.map((cat) => (
            <label key={cat} className="dt-timeline-cat-label">
              <input
                type="checkbox"
                checked={activeCategories.has(cat)}
                onChange={() => toggleCategory(cat)}
              />
              <span
                className="dt-timeline-cat-badge"
                style={{
                  borderColor: CATEGORY_STYLES[cat],
                  color: CATEGORY_STYLES[cat],
                  opacity: activeCategories.has(cat) ? 1 : 0.35,
                }}
              >
                {cat}
              </span>
            </label>
          ))}
        </div>

        <input
          className="dt-timeline-search"
          type="text"
          placeholder="Filter type..."
          value={typeSearch}
          onChange={(e) => setTypeSearch(e.target.value)}
        />

        <button
          className="dt-timeline-refresh-toggle"
          onClick={() => setAutoRefresh((v) => !v)}
          title={autoRefresh ? 'Pause auto-refresh' : 'Resume auto-refresh'}
        >
          <span className={`refresh-dot${autoRefresh ? '' : ' paused'}`} />
        </button>

        <span className="dt-info">{filtered.length} events</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="dt-btn" onClick={handleExport}>
            Export JSON
          </button>
          <button className="dt-btn danger" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      {/* Event list */}
      <div className="dt-scroll">
        {filtered.length === 0 ? (
          <div className="dt-empty">
            <div className="dt-empty-icon">~</div>
            <div>No timeline events yet</div>
          </div>
        ) : (
          <table className="dt-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Category</th>
                <th>Type</th>
                <th>Source</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((evt) => (
                <tr
                  key={evt.id}
                  className={evt.traceId ? 'expandable' : ''}
                  onClick={() => evt.traceId && openTrace(evt.traceId)}
                  title={evt.traceId ? `Trace: ${evt.traceId}` : undefined}
                >
                  <td className="dt-timeline-ts">{formatTimestamp(evt.timestamp)}</td>
                  <td>
                    <span
                      className="dt-timeline-cat-badge"
                      style={{
                        borderColor: CATEGORY_STYLES[evt.category as Category] ?? 'var(--text2)',
                        color: CATEGORY_STYLES[evt.category as Category] ?? 'var(--text2)',
                      }}
                    >
                      {evt.category}
                    </span>
                  </td>
                  <td>
                    <span className="dt-timeline-type-badge">{evt.type}</span>
                  </td>
                  <td>
                    <span className="dt-timeline-source-badge">{evt.source}</span>
                  </td>
                  <td className="dt-timeline-summary">
                    {evt.summary}
                    {evt.traceId && <span className="dt-timeline-trace-link"> [trace]</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
