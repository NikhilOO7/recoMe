'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { authFetch, clearTokens } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://recome-api.fly.dev';

export default function SettingsPage() {
  const [profile, setProfile] = useState<{
    email: string;
    displayName?: string;
    tier: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch('/user/profile')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setProfile)
      .catch(() => {
        clearTokens();
        window.location.href = '/login';
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell title="Settings" subtitle="Account, agents, and the danger zone.">
      <div className="max-w-3xl">
        {loading ? (
          <div className="text-sm" style={{ color: 'var(--muted)' }}>
            Loading…
          </div>
        ) : (
          <>
            <Section title="Account">
              <Row label="Email" value={profile?.email ?? ''} />
              <Row label="Display name" value={profile?.displayName || 'Not set'} />
              <Row label="Plan" value={profile?.tier || 'FREE'} />
            </Section>

            <Section title="Extension settings">
              <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--ink-2)' }}>
                Platform toggles, aggressiveness, AI provider keys, and blocked/liked topics are
                managed directly inside the extension popup for fast access.
              </p>
              <p className="text-xs" style={{ color: 'var(--muted-2)' }}>
                Open the extension popup → Settings tab to configure these.
              </p>
            </Section>

            <Section title="Privacy & data">
              <div className="flex flex-col gap-2">
                <Link
                  href="/privacy"
                  className="text-sm hover:underline"
                  style={{ color: 'var(--accent)' }}
                >
                  View privacy report →
                </Link>
                <p className="text-xs" style={{ color: 'var(--muted-2)' }}>
                  GDPR-deletable. Never trained on cross-user. Opt-in for everything sensitive.
                </p>
              </div>
            </Section>

            <section
              className="rounded-2xl p-6 mt-4"
              style={{
                background: 'rgba(239, 68, 68, 0.06)',
                border: '1px solid rgba(239, 68, 68, 0.22)',
              }}
            >
              <h2
                className="text-[11px] font-bold uppercase tracking-widest mb-3"
                style={{ color: 'var(--danger)' }}
              >
                Danger zone
              </h2>
              <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
                Deleting your account drops your Neo4j namespace, Qdrant collection, and Postgres
                rows. Idempotent. Cannot be undone.
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
                className="text-xs rounded-lg px-4 py-2 hover:opacity-80 transition-opacity cursor-pointer"
                style={{
                  color: 'var(--danger)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  background: 'transparent',
                }}
              >
                Delete account
              </button>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-2xl p-6 mb-3"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <h2
        className="text-[11px] font-bold uppercase tracking-widest mb-3"
        style={{ color: 'var(--muted-2)' }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-sm" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
        {value}
      </span>
    </div>
  );
}
