'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { authFetch, getToken } from '@/lib/auth';

// ── Backend shapes — mirror cloud/src/intelligence/AuditLog.ts ─────────────
type EntryType = 'capture' | 'agent_run' | 'agent_event' | 'state_change';

interface AuditEntry {
  type: EntryType;
  ts: number;
  title: string;
  body?: string;
  ref: string;
  url?: string;
  tags: string[];
  meta: Record<string, unknown>;
}

interface PageResponse {
  entries: AuditEntry[];
  nextCursor: number | null;
}

const TYPE_META: Record<EntryType, { label: string; color: string; icon: string }> = {
  capture: { label: 'Capture', color: '#34d399', icon: '↧' },
  agent_run: { label: 'Agent run', color: '#a78bfa', icon: '⚙' },
  agent_event: { label: 'Inbox', color: '#fbbf24', icon: '📥' },
  state_change: { label: 'Privacy', color: '#fb7185', icon: '🛡' },
};
const ALL_TYPES: EntryType[] = ['capture', 'agent_run', 'agent_event', 'state_change'];

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [active, setActive] = useState<Set<EntryType>>(new Set(ALL_TYPES));
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  // Auth gate
  useEffect(() => {
    if (!getToken()) {
      window.location.href = '/login?next=/audit-log';
      return;
    }
    void loadPage(null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when type filter changes (server-side filtered).
  useEffect(() => {
    if (!getToken()) return;
    void loadPage(null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.from(active).sort().join(',')]);

  const loadPage = useCallback(
    async (cursor: number | null, replace = false) => {
      setLoading(true);
      try {
        setError(null);
        const params = new URLSearchParams();
        if (cursor !== null) params.set('before', String(cursor));
        params.set('limit', '50');
        // Only set types if a subset is active; empty type filter = nothing.
        if (active.size === 0) {
          setEntries([]);
          setDone(true);
          return;
        }
        if (active.size < ALL_TYPES.length) {
          params.set('types', Array.from(active).join(','));
        }
        const res = await authFetch(`/intelligence/audit-log?${params.toString()}`);
        if (res.status === 404 || res.status === 501) {
          setError('Audit log is not enabled on this account.');
          return;
        }
        if (!res.ok) throw new Error(`audit-log fetch failed: ${res.status}`);
        const page: PageResponse = await res.json();
        setEntries((prev) => (replace ? page.entries : [...prev, ...page.entries]));
        setCursor(page.nextCursor);
        setDone(page.nextCursor === null);
      } catch (err: unknown) {
        console.error('audit-log error:', err);
        setError(err instanceof Error ? err.message : 'Could not load audit log.');
      } finally {
        setLoading(false);
      }
    },
    [active],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const hay = `${e.title} ${e.body ?? ''} ${e.tags.join(' ')} ${e.ref}`.toLowerCase();
      return hay.includes(q);
    });
  }, [entries, search]);

  const toggleType = useCallback((t: EntryType) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

  const exportAll = useCallback(async () => {
    setExporting(true);
    try {
      const res = await authFetch('/intelligence/audit-log/export');
      if (!res.ok) throw new Error(`export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recome-audit-log-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error('export error:', err);
      alert(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  }, []);

  const deleteAll = useCallback(async () => {
    try {
      const res = await authFetch('/intelligence/me', { method: 'DELETE' });
      if (!res.ok) throw new Error(`delete failed: ${res.status}`);
      alert('Your data has been deleted. Signing you out.');
      localStorage.clear();
      window.location.href = '/';
    } catch (err: unknown) {
      console.error('delete error:', err);
      alert(err instanceof Error ? err.message : 'Delete failed.');
    }
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 pt-24 pb-16">
      <header className="mb-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">
          <span className="w-2 h-2 rounded-full bg-[#5eead4]" />
          Audit Log · F-408
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-[-1.5px] mb-2">
              Everything we have on you.
            </h1>
            <p className="text-sm text-white/50 max-w-2xl leading-relaxed">
              Every capture, every agent run (including the ones Guardian capped), every inbox
              event, every privacy action. Exportable, deletable. No competitor makes this loud.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportAll}
              disabled={exporting}
              className="text-xs font-semibold bg-white text-(--ink) px-4 py-2 rounded-md hover:bg-white/90 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {exporting ? 'Exporting…' : 'Export JSON ↓'}
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-xs font-medium px-3 py-2 rounded-md border border-rose-400/30 text-rose-300/85 hover:border-rose-400/55 hover:text-rose-200 transition-colors cursor-pointer"
            >
              Delete everything
            </button>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {ALL_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => toggleType(t)}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
              active.has(t)
                ? 'bg-white text-(--ink) border-white'
                : 'bg-white/4 border-white/10 text-white/60 hover:bg-white/8 hover:text-white'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: TYPE_META[t].color }} />
            {TYPE_META[t].label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 flex-1 max-w-xs">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search loaded entries…"
            className="flex-1 bg-white/3 border border-white/8 rounded-md px-3 py-1.5 text-xs outline-none text-white/85 placeholder:text-white/30 focus:border-white/20"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-xs text-white/40 hover:text-white/70 transition-colors cursor-pointer"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-white/2 border border-white/6 rounded-lg p-4 text-xs text-white/60 mb-6">
          {error}
        </div>
      )}

      {/* Timeline */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 && !loading && (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center text-sm text-white/45">
            Nothing matches the current filters.
          </div>
        )}
        {filtered.map((e) => {
          const isOpen = openId === e.ref;
          const tm = TYPE_META[e.type];
          return (
            <article
              key={`${e.ref}:${e.ts}`}
              className="bg-white/3 border border-white/8 rounded-xl p-4 hover:bg-white/4 hover:border-white/14 transition-colors"
              style={{ borderLeftColor: tm.color, borderLeftWidth: 3 }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md shrink-0"
                  style={{ background: `${tm.color}22`, color: tm.color }}
                >
                  <span aria-hidden>{tm.icon}</span>
                  {tm.label}
                </span>
                <h3 className="text-sm font-semibold leading-snug flex-1 min-w-0 truncate">
                  {e.title}
                </h3>
                <span className="text-[11px] text-white/35 shrink-0 tabular-nums">
                  {relativeTime(e.ts)}
                </span>
              </div>
              {e.body && <p className="text-xs text-white/55 leading-relaxed mt-2">{e.body}</p>}
              {e.tags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  {e.tags.slice(0, 6).map((tag, i) => (
                    <span
                      key={`${tag}-${i}`}
                      className="text-[10px] bg-white/4 border border-white/8 rounded px-1.5 py-0.5 text-white/55"
                    >
                      {tag}
                    </span>
                  ))}
                  {e.tags.length > 6 && (
                    <span className="text-[10px] text-white/30">+{e.tags.length - 6}</span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3 mt-2 text-[11px] text-white/35">
                {e.url && (
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#5eead4] transition-colors"
                  >
                    Open source →
                  </a>
                )}
                <button
                  onClick={() => setOpenId(isOpen ? null : e.ref)}
                  className="ml-auto hover:text-white/65 transition-colors cursor-pointer"
                >
                  {isOpen ? 'Hide JSON' : 'View raw JSON'}
                </button>
              </div>
              {isOpen && (
                <pre className="mt-3 bg-black/30 border border-white/6 rounded-md p-3 text-[10.5px] text-white/65 overflow-auto max-h-72 whitespace-pre-wrap break-all">
                  {JSON.stringify(e.meta, null, 2)}
                </pre>
              )}
            </article>
          );
        })}
      </div>

      {/* Pagination */}
      {!done && entries.length > 0 && !error && (
        <div className="text-center mt-6">
          <button
            onClick={() => loadPage(cursor, false)}
            disabled={loading}
            className="text-xs font-medium bg-white/4 border border-white/8 rounded-md px-4 py-2 hover:bg-white/8 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Loading…' : 'Load older →'}
          </button>
        </div>
      )}
      {done && entries.length > 0 && (
        <div className="text-center mt-6 text-[11px] text-white/30">
          End of timeline · {entries.length} entries shown
        </div>
      )}

      {/* Footer note */}
      <div className="mt-10 text-[11px] text-white/35 leading-relaxed">
        The export downloads a JSON file with every entry above plus full raw metadata.
        Delete-everything is irreversible and wipes your graph, signals, agent history, and
        Personality Mirror state across both Postgres and Neo4j (per{' '}
        <code className="text-white/55">DELETE /intelligence/me</code>, ADR-0010 GDPR). The Pages
        and Topics that are shared with other users stay.
      </div>

      <div className="mt-8 text-center">
        <Link
          href="/dashboard"
          className="text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          ← Back to dashboard
        </Link>
      </div>

      {/* Delete-everything confirmation modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm grid place-items-center z-50 p-6"
          onClick={() => setConfirmDelete(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--ink2)] border border-white/8 rounded-2xl p-6 max-w-md w-full"
          >
            <h3 className="text-base font-bold mb-2 text-rose-300">Delete everything?</h3>
            <p className="text-sm text-white/55 leading-relaxed mb-5">
              This is the GDPR right-to-be-forgotten path. We delete every signal, every agent run,
              every inbox event, every personality state row.{' '}
              <strong className="text-white/80">This cannot be undone.</strong> You&apos;ll be
              signed out.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs font-medium text-white/60 hover:text-white px-3 py-2 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={deleteAll}
                className="text-xs font-semibold bg-rose-400/85 text-(--ink) px-4 py-2 rounded-md hover:bg-rose-400 transition-colors cursor-pointer"
              >
                Yes, delete everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function relativeTime(ts: number, now = Date.now()): string {
  const diff = Math.max(0, Math.round((now - ts) / 1000));
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}
