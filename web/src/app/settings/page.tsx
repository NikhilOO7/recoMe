'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://recome-api.fly.dev';

export default function SettingsPage() {
  const [profile, setProfile] = useState<{
    email: string;
    displayName?: string;
    tier: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('recome_token');
    if (!token) {
      window.location.href = '/login';
      return;
    }
    fetch(`${API_URL}/user/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setProfile)
      .catch(() => {
        window.location.href = '/login';
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-white/50">Loading...</div>
    );

  return (
    <div className="max-w-3xl mx-auto px-6 pt-24 pb-16">
      <Link
        href="/dashboard"
        className="text-xs text-white/30 hover:text-white/50 mb-6 inline-block"
      >
        ← Back to Dashboard
      </Link>

      <h1 className="text-2xl font-bold mb-8">Settings</h1>

      {/* Account */}
      <section className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 mb-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white/40 mb-4">Account</h2>
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm text-white/60">Email</span>
          <span className="text-sm font-medium">{profile?.email}</span>
        </div>
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm text-white/60">Display Name</span>
          <span className="text-sm font-medium">{profile?.displayName || 'Not set'}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-white/60">Plan</span>
          <span className="text-sm font-medium">{profile?.tier || 'FREE'}</span>
        </div>
      </section>

      {/* Extension settings note */}
      <section className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 mb-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white/40 mb-4">
          Extension Settings
        </h2>
        <p className="text-sm text-white/50 leading-relaxed mb-4">
          Platform toggles, aggressiveness, AI provider keys, blocked/liked topics, and other
          extension-specific settings are managed directly inside the extension popup for fast
          access.
        </p>
        <p className="text-xs text-white/30">
          Open the extension popup → Settings tab to configure these.
        </p>
      </section>

      {/* Privacy & Data */}
      <section className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 mb-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white/40 mb-4">
          Privacy & Data
        </h2>
        <div className="flex flex-col gap-3">
          <Link href="/privacy" className="text-sm text-[#5eead4] hover:underline">
            View Privacy Report →
          </Link>
          <p className="text-xs text-white/30">
            All browsing data stays on your device. Cloud sync is optional and end-to-end encrypted.
          </p>
        </div>
      </section>

      {/* Danger zone */}
      <section className="bg-red-500/[0.05] border border-red-500/[0.15] rounded-2xl p-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-red-400/60 mb-4">
          Danger Zone
        </h2>
        <p className="text-xs text-white/40 mb-4">
          Deleting your account removes all server-side data. Extension data stays local unless you
          clear it separately.
        </p>
        <button
          onClick={async () => {
            if (!confirm('Are you sure? This cannot be undone.')) return;
            const token = localStorage.getItem('recome_token');
            if (token) {
              await fetch(`${API_URL}/user/account`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              }).catch(() => undefined);
            }
            localStorage.removeItem('recome_token');
            localStorage.removeItem('recome_refresh');
            window.location.href = '/';
          }}
          className="text-xs text-red-400 border border-red-400/30 rounded-lg px-4 py-2 hover:bg-red-400/10 transition-colors cursor-pointer"
        >
          Delete Account
        </button>
      </section>
    </div>
  );
}
