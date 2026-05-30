'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { authFetch, getToken } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';

// ── Backend shapes — mirror cloud/src/intelligence/PersonalityMirror.ts ────
interface CompositionEntry {
  clusterId: number;
  topicName: string;
  weight: number;
  share: number; // 0..1
}
interface TrajectoryRow {
  clusterId: number;
  topicName: string;
  weeks: number[]; // length === weekEnds.length
}
interface UnderrepEntry {
  clusterId: number;
  topicName: string;
  daysDormant: number;
  pastWeight: number;
}
interface MirrorPayload {
  enabled: boolean;
  optedInAt: string | null;
  lastWipedAt: string | null;
  aspirations: Record<string, number>;
  composition: { byCluster: CompositionEntry[]; totalWeight: number } | null;
  trajectory: { weekEnds: number[]; byCluster: TrajectoryRow[] } | null;
  underrepresented: UnderrepEntry[] | null;
  generatedAt: number;
}

// Cluster color palette — must match web/src/app/mind/page.tsx so the
// donut/bars/legend agree with whatever the user sees on the Mind Map.
const CLUSTER_PALETTE = [
  '#5eead4',
  '#a78bfa',
  '#fbbf24',
  '#34d399',
  '#60a5fa',
  '#fb7185',
  '#f59e0b',
  '#22d3ee',
  '#c084fc',
  '#facc15',
  '#4ade80',
  '#fb923c',
];
function colorFor(clusterId: number): string {
  return CLUSTER_PALETTE[clusterId % CLUSTER_PALETTE.length] ?? '#94a3b8';
}

export default function PersonalityPage() {
  const [data, setData] = useState<MirrorPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'enable' | 'disable' | 'wipe' | 'aspiration' | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);

  // Auth gate + initial load.
  useEffect(() => {
    if (!getToken()) {
      window.location.href = '/login?next=/personality';
      return;
    }
    void load();
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await authFetch('/intelligence/personality');
      if (res.status === 404 || res.status === 501) {
        setError('Personality Mirror is not enabled on this account.');
        setData(null);
        return;
      }
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const json = (await res.json()) as MirrorPayload;
      setData(json);
    } catch (err: unknown) {
      console.error('personality load error:', err);
      setError(err instanceof Error ? err.message : 'Could not load mirror.');
    }
  }, []);

  const enable = useCallback(async () => {
    setBusy('enable');
    try {
      await authFetch('/intelligence/personality/enable', { method: 'POST' });
      await load();
    } finally {
      setBusy(null);
    }
  }, [load]);

  const disable = useCallback(async () => {
    setBusy('disable');
    try {
      await authFetch('/intelligence/personality/disable', { method: 'POST' });
      await load();
    } finally {
      setBusy(null);
    }
  }, [load]);

  const wipe = useCallback(async () => {
    setBusy('wipe');
    try {
      await authFetch('/intelligence/personality', { method: 'DELETE' });
      setConfirmWipe(false);
      await load();
    } finally {
      setBusy(null);
    }
  }, [load]);

  const toggleAspiration = useCallback(
    async (clusterId: number) => {
      if (!data) return;
      setBusy('aspiration');
      try {
        const key = `cluster:${clusterId}`;
        const next = { ...data.aspirations };
        if (next[key]) {
          delete next[key];
        } else {
          next[key] = 1.5;
        }
        await authFetch('/intelligence/personality/aspirations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aspirations: next }),
        });
        await load();
      } finally {
        setBusy(null);
      }
    },
    [data, load],
  );

  return (
    <AppShell
      title="Attention Mirror"
      subtitle="What you've actually paid attention to. Mirror, not judgement."
      actions={
        data?.enabled ? (
          <button
            onClick={() => setConfirmWipe(true)}
            className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors cursor-pointer hover:opacity-80"
            style={{
              background: 'transparent',
              border: '1px solid rgba(251, 113, 133, 0.35)',
              color: 'var(--watchlist)',
            }}
          >
            Wipe inferences
          </button>
        ) : undefined
      }
    >
      {error && (
        <div
          className="rounded-lg p-4 text-xs mb-6"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
          }}
        >
          {error}
        </div>
      )}

      {data === null && !error && (
        <div
          className="rounded-2xl p-10 text-center text-sm"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
          }}
        >
          Loading…
        </div>
      )}

      {/* Opt-in CTA */}
      {data && !data.enabled && (
        <div
          className="rounded-2xl p-10 text-center"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <h2 className="text-xl font-semibold mb-3 tracking-tight" style={{ color: 'var(--ink)' }}>
            See what your attention actually looks like.
          </h2>
          <p
            className="text-sm max-w-md mx-auto leading-relaxed mb-6"
            style={{ color: 'var(--ink-2)' }}
          >
            Composition (last 30 days), 8-week trajectory, and dimensions you used to engage with
            but haven&apos;t lately. Single button to wipe everything later — your graph stays
            either way.
          </p>
          <button
            onClick={enable}
            disabled={busy === 'enable'}
            className="text-sm font-semibold px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            {busy === 'enable' ? 'Opting in…' : 'Opt in to Attention Mirror'}
          </button>
          <PrivacyFooter />
        </div>
      )}

      {/* Active state */}
      {data?.enabled && (
        <>
          <CompositionDonut composition={data.composition} />
          <TrajectoryChart trajectory={data.trajectory} />
          <UnderrepresentedList
            entries={data.underrepresented ?? []}
            aspirations={data.aspirations}
            onToggle={toggleAspiration}
            busy={busy === 'aspiration'}
          />

          <div className="mt-6 flex items-center gap-3 text-xs" style={{ color: 'var(--muted-2)' }}>
            <span>
              Opted in {data.optedInAt ? new Date(data.optedInAt).toLocaleDateString() : '—'}
            </span>
            <span>·</span>
            <button
              onClick={disable}
              disabled={busy === 'disable'}
              className="hover:opacity-80 transition-opacity cursor-pointer"
              style={{ color: 'var(--muted)' }}
            >
              {busy === 'disable' ? 'Disabling…' : 'Soft-disable (history preserved)'}
            </button>
          </div>
          <PrivacyFooter />
        </>
      )}

      {/* Wipe confirmation modal */}
      {confirmWipe && (
        <div
          className="fixed inset-0 backdrop-blur-sm grid place-items-center z-50 p-6"
          style={{ background: 'rgba(0, 0, 0, 0.6)' }}
          onClick={() => setConfirmWipe(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="rounded-2xl p-6 max-w-md w-full"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: '0 24px 80px -32px rgba(0, 0, 0, 0.5)',
            }}
          >
            <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--ink)' }}>
              Wipe derived inferences?
            </h3>
            <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--ink-2)' }}>
              This removes your opt-in, aspirations, and every personality view we&apos;ve computed.{' '}
              <strong style={{ color: 'var(--ink)' }}>Your interest graph stays intact</strong> —
              Mind Map, Inbox, and Trails are unaffected.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmWipe(false)}
                className="text-xs font-medium px-3 py-2 cursor-pointer hover:opacity-80"
                style={{ color: 'var(--muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={wipe}
                disabled={busy === 'wipe'}
                className="text-xs font-semibold px-4 py-2 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                style={{ background: 'var(--watchlist)', color: 'var(--on-accent)' }}
              >
                {busy === 'wipe' ? 'Wiping…' : 'Wipe everything'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ── Composition (donut + legend) ───────────────────────────────────────────

function CompositionDonut({
  composition,
}: {
  composition: { byCluster: CompositionEntry[]; totalWeight: number } | null;
}) {
  // Build SVG arc segments for the donut. r=42, stroke-width 18 keeps the
  // ring readable on mobile without dominating the layout.
  const arcs = useMemo(() => {
    if (!composition || composition.totalWeight === 0) return [];
    const C = 2 * Math.PI * 42; // circumference
    let offset = 0;
    return composition.byCluster.map((s) => {
      const len = s.share * C;
      const arc = {
        clusterId: s.clusterId,
        topicName: s.topicName,
        share: s.share,
        dashArray: `${len} ${C - len}`,
        dashOffset: -offset,
      };
      offset += len;
      return arc;
    });
  }, [composition]);

  const empty = !composition || composition.totalWeight === 0;

  return (
    <section
      className="rounded-2xl p-6 mb-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div
        className="text-[11px] uppercase tracking-widest font-semibold mb-5"
        style={{ color: 'var(--muted-2)' }}
      >
        Composition · last 30 days
      </div>
      {empty ? (
        <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
          No signals in the last 30 days yet — capture a few links to see your composition.
        </p>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-8">
          <div className="relative w-44 h-44 shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              {/* Track — uses --surface-3 so contrast holds in both themes */}
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="var(--surface-3)"
                strokeWidth="18"
              />
              {arcs.map((a) => (
                <circle
                  key={a.clusterId}
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke={colorFor(a.clusterId)}
                  strokeWidth="18"
                  strokeDasharray={a.dashArray}
                  strokeDashoffset={a.dashOffset}
                />
              ))}
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="text-2xl font-black tabular-nums" style={{ color: 'var(--ink)' }}>
                  {composition!.totalWeight}
                </div>
                <div
                  className="text-[10px] uppercase tracking-widest"
                  style={{ color: 'var(--muted-2)' }}
                >
                  signals
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 w-full flex flex-col gap-2">
            {composition!.byCluster.map((s) => (
              <div key={s.clusterId} className="flex items-center gap-3 text-sm">
                <span
                  className="w-2.5 h-2.5 rounded shrink-0"
                  style={{ background: colorFor(s.clusterId) }}
                />
                <span
                  className="flex-1 truncate"
                  title={s.topicName}
                  style={{ color: 'var(--ink)' }}
                >
                  {s.topicName}
                </span>
                <span className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {(s.share * 100).toFixed(1)}%
                </span>
                <span className="tabular-nums w-12 text-right" style={{ color: 'var(--muted-2)' }}>
                  {s.weight}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Trajectory (stacked bars) ──────────────────────────────────────────────

function TrajectoryChart({
  trajectory,
}: {
  trajectory: { weekEnds: number[]; byCluster: TrajectoryRow[] } | null;
}) {
  if (!trajectory) return null;

  // For each week, compute total + per-cluster share so stacked bars normalise.
  const perWeek = trajectory.weekEnds.map((wkEnd, wi) => {
    const slices: { clusterId: number; weight: number }[] = trajectory.byCluster.map((c) => ({
      clusterId: c.clusterId,
      weight: c.weeks[wi] ?? 0,
    }));
    const total = slices.reduce((s, x) => s + x.weight, 0);
    return { wkEnd, slices, total };
  });
  const maxTotal = Math.max(1, ...perWeek.map((p) => p.total));
  const empty = perWeek.every((p) => p.total === 0);

  return (
    <section
      className="rounded-2xl p-6 mb-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div
        className="text-[11px] uppercase tracking-widest font-semibold mb-5"
        style={{ color: 'var(--muted-2)' }}
      >
        Trajectory · last 8 weeks
      </div>
      {empty ? (
        <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
          Not enough signal yet for trajectory — needs at least a couple of weeks of captures.
        </p>
      ) : (
        <div>
          <div className="flex items-end gap-2 h-40">
            {perWeek.map((wk, i) => {
              const heightPct = Math.max(2, (wk.total / maxTotal) * 100);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-md overflow-hidden flex flex-col-reverse"
                    style={{ height: `${heightPct}%`, background: 'var(--surface-3)' }}
                  >
                    {wk.slices
                      .filter((s) => s.weight > 0)
                      .map((s) => (
                        <div
                          key={s.clusterId}
                          style={{
                            background: colorFor(s.clusterId),
                            flex: `0 0 ${(s.weight / wk.total) * 100}%`,
                          }}
                        />
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 mt-2">
            {perWeek.map((_, i) => (
              <div
                key={i}
                className="flex-1 text-center text-[10px] tabular-nums"
                style={{ color: 'var(--muted-2)' }}
              >
                {i === perWeek.length - 1 ? 'now' : `W${i + 1}`}
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-[11px]">
            {trajectory.byCluster.slice(0, 5).map((c) => (
              <span
                key={c.clusterId}
                className="inline-flex items-center gap-1.5"
                style={{ color: 'var(--ink-2)' }}
              >
                <span
                  className="w-2 h-2 rounded-sm"
                  style={{ background: colorFor(c.clusterId) }}
                />
                {c.topicName}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Underrepresented dimensions ────────────────────────────────────────────

function UnderrepresentedList({
  entries,
  aspirations,
  onToggle,
  busy,
}: {
  entries: UnderrepEntry[];
  aspirations: Record<string, number>;
  onToggle: (clusterId: number) => void;
  busy: boolean;
}) {
  if (entries.length === 0) {
    return (
      <section
        className="rounded-2xl p-6 mb-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div
          className="text-[11px] uppercase tracking-widest font-semibold mb-3"
          style={{ color: 'var(--muted-2)' }}
        >
          Underrepresented dimensions · descriptive, not prescriptive
        </div>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          Nothing dormant right now — your active dimensions all have recent activity.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl p-6 mb-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div
        className="text-[11px] uppercase tracking-widest font-semibold mb-3"
        style={{ color: 'var(--muted-2)' }}
      >
        Underrepresented dimensions · descriptive, not prescriptive
      </div>
      <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--muted)' }}>
        Things you used to engage with but haven&apos;t lately. Set one as an aspiration and Curator
        + Recall will weight toward it — or ignore. Your call.
      </p>
      <div className="flex flex-col gap-2">
        {entries.map((e) => {
          const key = `cluster:${e.clusterId}`;
          const isAspiration = !!aspirations[key];
          return (
            <div
              key={e.clusterId}
              className="flex items-center gap-3 rounded-xl p-3"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              <span
                className="w-2.5 h-2.5 rounded shrink-0"
                style={{ background: colorFor(e.clusterId) }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
                  {e.topicName}
                </div>
                <div className="text-xs" style={{ color: 'var(--muted-2)' }}>
                  Dormant {e.daysDormant}d · past weight {e.pastWeight.toFixed(0)}
                </div>
              </div>
              <button
                onClick={() => onToggle(e.clusterId)}
                disabled={busy}
                className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-50 hover:opacity-90"
                style={
                  isAspiration
                    ? {
                        background: 'var(--accent-soft)',
                        border: '1px solid var(--accent-border)',
                        color: 'var(--accent)',
                      }
                    : {
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--ink-2)',
                      }
                }
              >
                {isAspiration ? '✓ Aspiration' : 'Set as aspiration'}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PrivacyFooter() {
  return (
    <div className="mt-6 text-[11px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
      Attention Mirror is opt-in. Never visible to admins, support, or any IaaS tenant. One-click
      wipe removes every derived inference while your underlying graph stays intact. No psychometric
      labels — no Big Five, no MBTI, no &quot;personality type.&quot; (
      <Link href="/audit-log" className="hover:underline" style={{ color: 'var(--accent)' }}>
        Audit log →
      </Link>
      )
    </div>
  );
}
