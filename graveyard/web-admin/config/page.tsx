'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://recome-api.fly.dev';

interface AppConfig {
  id: string;
  app: string;
  key: string;
  value: string;
  valueType: string;
  description: string | null;
  updatedAt: string;
}

const APPS = ['EXTENSION', 'WEB', 'CLOUD', 'MOBILE', 'SDK', 'AGENTS'] as const;

export default function AdminConfigPage() {
  const [configs, setConfigs] = useState<AppConfig[]>([]);
  const [selectedApp, setSelectedApp] = useState<string>('');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newApp, setNewApp] = useState<string>('EXTENSION');
  const [newType, setNewType] = useState('string');

  function load(app?: string) {
    const token = localStorage.getItem('recome_token');
    if (!token) return;
    const params = app ? `?app=${app}` : '';
    fetch(`${API_URL}/admin/config${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setConfigs)
      .catch(() => undefined);
  }

  useEffect(() => {
    load(selectedApp || undefined);
  }, [selectedApp]);

  function saveConfig() {
    const token = localStorage.getItem('recome_token');
    if (!token || !newKey || !newValue) return;
    fetch(`${API_URL}/admin/config`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: newApp, key: newKey, value: newValue, valueType: newType }),
    }).then(() => {
      load(selectedApp || undefined);
      setNewKey('');
      setNewValue('');
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">App Configuration</h1>
      <p className="text-sm text-white/40 mb-6">Runtime config for all RecoMe apps</p>

      {/* App filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setSelectedApp('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${!selectedApp ? 'bg-[#5eead4] text-black' : 'bg-white/[0.06] text-white/50'}`}
        >
          All
        </button>
        {APPS.map((a) => (
          <button
            key={a}
            onClick={() => setSelectedApp(a)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${selectedApp === a ? 'bg-[#5eead4] text-black' : 'bg-white/[0.06] text-white/50'}`}
          >
            {a}
          </button>
        ))}
      </div>

      {/* Add config */}
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5 mb-6">
        <div className="text-xs font-bold text-white/30 uppercase tracking-wider mb-3">
          Add / Update Config
        </div>
        <div className="grid sm:grid-cols-5 gap-3 mb-3">
          <select
            value={newApp}
            onChange={(e) => setNewApp(e.target.value)}
            className="px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.12] text-sm text-white cursor-pointer"
          >
            {APPS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input
            placeholder="key"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.12] text-sm text-white placeholder:text-white/30 outline-none font-mono"
          />
          <input
            placeholder="value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.12] text-sm text-white placeholder:text-white/30 outline-none"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.12] text-sm text-white cursor-pointer"
          >
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
            <option value="json">json</option>
          </select>
          <button
            onClick={saveConfig}
            className="bg-white/10 border border-white/20 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer hover:bg-white/15"
          >
            Save
          </button>
        </div>
      </div>

      {/* Configs list */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-white/30 uppercase tracking-wider border-b border-white/[0.08]">
              <th className="pb-3 pr-4">App</th>
              <th className="pb-3 pr-4">Key</th>
              <th className="pb-3 pr-4">Value</th>
              <th className="pb-3 pr-4">Type</th>
              <th className="pb-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {configs.map((c) => (
              <tr key={c.id} className="border-b border-white/[0.05] hover:bg-white/[0.02]">
                <td className="py-3 pr-4 text-[10px] text-white/40 font-bold">{c.app}</td>
                <td className="py-3 pr-4">
                  <code className="text-xs font-mono text-[#5eead4]">{c.key}</code>
                </td>
                <td className="py-3 pr-4 text-xs text-white/60 max-w-[200px] truncate">
                  {c.value}
                </td>
                <td className="py-3 pr-4 text-[10px] text-white/30">{c.valueType}</td>
                <td className="py-3 text-[10px] text-white/30">
                  {new Date(c.updatedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {configs.length === 0 && (
          <div className="text-center text-white/30 py-8 text-sm">
            No configuration entries yet.
          </div>
        )}
      </div>
    </div>
  );
}
