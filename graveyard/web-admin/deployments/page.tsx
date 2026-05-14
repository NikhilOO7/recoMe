'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://recome-api.fly.dev';

interface Deployment {
  id: string;
  app: string;
  version: string;
  environment: string;
  status: string;
  commitSha: string | null;
  notes: string | null;
  triggeredBy: string | null;
  deployUrl: string | null;
  startedAt: string;
  completedAt: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-500/20 text-yellow-400',
  BUILDING: 'bg-blue-500/20 text-blue-400',
  DEPLOYING: 'bg-purple-500/20 text-purple-400',
  SUCCESS: 'bg-green-500/20 text-green-400',
  FAILED: 'bg-red-500/20 text-red-400',
  ROLLED_BACK: 'bg-orange-500/20 text-orange-400',
};

export default function AdminDeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [app, setApp] = useState('EXTENSION');
  const [version, setVersion] = useState('');
  const [env, setEnv] = useState('PRODUCTION');
  const [notes, setNotes] = useState('');

  function load() {
    const token = localStorage.getItem('recome_token');
    if (!token) return;
    fetch(`${API_URL}/admin/deployments`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setDeployments)
      .catch(() => undefined);
  }

  useEffect(() => {
    load();
  }, []);

  function createDeployment() {
    const token = localStorage.getItem('recome_token');
    if (!token || !version) return;
    fetch(`${API_URL}/admin/deployments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ app, version, environment: env, notes: notes || undefined }),
    }).then(() => {
      load();
      setShowCreate(false);
      setVersion('');
      setNotes('');
    });
  }

  function updateStatus(id: string, status: string) {
    const token = localStorage.getItem('recome_token');
    if (!token) return;
    const completedAt = ['SUCCESS', 'FAILED', 'ROLLED_BACK'].includes(status)
      ? new Date().toISOString()
      : undefined;
    fetch(`${API_URL}/admin/deployments/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, completedAt }),
    }).then(() => load());
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Deployments</h1>
          <p className="text-sm text-white/40">Track and manage all app deployments</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-[#5eead4] text-black px-4 py-2 rounded-lg text-sm font-bold cursor-pointer hover:opacity-90"
        >
          + New Deploy
        </button>
      </div>

      {showCreate && (
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5 mb-6">
          <div className="grid sm:grid-cols-4 gap-3 mb-3">
            <select
              value={app}
              onChange={(e) => setApp(e.target.value)}
              className="px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.12] text-sm text-white cursor-pointer"
            >
              {['EXTENSION', 'WEB', 'CLOUD', 'MOBILE', 'SDK', 'AGENTS'].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <input
              placeholder="Version (e.g., 1.2.1)"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.12] text-sm text-white placeholder:text-white/30 outline-none"
            />
            <select
              value={env}
              onChange={(e) => setEnv(e.target.value)}
              className="px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.12] text-sm text-white cursor-pointer"
            >
              {['DEVELOPMENT', 'STAGING', 'PRODUCTION'].map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <input
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.12] text-sm text-white placeholder:text-white/30 outline-none"
            />
          </div>
          <button
            onClick={createDeployment}
            className="bg-white/10 border border-white/20 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer hover:bg-white/15"
          >
            Record Deployment
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {deployments.map((d) => (
          <div key={d.id} className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
            <div className="flex items-center justify-between gap-4 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-white/50 font-bold">
                  {d.app}
                </span>
                <span className="text-sm font-bold">v{d.version}</span>
                <span className="text-[10px] text-white/30">{d.environment}</span>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-bold ${STATUS_COLORS[d.status] || 'bg-white/10 text-white/40'}`}
              >
                {d.status}
              </span>
            </div>
            {d.notes && <p className="text-xs text-white/40 mb-2">{d.notes}</p>}
            <div className="flex items-center gap-4 text-[10px] text-white/30">
              <span>Started: {new Date(d.startedAt).toLocaleString()}</span>
              {d.completedAt && <span>Completed: {new Date(d.completedAt).toLocaleString()}</span>}
              {d.deployUrl && (
                <a
                  href={d.deployUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#5eead4] hover:underline"
                >
                  {d.deployUrl}
                </a>
              )}
            </div>
            {/* Status actions */}
            {!['SUCCESS', 'FAILED', 'ROLLED_BACK'].includes(d.status) && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => updateStatus(d.id, 'SUCCESS')}
                  className="text-[10px] px-2 py-1 rounded bg-green-500/10 text-green-400 cursor-pointer hover:bg-green-500/20"
                >
                  Mark Success
                </button>
                <button
                  onClick={() => updateStatus(d.id, 'FAILED')}
                  className="text-[10px] px-2 py-1 rounded bg-red-500/10 text-red-400 cursor-pointer hover:bg-red-500/20"
                >
                  Mark Failed
                </button>
                <button
                  onClick={() => updateStatus(d.id, 'ROLLED_BACK')}
                  className="text-[10px] px-2 py-1 rounded bg-orange-500/10 text-orange-400 cursor-pointer hover:bg-orange-500/20"
                >
                  Rolled Back
                </button>
              </div>
            )}
          </div>
        ))}
        {deployments.length === 0 && (
          <div className="text-center text-white/30 py-8 text-sm">No deployments recorded yet.</div>
        )}
      </div>
    </div>
  );
}
