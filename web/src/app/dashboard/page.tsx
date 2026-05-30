'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { authFetch, getToken, clearTokens } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';

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

  return (
    <AppShell
      title="Trails"
      subtitle={
        profile
          ? `${profile.email} · ${profile.tier} plan`
          : 'Your active research trails across captured platforms.'
      }
    >
      {loading && (
        <div className="text-sm" style={{ color: 'var(--muted)' }}>
          Loading…
        </div>
      )}

      {(error || !profile) && !loading && (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-sm mb-2" style={{ color: 'var(--ink-2)' }}>
            Could not load your profile.
          </p>
          <p className="text-xs mb-4" style={{ color: 'var(--muted-2)' }}>
            {error}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                clearTokens();
                window.location.href = '/login';
              }}
              className="font-medium hover:underline text-sm cursor-pointer"
              style={{ color: 'var(--accent)' }}
            >
              Sign in again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="text-sm cursor-pointer hover:opacity-80"
              style={{ color: 'var(--muted)' }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {profile && !loading && (
        <>
          {/* Quick links grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            <DashCard
              href="/inbox"
              border="var(--accent)"
              title="Inbox"
              desc="Things your agents brought you — Recall, Concierge, Curator."
            />
            <DashCard
              href="/agents"
              border="var(--watchlist)"
              title="Agents"
              desc="Pause, resume, view runs and budgets across all six agents."
            />
            <DashCard
              href="/mind"
              border="var(--concierge)"
              title="Mind Map"
              desc="See your interest graph — topics, edges, clusters, time-windowed."
            />
            <DashCard
              href="/personality"
              border="var(--decision)"
              title="Attention Mirror"
              desc="Composition + 8-week trajectory of what you actually pay attention to. Opt-in."
            />
            <DashCard
              href="/audit-log"
              border="var(--recall)"
              title="Audit Log"
              desc="Every capture, every agent run, every event surfaced. Exportable. Deletable."
            />
            <DashCard
              href="/paste"
              border="var(--curator)"
              title="Capture"
              desc="Paste a URL. The graph remembers."
            />
          </div>

          {/* Research trails — live data from /intelligence/trails */}
          <div
            className="rounded-2xl p-7"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--ink)' }}>
              Your research trails
            </h2>
            <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>
              Topics you&apos;ve touched on multiple platforms — captured as you browse YouTube,
              Reddit, Amazon and others.
            </p>

            {trails === null && !trailsError && (
              <div className="text-xs" style={{ color: 'var(--muted-2)' }}>
                Loading trails…
              </div>
            )}

            {trailsError && (
              <div
                className="text-xs rounded-lg p-4"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--muted)',
                }}
              >
                {trailsError}
              </div>
            )}

            {trails && trails.length === 0 && !trailsError && (
              <div
                className="text-xs rounded-lg p-4"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--muted)',
                }}
              >
                No cross-platform trails yet. Browse the same topic on 2+ supported platforms and it
                will appear here. Make sure cloud sync is enabled in the extension settings.
              </div>
            )}

            {trails && trails.length > 0 && (
              <div className="flex flex-col gap-3">
                {trails.map((trail) => (
                  <div
                    key={trail.topicNormalizedName}
                    className="rounded-xl p-5"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                        {trail.topicDisplayName}
                      </h3>
                      <div
                        className="text-[10px] uppercase tracking-widest"
                        style={{ color: 'var(--muted-2)' }}
                      >
                        {trail.platformsTouched.length} platforms · {trail.hops.length} hops
                      </div>
                    </div>
                    <div
                      className="flex items-center gap-2 flex-wrap text-xs"
                      style={{ color: 'var(--ink-2)' }}
                    >
                      {trail.hops.slice(0, 6).map((hop, i) => (
                        <span key={`${hop.pageUrl}-${i}`} className="flex items-center gap-2">
                          <span
                            className="rounded-md px-2 py-1"
                            style={{
                              background: 'var(--surface-3)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            <span className="mr-1">{PLATFORM_EMOJI[hop.platform] ?? '🌐'}</span>
                            {hop.platform}
                          </span>
                          {i < Math.min(trail.hops.length - 1, 5) && (
                            <span style={{ color: 'var(--muted-2)' }}>→</span>
                          )}
                        </span>
                      ))}
                      {trail.hops.length > 6 && (
                        <span style={{ color: 'var(--muted-2)' }}>
                          +{trail.hops.length - 6} more
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Logout */}
          <div className="mt-8 text-center">
            <button
              onClick={() => {
                clearTokens();
                window.location.href = '/';
              }}
              className="text-xs hover:opacity-80 transition-opacity cursor-pointer"
              style={{ color: 'var(--muted-2)' }}
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </AppShell>
  );
}

function DashCard({
  href,
  border,
  title,
  desc,
}: {
  href: string;
  border: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl p-5 transition-colors hover:opacity-90"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${border}`,
      }}
    >
      <h3 className="text-[13.5px] font-semibold mb-1" style={{ color: 'var(--ink)' }}>
        {title}
      </h3>
      <p className="text-[12px] leading-relaxed" style={{ color: 'var(--muted)' }}>
        {desc}
      </p>
    </Link>
  );
}
