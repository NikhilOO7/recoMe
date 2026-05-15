'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { authFetch, getToken, clearTokens } from '@/lib/auth';

interface UserProfile {
  id: string;
  email: string;
  displayName?: string;
  tier: string;
  avatarUrl?: string;
}

interface TrailHop {
  platform: string;
  pageUrl: string;
  pageTitle: string;
  topicName: string;
  dwellMs: number;
  ts: number;
}

interface Trail {
  userId: string;
  topicNormalizedName: string;
  topicDisplayName: string;
  hops: TrailHop[];
  firstSeenAt: number;
  lastSeenAt: number;
  platformsTouched: string[];
  strength: number;
}

const PLATFORM_EMOJI: Record<string, string> = {
  youtube: '▶️',
  reddit: '👽',
  amazon: '📦',
  walmart: '🛒',
  ebay: '🏷️',
  twitter: '🐦',
  instagram: '📸',
  tiktok: '🎵',
  linkedin: '💼',
  facebook: '👤',
  generic: '🌐',
};

export default function DashboardPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trails, setTrails] = useState<Trail[] | null>(null);
  const [trailsError, setTrailsError] = useState<string | null>(null);

  useEffect(() => {
    // Check URL for OAuth callback tokens first
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const urlRefresh = params.get('refresh');
    if (urlToken) {
      localStorage.setItem('recome_token', urlToken);
      if (urlRefresh) localStorage.setItem('recome_refresh', urlRefresh);
      window.history.replaceState({}, '', '/dashboard');
    }

    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }

    authFetch('/user/profile')
      .then((res) => {
        if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data) => setProfile(data))
      .catch((err) => {
        console.error('Dashboard auth error:', err);
        setError(err.message || 'Session expired');
      })
      .finally(() => setLoading(false));

    // Research trails — best-effort. If intelligence stack is disabled on
    // the backend (501 / 404) or user has no trails yet (empty array), we
    // surface that state explicitly rather than silently empty.
    authFetch('/intelligence/trails?limit=5')
      .then(async (res) => {
        if (res.status === 404 || res.status === 501) {
          setTrailsError('Cross-device research trails are not enabled yet for your account.');
          return null;
        }
        if (!res.ok) throw new Error(`trails fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data && Array.isArray(data.trails)) setTrails(data.trails);
      })
      .catch((err) => {
        console.error('Trails fetch error:', err);
        setTrailsError(
          'Could not load research trails. The extension still works locally — open it on any supported page.',
        );
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-14">
        <div className="text-white/50">Loading...</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-14">
        <div className="text-center">
          <p className="text-white/50 mb-2">Could not load your profile.</p>
          <p className="text-xs text-white/30 mb-4">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                clearTokens();
                window.location.href = '/login';
              }}
              className="text-[#5eead4] font-medium hover:underline text-sm cursor-pointer"
            >
              Sign in again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="text-white/40 hover:text-white/60 text-sm cursor-pointer"
            >
              Retry
            </button>
          </div>
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

      {/* Research trails — live data from /intelligence/trails */}
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8">
        <h2 className="text-lg font-bold mb-2">Your Research Trails</h2>
        <p className="text-sm text-white/40 mb-6">
          Topics you&apos;ve touched on multiple platforms — captured by the extension as you browse
          YouTube, Reddit, Amazon and others.
        </p>

        {trails === null && !trailsError && (
          <div className="text-xs text-white/30">Loading trails…</div>
        )}

        {trailsError && (
          <div className="text-xs text-white/40 bg-white/[0.02] border border-white/[0.06] rounded-lg p-4">
            {trailsError}
          </div>
        )}

        {trails && trails.length === 0 && !trailsError && (
          <div className="text-xs text-white/40 bg-white/[0.02] border border-white/[0.06] rounded-lg p-4">
            No cross-platform trails yet. Browse the same topic on 2+ supported platforms and it
            will appear here. Make sure cloud sync is enabled in the extension settings.
          </div>
        )}

        {trails && trails.length > 0 && (
          <div className="flex flex-col gap-4">
            {trails.map((trail) => (
              <div
                key={trail.topicNormalizedName}
                className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold">{trail.topicDisplayName}</h3>
                  <div className="text-[10px] text-white/30 uppercase tracking-widest">
                    {trail.platformsTouched.length} platforms · {trail.hops.length} hops
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs text-white/60">
                  {trail.hops.slice(0, 6).map((hop, i) => (
                    <span key={`${hop.pageUrl}-${i}`} className="flex items-center gap-2">
                      <span className="bg-white/[0.04] border border-white/[0.08] rounded-md px-2 py-1">
                        <span className="mr-1">{PLATFORM_EMOJI[hop.platform] ?? '🌐'}</span>
                        {hop.platform}
                      </span>
                      {i < Math.min(trail.hops.length - 1, 5) && (
                        <span className="text-white/20">→</span>
                      )}
                    </span>
                  ))}
                  {trail.hops.length > 6 && (
                    <span className="text-white/30">+{trail.hops.length - 6} more</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 flex-wrap mt-6">
          <a
            href="https://chromewebstore.google.com/detail/recome/fgpjboodmfnjbpdmbapjjjbfkflhbkcf"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs bg-white/[0.06] border border-white/[0.08] rounded-lg px-4 py-2 text-[#5eead4] hover:bg-white/[0.1] transition-colors"
          >
            Get the Extension
          </a>
        </div>
      </div>

      {/* Logout */}
      <div className="mt-10 text-center">
        <button
          onClick={() => {
            clearTokens();
            window.location.href = '/';
          }}
          className="text-xs text-white/30 hover:text-white/50 transition-colors cursor-pointer"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
