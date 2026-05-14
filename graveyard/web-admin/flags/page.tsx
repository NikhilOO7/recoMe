'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://recome-api.fly.dev';

interface Flag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  rolloutPercent: number;
  app: string;
  targetTiers: string[];
  targetUsers: string[];
  createdAt: string;
}

export default function AdminFlagsPage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');
  const [newApp, setNewApp] = useState('EXTENSION');

  function loadFlags() {
    const token = localStorage.getItem('recome_token');
    if (!token) return;
    fetch(`${API_URL}/admin/flags`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setFlags)
      .catch(() => undefined);
  }

  useEffect(() => {
    loadFlags();
  }, []);

  function createFlag() {
    const token = localStorage.getItem('recome_token');
    if (!token || !newKey || !newName) return;
    fetch(`${API_URL}/admin/flags`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: newKey, name: newName, app: newApp }),
    }).then(() => {
      loadFlags();
      setShowCreate(false);
      setNewKey('');
      setNewName('');
    });
  }

  function toggleFlag(id: string, enabled: boolean) {
    const token = localStorage.getItem('recome_token');
    if (!token) return;
    fetch(`${API_URL}/admin/flags/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }).then(() => loadFlags());
  }

  function updateRollout(id: string, rolloutPercent: number) {
    const token = localStorage.getItem('recome_token');
    if (!token) return;
    fetch(`${API_URL}/admin/flags/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rolloutPercent }),
    }).then(() => loadFlags());
  }

  function deleteFlag(id: string) {
    if (!confirm('Delete this flag?')) return;
    const token = localStorage.getItem('recome_token');
    if (!token) return;
    fetch(`${API_URL}/admin/flags/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).then(() => loadFlags());
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Feature Flags</h1>
          <p className="text-sm text-white/40">{flags.length} flags configured</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-[#5eead4] text-black px-4 py-2 rounded-lg text-sm font-bold cursor-pointer hover:opacity-90"
        >
          + New Flag
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5 mb-6">
          <div className="grid sm:grid-cols-3 gap-3 mb-3">
            <input
              placeholder="flag_key (snake_case)"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.12] text-sm text-white placeholder:text-white/30 outline-none"
            />
            <input
              placeholder="Display Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.12] text-sm text-white placeholder:text-white/30 outline-none"
            />
            <select
              value={newApp}
              onChange={(e) => setNewApp(e.target.value)}
              className="px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.12] text-sm text-white cursor-pointer"
            >
              {['EXTENSION', 'WEB', 'CLOUD', 'MOBILE', 'SDK', 'AGENTS'].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={createFlag}
            className="bg-white/10 border border-white/20 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer hover:bg-white/15"
          >
            Create Flag
          </button>
        </div>
      )}

      {/* Flags list */}
      <div className="flex flex-col gap-3">
        {flags.map((flag) => (
          <div key={flag.id} className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-xs bg-white/[0.06] px-2 py-0.5 rounded text-[#5eead4] font-mono">
                    {flag.key}
                  </code>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/40">
                    {flag.app}
                  </span>
                </div>
                <div className="text-sm font-medium">{flag.name}</div>
                {flag.description && (
                  <p className="text-xs text-white/40 mt-1">{flag.description}</p>
                )}
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                {/* Rollout slider */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/40">{flag.rolloutPercent}%</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={flag.rolloutPercent}
                    onChange={(e) => updateRollout(flag.id, parseInt(e.target.value))}
                    className="w-20 accent-[#5eead4]"
                  />
                </div>

                {/* Toggle */}
                <button
                  onClick={() => toggleFlag(flag.id, !flag.enabled)}
                  className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${
                    flag.enabled ? 'bg-[#5eead4]' : 'bg-white/20'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      flag.enabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>

                {/* Delete */}
                <button
                  onClick={() => deleteFlag(flag.id)}
                  className="text-white/20 hover:text-red-400 text-xs cursor-pointer"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        ))}
        {flags.length === 0 && (
          <div className="text-center text-white/30 py-8 text-sm">
            No feature flags yet. Create one above.
          </div>
        )}
      </div>
    </div>
  );
}
