import { useState, useCallback, useRef, useEffect } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ValidatorResult {
  name: string;
  category: string;
  status: 'pass' | 'warn' | 'fail';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  details?: Record<string, unknown>;
  suggestion?: string;
}

interface HistoryEntry {
  timestamp: number;
  pass: number;
  warn: number;
  fail: number;
}

const CATEGORIES = ['Pipeline', 'Learning', 'Overlay', 'Agents', 'Commerce', 'System'] as const;

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function send<T>(type: string, payload: unknown = null): Promise<T> {
  return chrome.runtime.sendMessage({ type, payload }).then((r: { success: boolean; data?: T }) => {
    if (!r?.success) throw new Error('Request failed');
    return r.data as T;
  });
}

function statusIcon(status: ValidatorResult['status']): { symbol: string; color: string } {
  switch (status) {
    case 'pass':
      return { symbol: '\u2713', color: 'var(--green)' };
    case 'warn':
      return { symbol: '\u26A0', color: 'var(--yellow)' };
    case 'fail':
      return { symbol: '\u2717', color: 'var(--red)' };
  }
}

function severityColor(severity: ValidatorResult['severity']): string {
  switch (severity) {
    case 'critical':
      return 'var(--red)';
    case 'warning':
      return 'var(--orange)';
    case 'info':
      return 'var(--accent)';
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ValidatorsTab() {
  const [results, setResults] = useState<ValidatorResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [autoRun, setAutoRun] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runValidators = useCallback(async (category?: string) => {
    setLoading(true);
    setExpandedIndex(null);
    try {
      const payload = category ? { category } : null;
      const data = await send<ValidatorResult[]>('RUN_VALIDATORS', payload);
      const sorted = [...data].sort(
        (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
      );
      setResults(sorted);

      const entry: HistoryEntry = {
        timestamp: Date.now(),
        pass: sorted.filter((r) => r.status === 'pass').length,
        warn: sorted.filter((r) => r.status === 'warn').length,
        fail: sorted.filter((r) => r.status === 'fail').length,
      };
      setHistory((prev) => [entry, ...prev].slice(0, 5));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-run interval
  useEffect(() => {
    if (autoRun) {
      intervalRef.current = setInterval(() => runValidators(), 30_000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRun, runValidators]);

  const toggleRow = (idx: number) => {
    setExpandedIndex((prev) => (prev === idx ? null : idx));
  };

  return (
    <div className="dt-validator-container" style={{ padding: 12 }}>
      {/* ── Controls ────────────────────────────────────────────────────── */}
      <div
        className="dt-validator-controls"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <button
          className="dt-validator-btn dt-validator-btn-primary"
          disabled={loading}
          onClick={() => runValidators()}
          style={btnStyle('var(--accent)')}
        >
          {loading ? 'Running\u2026' : 'Run All'}
        </button>

        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className="dt-validator-btn dt-validator-btn-category"
            disabled={loading}
            onClick={() => runValidators(cat)}
            style={btnStyle('var(--bg3)')}
          >
            {cat}
          </button>
        ))}

        <label
          className="dt-validator-auto-toggle"
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: 'var(--text1)',
            fontSize: 12,
          }}
        >
          <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} />
          Auto-run (30s)
        </label>
      </div>

      {/* ── Loading spinner ─────────────────────────────────────────────── */}
      {loading && (
        <div
          className="dt-validator-spinner"
          style={{ textAlign: 'center', padding: 24, color: 'var(--text2)' }}
        >
          <span
            style={{
              display: 'inline-block',
              animation: 'dt-spin 1s linear infinite',
              fontSize: 20,
            }}
          >
            &#x21BB;
          </span>
          <div style={{ marginTop: 6, fontSize: 12 }}>Running validators\u2026</div>
        </div>
      )}

      {/* ── Results list ────────────────────────────────────────────────── */}
      {!loading && results.length > 0 && (
        <div
          className="dt-validator-results"
          style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          {results.map((r, idx) => {
            const icon = statusIcon(r.status);
            const expanded = expandedIndex === idx;
            return (
              <div
                key={idx}
                className="dt-validator-row"
                style={{
                  background: 'var(--bg1)',
                  borderRadius: 4,
                  border: '1px solid var(--border)',
                }}
              >
                <div
                  className="dt-validator-row-header"
                  onClick={() => toggleRow(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <span
                    className="dt-validator-status-icon"
                    style={{
                      color: icon.color,
                      fontWeight: 700,
                      fontSize: 14,
                      width: 18,
                      textAlign: 'center',
                    }}
                  >
                    {icon.symbol}
                  </span>

                  <span
                    className="dt-validator-name"
                    style={{
                      color: 'var(--text0)',
                      fontWeight: 600,
                      fontSize: 13,
                      flexShrink: 0,
                    }}
                  >
                    {r.name}
                  </span>

                  <span
                    className="dt-validator-category-badge"
                    style={{
                      background: 'var(--bg3)',
                      color: 'var(--text2)',
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 3,
                      flexShrink: 0,
                    }}
                  >
                    {r.category}
                  </span>

                  <span
                    className="dt-validator-message"
                    style={{
                      color: 'var(--text1)',
                      fontSize: 12,
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.message}
                  </span>

                  <span style={{ color: 'var(--text2)', fontSize: 10, flexShrink: 0 }}>
                    {expanded ? '\u25B2' : '\u25BC'}
                  </span>
                </div>

                {expanded && (
                  <div
                    className="dt-validator-row-details"
                    style={{
                      padding: '6px 10px 10px 36px',
                      borderTop: '1px solid var(--border)',
                      fontSize: 12,
                      color: 'var(--text1)',
                    }}
                  >
                    <div style={{ marginBottom: 4 }}>
                      <strong style={{ color: 'var(--text2)' }}>Severity:</strong>{' '}
                      <span style={{ color: severityColor(r.severity) }}>{r.severity}</span>
                    </div>

                    {r.suggestion && (
                      <div
                        className="dt-validator-suggestion"
                        style={{
                          marginBottom: 6,
                          padding: '4px 8px',
                          background: 'var(--bg2)',
                          borderLeft: '3px solid var(--accent)',
                          borderRadius: 2,
                        }}
                      >
                        {r.suggestion}
                      </div>
                    )}

                    {r.details && Object.keys(r.details).length > 0 && (
                      <pre
                        className="dt-validator-details-json"
                        style={{
                          margin: 0,
                          padding: '6px 8px',
                          background: 'var(--bg0)',
                          borderRadius: 3,
                          overflowX: 'auto',
                          fontSize: 11,
                          color: 'var(--text2)',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {JSON.stringify(r.details, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && results.length === 0 && (
        <div
          className="dt-validator-empty"
          style={{
            textAlign: 'center',
            padding: 32,
            color: 'var(--text2)',
            fontSize: 13,
          }}
        >
          Click <strong>Run All</strong> or a category to start validation.
        </div>
      )}

      {/* ── Test history ────────────────────────────────────────────────── */}
      {history.length > 0 && (
        <div className="dt-validator-history" style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4, fontWeight: 600 }}>
            Recent runs
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {history.map((h, i) => (
              <div
                key={i}
                className="dt-validator-history-row"
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  fontSize: 11,
                  padding: '3px 8px',
                  background: 'var(--bg1)',
                  borderRadius: 3,
                  color: 'var(--text1)',
                }}
              >
                <span style={{ color: 'var(--text2)', minWidth: 70 }}>
                  {formatTime(h.timestamp)}
                </span>
                <span style={{ color: 'var(--green)' }}>{h.pass} pass</span>
                <span style={{ color: 'var(--yellow)' }}>{h.warn} warn</span>
                <span style={{ color: 'var(--red)' }}>{h.fail} fail</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Keyframe for spinner ────────────────────────────────────────── */}
      <style>{`
        @keyframes dt-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ── Shared inline style helper ────────────────────────────────────────────────

function btnStyle(bg: string): React.CSSProperties {
  return {
    background: bg,
    color: 'var(--text0)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 500,
  };
}
