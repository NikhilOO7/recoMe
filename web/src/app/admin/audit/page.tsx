'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://recome-api.fly.dev';

interface AuditEntry {
  id: string;
  adminId: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  'user.role.update': 'text-purple-400',
  'user.tier.update': 'text-blue-400',
  'user.delete': 'text-red-400',
  'feature_flag.create': 'text-green-400',
  'feature_flag.update': 'text-yellow-400',
  'feature_flag.delete': 'text-red-400',
  'deployment.create': 'text-cyan-400',
  'config.update': 'text-orange-400',
};

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  function load(p?: number) {
    const token = localStorage.getItem('recome_token');
    if (!token) return;
    fetch(`${API_URL}/admin/audit?page=${p ?? page}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setLogs(data.logs);
        setTotal(data.total);
      })
      .catch(() => undefined);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Audit Log</h1>
      <p className="text-sm text-white/40 mb-6">
        All admin actions are logged here for accountability
      </p>

      <div className="flex flex-col gap-2">
        {logs.map((log) => (
          <div key={log.id} className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
            <div className="flex items-center gap-3 mb-1">
              <code
                className={`text-xs font-mono font-bold ${ACTION_COLORS[log.action] || 'text-white/50'}`}
              >
                {log.action}
              </code>
              <span className="text-[10px] text-white/20 ml-auto">
                {new Date(log.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="text-xs text-white/40">
              Admin: <span className="text-white/60 font-mono">{log.adminId.slice(0, 12)}...</span>
              {log.resourceType && (
                <span>
                  {' '}
                  &middot; {log.resourceType}:{' '}
                  <span className="font-mono">{log.resourceId?.slice(0, 12)}...</span>
                </span>
              )}
            </div>
            {log.details && (
              <pre className="text-[10px] text-white/25 font-mono mt-2 bg-white/[0.02] rounded p-2 overflow-x-auto">
                {JSON.stringify(log.details, null, 2)}
              </pre>
            )}
          </div>
        ))}
        {logs.length === 0 && (
          <div className="text-center text-white/30 py-8 text-sm">No audit entries yet.</div>
        )}
      </div>

      {total > 50 && (
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => {
              const p = Math.max(0, page - 1);
              setPage(p);
              load(p);
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
              load(p);
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
