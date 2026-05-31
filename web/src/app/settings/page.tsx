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

            <DigestSection />

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

// ── Weekly digest opt-in/out ────────────────────────────────────────────
// Hits /notifications/email/digest (GET + PUT). The toggle is disabled
// when transportConfigured is false — that's the server-side flag for
// "RESEND_API_KEY is unset on this deploy", which we communicate to the
// user instead of letting them flip a setting that won't do anything.
function DigestSection() {
  const [state, setState] = useState<{
    enabled: boolean;
    lastSentAt: string | null;
    email: string | null;
    transportConfigured: boolean;
  } | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    authFetch('/notifications/email/digest')
      .then((r) => (r.ok ? r.json() : null))
      .then(setState)
      .catch(() => setState(null));
  }, []);

  const toggle = async () => {
    if (!state) return;
    setPending(true);
    const next = !state.enabled;
    try {
      const res = await authFetch('/notifications/email/digest', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (res.ok) setState({ ...state, enabled: next });
    } finally {
      setPending(false);
    }
  };

  if (!state) return null;
  return (
    <Section title="Email digest">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            One weekly summary of unseen agent activity, sent to{' '}
            <strong style={{ color: 'var(--ink)' }}>{state.email ?? '—'}</strong>. We never send an
            empty digest.
          </p>
          {state.lastSentAt && (
            <p className="text-xs mt-1.5" style={{ color: 'var(--muted-2)' }}>
              Last sent {new Date(state.lastSentAt).toLocaleString()}
            </p>
          )}
          {!state.transportConfigured && (
            <p className="text-xs mt-1.5" style={{ color: 'var(--muted-2)' }}>
              Email transport isn’t configured on this deploy. Toggle will save your preference; no
              digest will go out until the operator sets RESEND_API_KEY.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className="text-xs font-semibold px-3 py-1.5 rounded-md hover:opacity-80 transition-opacity"
          style={{
            background: state.enabled ? 'var(--accent-soft)' : 'var(--surface-2)',
            border: `1px solid ${state.enabled ? 'var(--accent-border)' : 'var(--border)'}`,
            color: state.enabled ? 'var(--accent)' : 'var(--ink-2)',
            cursor: pending ? 'wait' : 'pointer',
          }}
        >
          {state.enabled ? 'On' : 'Off'}
        </button>
      </div>
    </Section>
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
