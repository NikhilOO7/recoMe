'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, getToken } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';

// ── /developer ───────────────────────────────────────────────────────────────
// User-facing IaaS dashboard. Lists the tenants this user owns, lets them
// create new ones, issue + revoke API keys, and view per-tenant usage.
// Backed by /developer/* routes on the cloud (DeveloperController.ts).
//
// The raw API key is shown ONCE at issuance with a copy button + a banner
// that it won't be retrievable again — same pattern Stripe, GitHub, etc. use
// for personal access tokens.

interface Tenant {
  id: string;
  name: string;
  plan: 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE';
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  billingEmail: string | null;
  createdAt: string;
}

interface ApiKey {
  id: string;
  label: string;
  keyPrefix: string;
  environment: 'LIVE' | 'TEST';
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface IssuedKey {
  raw: string;
  id: string;
  prefix: string;
  environment: 'LIVE' | 'TEST';
  createdAt: string;
}

interface UsageView {
  period: string;
  signalsIngested: number;
  queriesServed: number;
  embeddingsBilled: number;
}

interface Quota {
  signalsPerMonth: number;
  queriesPerMonth: number;
}

export default function DeveloperPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageView | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [justIssued, setJustIssued] = useState<IssuedKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!getToken()) {
      setSignedIn(false);
      setLoading(false);
      return;
    }
    setSignedIn(true);
    authFetch('/developer/tenants')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((data: { tenants: Tenant[] }) => {
        setTenants(data.tenants);
        if (data.tenants.length > 0) setSelectedTenantId(data.tenants[0]!.id);
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // ── Per-tenant detail load ──────────────────────────────────────────────
  const loadTenantDetail = useCallback(async (tenantId: string) => {
    setKeys([]);
    setUsage(null);
    setQuota(null);
    try {
      const [detailRes, keysRes] = await Promise.all([
        authFetch(`/developer/tenants/${tenantId}`),
        authFetch(`/developer/tenants/${tenantId}/keys`),
      ]);
      if (detailRes.ok) {
        const d = (await detailRes.json()) as { usage: UsageView; quota: Quota };
        setUsage(d.usage);
        setQuota(d.quota);
      }
      if (keysRes.ok) {
        const d = (await keysRes.json()) as { keys: ApiKey[] };
        setKeys(d.keys);
      }
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    if (selectedTenantId) void loadTenantDetail(selectedTenantId);
  }, [selectedTenantId, loadTenantDetail]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const createTenant = async (name: string) => {
    setError(null);
    try {
      const res = await authFetch('/developer/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { tenantId } = (await res.json()) as { tenantId: string };
      // Re-pull the list so the new tenant lands with its server-side defaults.
      const list = await authFetch('/developer/tenants');
      const d = (await list.json()) as { tenants: Tenant[] };
      setTenants(d.tenants);
      setSelectedTenantId(tenantId);
    } catch (e) {
      setError(`Could not create tenant: ${String(e)}`);
    }
  };

  const issueKey = async (tenantId: string, label: string, environment: 'LIVE' | 'TEST') => {
    setError(null);
    try {
      const res = await authFetch(`/developer/tenants/${tenantId}/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, environment }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const issued = (await res.json()) as IssuedKey;
      setJustIssued(issued);
      await loadTenantDetail(tenantId);
    } catch (e) {
      setError(`Could not issue key: ${String(e)}`);
    }
  };

  const revokeKey = async (keyId: string) => {
    if (!confirm('Revoke this key? Any clients still using it will fail on the next request.'))
      return;
    setError(null);
    try {
      const res = await authFetch(`/developer/keys/${keyId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (selectedTenantId) await loadTenantDetail(selectedTenantId);
    } catch (e) {
      setError(`Could not revoke key: ${String(e)}`);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  if (signedIn === false) {
    return (
      <AppShell title="Developer">
        <div className="max-w-2xl mx-auto px-6 py-24 text-center">
          <h1 className="text-3xl font-black mb-4">Sign in to the developer dashboard</h1>
          <p className="text-white/55 mb-8">
            The developer surface is JWT-authed. Sign in with your Recome account, then come back
            here to create a tenant and issue API keys for /v1/*.
          </p>
          <Link
            href="/login?next=/developer"
            className="bg-[var(--accent)] text-[var(--on-accent)] px-6 py-3 rounded-xl font-bold"
          >
            Sign in
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Developer">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-10">
          <div className="text-[11px] font-bold tracking-[0.22em] uppercase text-[#5eead4] mb-2">
            Developer
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-3">
            Tenants &amp; API keys
          </h1>
          <p className="text-white/55 max-w-2xl">
            Each tenant is a logical product (e.g. one of your apps). API keys authenticate calls to{' '}
            <code className="text-[#5eead4]">/v1/*</code>. The full spec is at{' '}
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL ?? 'https://recome-api.fly.dev'}/v1/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              the API reference
            </a>
            .
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/[0.08] px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {justIssued && <IssuedKeyBanner issued={justIssued} onClose={() => setJustIssued(null)} />}

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
          <aside>
            <TenantList
              tenants={tenants}
              selectedId={selectedTenantId}
              onSelect={setSelectedTenantId}
              onCreate={createTenant}
              loading={loading}
            />
          </aside>

          <main>
            {selectedTenantId ? (
              <TenantDetail
                tenant={tenants.find((t) => t.id === selectedTenantId)!}
                usage={usage}
                quota={quota}
                keys={keys}
                onIssue={(label, env) => issueKey(selectedTenantId, label, env)}
                onRevoke={revokeKey}
              />
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-white/55 text-sm">
                {loading ? 'Loading tenants…' : 'Create your first tenant to begin.'}
              </div>
            )}
          </main>
        </div>
      </div>
    </AppShell>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function TenantList({
  tenants,
  selectedId,
  onSelect,
  onCreate,
  loading,
}: {
  tenants: Tenant[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  return (
    <div className="space-y-3">
      <ul className="space-y-1">
        {tenants.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onSelect(t.id)}
              className={`w-full text-left rounded-xl px-3 py-2.5 border transition-colors ${
                selectedId === t.id
                  ? 'bg-white/[0.06] border-white/20'
                  : 'border-transparent hover:bg-white/[0.03]'
              }`}
            >
              <div className="text-sm font-semibold">{t.name}</div>
              <div className="text-[11px] text-white/45 mt-0.5">
                {t.plan} · {t.status.toLowerCase()}
              </div>
            </button>
          </li>
        ))}
        {!loading && tenants.length === 0 && (
          <li className="text-[12px] text-white/40 px-3">No tenants yet.</li>
        )}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onCreate(name.trim());
          setName('');
        }}
        className="pt-4 border-t border-white/[0.08] space-y-2"
      >
        <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
          New tenant
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="acme-prod"
          className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="w-full bg-[var(--accent)] text-[var(--on-accent)] py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
        >
          Create
        </button>
      </form>
    </div>
  );
}

function TenantDetail({
  tenant,
  usage,
  quota,
  keys,
  onIssue,
  onRevoke,
}: {
  tenant: Tenant;
  usage: UsageView | null;
  quota: Quota | null;
  keys: ApiKey[];
  onIssue: (label: string, env: 'LIVE' | 'TEST') => void;
  onRevoke: (id: string) => void;
}) {
  const [label, setLabel] = useState('');
  const [env, setEnv] = useState<'LIVE' | 'TEST'>('LIVE');
  return (
    <div className="space-y-8">
      <header className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <div className="flex flex-wrap items-baseline gap-3 mb-3">
          <h2 className="text-2xl font-black">{tenant.name}</h2>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#5eead4]">
            {tenant.plan}
          </span>
          <span className="text-xs text-white/40 font-mono">{tenant.id}</span>
        </div>
        {usage && quota && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <UsageBar
              label="Signals ingested"
              used={usage.signalsIngested}
              limit={quota.signalsPerMonth}
            />
            <UsageBar
              label="Queries served"
              used={usage.queriesServed}
              limit={quota.queriesPerMonth}
            />
          </div>
        )}
      </header>

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <h3 className="text-base font-bold mb-4">API keys</h3>
        {keys.length === 0 ? (
          <p className="text-white/45 text-sm mb-4">No keys yet. Issue one below.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06] mb-5">
            {keys.map((k) => (
              <li key={k.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">
                    {k.label}{' '}
                    <span className="text-xs text-white/35 font-mono ml-2">{k.keyPrefix}…</span>
                    {k.revokedAt && <span className="text-[11px] text-red-400 ml-2">revoked</span>}
                  </div>
                  <div className="text-[11px] text-white/40 mt-0.5">
                    {k.environment.toLowerCase()} ·{' '}
                    {k.lastUsedAt
                      ? `last used ${new Date(k.lastUsedAt).toLocaleString()}`
                      : 'never used'}
                  </div>
                </div>
                {!k.revokedAt && (
                  <button
                    onClick={() => onRevoke(k.id)}
                    className="text-xs text-red-400 hover:text-red-300 border border-red-400/30 hover:border-red-400/60 rounded px-3 py-1.5"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim()) return;
            onIssue(label.trim(), env);
            setLabel('');
          }}
          className="flex flex-wrap items-end gap-3 pt-4 border-t border-white/[0.06]"
        >
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-white/45 mb-1.5">
              New key label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="production-server-1"
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-white/45 mb-1.5">
              Env
            </label>
            <select
              value={env}
              onChange={(e) => setEnv(e.target.value as 'LIVE' | 'TEST')}
              className="bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm"
            >
              <option value="LIVE">LIVE</option>
              <option value="TEST">TEST</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={!label.trim()}
            className="bg-[var(--accent)] text-[var(--on-accent)] px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
          >
            Issue key
          </button>
        </form>
      </section>
    </div>
  );
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct =
    limit === Number.POSITIVE_INFINITY ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const color = pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-400' : 'bg-[#5eead4]';
  return (
    <div>
      <div className="flex justify-between text-xs text-white/55 mb-1.5">
        <span>{label}</span>
        <span>
          {used.toLocaleString()} /{' '}
          {limit === Number.POSITIVE_INFINITY ? '∞' : limit.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function IssuedKeyBanner({ issued, onClose }: { issued: IssuedKey; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };
  return (
    <div className="mb-6 rounded-xl border border-amber-400/40 bg-amber-400/[0.08] px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="text-sm font-bold text-amber-300 mb-1.5">
            New {issued.environment.toLowerCase()} key — copy it now
          </div>
          <p className="text-xs text-amber-200/80 mb-3">
            This is the only time the raw key is shown. Store it in your server&rsquo;s secrets — we
            keep the hash, not the key.
          </p>
          <div className="flex items-center gap-2 font-mono text-[13px] bg-black/40 rounded-lg px-3 py-2.5">
            <code className="flex-1 break-all">{issued.raw}</code>
            <button
              type="button"
              onClick={copy}
              className="bg-amber-300/20 hover:bg-amber-300/30 text-amber-200 px-3 py-1 rounded text-xs font-semibold"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-amber-300/60 hover:text-amber-300 text-xs"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
