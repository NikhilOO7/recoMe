'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://recome-api.fly.dev';

interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  tier: string;
  avatarUrl?: string;
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('recome_token');
    if (!token) {
      window.location.href = '/login';
      return;
    }

    fetch(`${API_URL}/user/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Unauthorized');
        return res.json();
      })
      .then((data) => setProfile(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white/50">Loading...</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/50 mb-4">Session expired. Please sign in again.</p>
          <Link href="/login" className="text-[#5eead4] font-medium hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 pt-24 pb-16">
      {/* Profile header */}
      <div className="flex items-center gap-4 mb-10">
        {profile.avatarUrl ? (
          <img src={profile.avatarUrl} alt="" className="w-12 h-12 rounded-full" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-[#2356e8]/20 flex items-center justify-center text-lg font-bold text-[#93b4fd]">
            {(profile.displayName || profile.email)[0]?.toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold">{profile.displayName || 'RecoMe User'}</h1>
          <p className="text-sm text-white/40">
            {profile.email} &middot; {profile.tier} plan
          </p>
        </div>
      </div>

      {/* Quick links grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        <Link
          href="/privacy"
          className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 hover:bg-white/[0.06] transition-colors"
        >
          <div className="text-xl mb-3">🔒</div>
          <h3 className="text-sm font-bold mb-1">Privacy Report</h3>
          <p className="text-xs text-white/40">See what data is stored and where it goes.</p>
        </Link>

        <Link
          href="/settings"
          className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 hover:bg-white/[0.06] transition-colors"
        >
          <div className="text-xl mb-3">⚙️</div>
          <h3 className="text-sm font-bold mb-1">Settings</h3>
          <p className="text-xs text-white/40">Platform toggles, AI provider, preferences.</p>
        </Link>

        <Link
          href="/extension"
          className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 hover:bg-white/[0.06] transition-colors"
        >
          <div className="text-xl mb-3">🧩</div>
          <h3 className="text-sm font-bold mb-1">Extension</h3>
          <p className="text-xs text-white/40">Install or update the browser extension.</p>
        </Link>
      </div>

      {/* Research topics placeholder */}
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8">
        <h2 className="text-lg font-bold mb-2">Your Research Trail</h2>
        <p className="text-sm text-white/40 mb-6">
          Research topics are stored locally in the extension. Open the extension popup to see your
          active research trail, or enable cloud sync to view them here.
        </p>
        <div className="flex gap-3">
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-xs text-white/30">
            Research topics appear here once cloud sync is enabled
          </div>
        </div>
      </div>

      {/* Logout */}
      <div className="mt-10 text-center">
        <button
          onClick={() => {
            localStorage.removeItem('recome_token');
            localStorage.removeItem('recome_refresh');
            window.location.href = '/';
          }}
          className="text-xs text-white/30 hover:text-white/50 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
