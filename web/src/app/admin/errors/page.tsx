'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://recome-api.fly.dev';

interface ErrorLog {
  id: string;
  source: string;
  level: string;
  message: string;
  stack: string | null;
  userId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const LEVEL_COLORS: Record<string, string> = {
  error: 'bg-red-500/20 text-red-400',
  warn: 'bg-yellow-500/20 text-yellow-400',
  info: 'bg-blue-500/20 text-blue-400',
};

export default function AdminErrorsPage() {
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [source, setSource] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  function load(s?: string, p?: number) {
    const token = localStorage.getItem('recome_token');
    if (!token) return;
    const params = new URLSearchParams();
    if (s ?? source) params.set('source', s ?? source);
    params.set('page', String(p ?? page));
    fetch(`${API_URL}/admin/errors?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        setErrors(data.errors);
        setTotal(data.total);
      })
      .catch(() => undefined);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Error Logs</h1>
      <p className="text-sm text-white/40 mb-6">{total} errors recorded</p>

      {/* Source filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {['', 'EXTENSION', 'WEB', 'CLOUD', 'MOBILE'].map((s) => (
          <button
            key={s}
            onClick={() => {
              setSource(s);
              setPage(0);
              load(s, 0);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${source === s ? 'bg-[#5eead4] text-black' : 'bg-white/[0.06] text-white/50'}`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Error list */}
      <div className="flex flex-col gap-2">
        {errors.map((err) => (
          <div
            key={err.id}
            className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 cursor-pointer hover:bg-white/[0.05]"
            onClick={() => setExpanded(expanded === err.id ? null : err.id)}
          >
            <div className="flex items-center gap-3 mb-1">
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-bold ${LEVEL_COLORS[err.level] || 'bg-white/10 text-white/40'}`}
              >
                {err.level.toUpperCase()}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/40">
                {err.source}
              </span>
              <span className="text-[10px] text-white/20 ml-auto">
                {new Date(err.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="text-sm text-white/70 line-clamp-2">{err.message}</p>

            {expanded === err.id && (
              <div className="mt-3 pt-3 border-t border-white/[0.08]">
                {err.stack && (
                  <pre className="text-xs text-white/30 font-mono overflow-x-auto mb-3 max-h-40 overflow-y-auto bg-white/[0.02] rounded p-3">
                    {err.stack}
                  </pre>
                )}
                {err.userId && <p className="text-xs text-white/30">User: {err.userId}</p>}
                {err.metadata && (
                  <pre className="text-xs text-white/30 font-mono mt-2 bg-white/[0.02] rounded p-3 overflow-x-auto">
                    {JSON.stringify(err.metadata, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        ))}
        {errors.length === 0 && (
          <div className="text-center text-white/30 py-8 text-sm">
            No errors logged. That is a good sign.
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => {
              const p = Math.max(0, page - 1);
              setPage(p);
              load(source, p);
            }}
            disabled={page === 0}
            className="px-3 py-1.5 text-xs bg-white/[0.06] rounded disabled:opacity-30 cursor-pointer"
          >
            Prev
          </button>
          <span className="text-xs text-white/40 self-center">Page {page + 1}</span>
          <button
            onClick={() => {
              const p = page + 1;
              setPage(p);
              load(source, p);
            }}
            disabled={(page + 1) * 50 >= total}
            className="px-3 py-1.5 text-xs bg-white/[0.06] rounded disabled:opacity-30 cursor-pointer"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
