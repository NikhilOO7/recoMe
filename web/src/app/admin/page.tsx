'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://recome-api.fly.dev';

interface Stats {
  users: { total: number; activeToday: number };
  sync: { totalStates: number; devices: number };
  errors: { total: number };
  deployments: { total: number };
  featureFlags: { total: number };
  tiers: Record<string, number>;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('recome_token');
    if (!token) return;
    fetch(`${API_URL}/admin/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setStats)
      .catch(() => undefined);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Admin Dashboard</h1>
      <p className="text-sm text-white/40 mb-8">RecoMe command center — all apps, all data.</p>

      {!stats ? (
        <div className="text-white/30 text-sm">Loading stats...</div>
      ) : (
        <>
          {/* Overview cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total Users" value={stats.users.total} icon="👥" />
            <StatCard label="Active Today" value={stats.users.activeToday} icon="🟢" />
            <StatCard label="Sync States" value={stats.sync.totalStates} icon="🔄" />
            <StatCard label="Devices" value={stats.sync.devices} icon="📱" />
            <StatCard label="Feature Flags" value={stats.featureFlags.total} icon="🚩" />
            <StatCard label="Deployments" value={stats.deployments.total} icon="🚀" />
            <StatCard label="Error Logs" value={stats.errors.total} icon="🐛" />
            <StatCard label="Tier: FREE" value={stats.tiers.FREE ?? 0} icon="⭐" />
          </div>

          {/* Tier breakdown */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 mb-8">
            <h2 className="text-sm font-bold uppercase tracking-widest text-white/40 mb-4">
              User Tiers
            </h2>
            <div className="flex gap-6">
              {Object.entries(stats.tiers).map(([tier, count]) => (
                <div key={tier} className="text-center">
                  <div className="text-2xl font-black text-[#5eead4]">{count}</div>
                  <div className="text-xs text-white/40 mt-1">{tier}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-[11px] text-white/40 font-medium">{label}</span>
      </div>
      <div className="text-2xl font-black">{value.toLocaleString()}</div>
    </div>
  );
}
