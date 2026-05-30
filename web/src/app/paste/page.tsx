'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';

// ── /paste — the consumer pivot's first surface (ADR-0003 §2.1) ─────────────
// Paste any URL → server extracts metadata → ingest signal → show the trail
// of related research the user has accumulated for that topic.
//
// On day one a user's trail will be empty; the magic only kicks in after a
// week of capture. Bulk-import (YouTube watch history dump, Amazon orders,
// Reddit saved) is the load-bearing next bet documented in ADR-0003.

type Platform =
  | 'youtube'
  | 'reddit'
  | 'amazon'
  | 'walmart'
  | 'ebay'
  | 'twitter'
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'linkedin'
  | 'generic';

interface ExtractResult {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  platform: Platform;
  topics: string[];
}

interface IngestResponse {
  ok: boolean;
  count: number;
  results: Array<{ signalId: string; topicsCreated: number; entitiesCreated: number }>;
}

interface Trail {
  topic: string;
  topicNormalizedName: string;
  platforms: string[];
  signalCount: number;
  strength: number;
  firstSeen: number;
  lastSeen: number;
}

export default function PastePage() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractResult | null>(null);
  const [trail, setTrail] = useState<Trail | null>(null);
  const [related, setRelated] = useState<Array<{ topic: string; score: number }>>([]);
  const [topicOverride, setTopicOverride] = useState('');

  // PWA share-target hydration. The manifest declares /paste as the
  // share-target receiver with method=GET, so iOS / Android share-sheets
  // and `navigator.share` callers land here with ?url= / ?title= / ?text=.
  // We prefill the form and let the user confirm before ingesting — never
  // auto-submit, in case the share-sheet sent something unexpected.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('url') ?? extractFirstUrl(params.get('text') ?? '');
    const sharedTitle = params.get('title');
    if (sharedUrl) setUrl(sharedUrl);
    if (sharedTitle) setTopicOverride(sharedTitle);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setExtracted(null);
    setTrail(null);
    setRelated([]);
    if (!url.trim()) return;

    setBusy(true);
    try {
      // 1) Extract metadata server-side (avoids CORS).
      const exRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!exRes.ok) {
        const j = await exRes.json().catch(() => ({}));
        throw new Error(j.error ?? `extract failed (${exRes.status})`);
      }
      const ex = (await exRes.json()) as ExtractResult;
      setExtracted(ex);

      // 2) Pick a primary topic — user override beats heuristics.
      const primary =
        topicOverride.trim() || (ex.topics[0] ?? ex.title ?? 'untitled').toLowerCase().slice(0, 80);

      // 3) Ingest as a 'view' signal.
      const ingRes = await authFetch('/intelligence/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signals: [
            {
              kind: 'view',
              ts: Date.now(),
              pageUrl: ex.url,
              pageTitle: ex.title ?? undefined,
              platform: ex.platform,
              topics: [{ name: primary }],
              metadata: {
                source: 'web_paste',
              },
            },
          ],
        }),
      });
      if (!ingRes.ok) {
        const j = await ingRes.json().catch(() => ({}));
        throw new Error(j.error ?? `ingest failed (${ingRes.status})`);
      }
      (await ingRes.json()) as IngestResponse;

      // 4) Fetch the trail for the captured topic — the payoff for the user.
      const trailRes = await authFetch(`/intelligence/trails/${encodeURIComponent(primary)}`);
      if (trailRes.ok) {
        const j = (await trailRes.json()) as {
          trail: Trail;
          related: Array<{ topic: string; score: number }>;
        };
        setTrail(j.trail);
        setRelated(j.related ?? []);
      } else if (trailRes.status === 404) {
        // First time this user has seen this topic — empty trail is expected.
        setTrail(null);
      } else {
        // Don't fail the whole flow if trail fetch fails; signal was saved.
        setTrail(null);
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Capture"
      subtitle="YouTube, Reddit, Amazon, Substack, X — paste a URL and the graph remembers."
    >
      <div className="max-w-2xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input
            type="url"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            className="w-full rounded-xl px-4 py-3 text-base outline-none"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--ink)',
            }}
          />
          <input
            type="text"
            value={topicOverride}
            onChange={(e) => setTopicOverride(e.target.value)}
            placeholder="Optional: what are you researching? (e.g. standing desks)"
            className="w-full rounded-xl px-4 py-3 text-sm outline-none"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--ink)',
            }}
          />
          <button
            type="submit"
            disabled={busy || !url.trim()}
            className="rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            {busy ? 'Capturing…' : 'Capture'}
          </button>
        </form>

        {err && (
          <div
            className="mt-6 rounded-xl px-4 py-3 text-sm"
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: 'var(--danger)',
            }}
          >
            {err}
          </div>
        )}

        {extracted && (
          <section
            className="mt-8 rounded-2xl p-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div
              className="text-[10px] uppercase tracking-widest"
              style={{ color: 'var(--muted-2)' }}
            >
              Captured
            </div>
            <div className="mt-1 text-base font-semibold" style={{ color: 'var(--ink)' }}>
              {extracted.title ?? extracted.url}
            </div>
            {extracted.description && (
              <div className="mt-1 line-clamp-3 text-sm" style={{ color: 'var(--ink-2)' }}>
                {extracted.description}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <Chip>{extracted.platform}</Chip>
              {extracted.topics.slice(0, 6).map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </div>
          </section>
        )}

        {trail && (
          <section
            className="mt-6 rounded-2xl p-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div
              className="text-[10px] uppercase tracking-widest"
              style={{ color: 'var(--muted-2)' }}
            >
              Your trail
            </div>
            <div className="mt-1 text-base font-semibold" style={{ color: 'var(--ink)' }}>
              {trail.topic}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center text-xs">
              <Stat label="Signals" value={trail.signalCount} />
              <Stat label="Platforms" value={trail.platforms.length} />
              <Stat label="Strength" value={Math.round(trail.strength * 100) + '%'} />
            </div>
            <div className="mt-3 text-xs" style={{ color: 'var(--muted-2)' }}>
              {trail.platforms.join(' · ')} • {timeAgo(trail.firstSeen)} → {timeAgo(trail.lastSeen)}
            </div>

            {related.length > 0 && (
              <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                <div
                  className="text-[10px] uppercase tracking-widest"
                  style={{ color: 'var(--muted-2)' }}
                >
                  Related
                </div>
                <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                  {related.map((r) => (
                    <Chip key={r.topic}>{r.topic}</Chip>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {extracted && !trail && !err && (
          <p className="mt-6 text-sm" style={{ color: 'var(--muted-2)' }}>
            First time you&apos;ve looked at this topic. Capture a few more — the trail fills in
            fast.
          </p>
        )}
      </div>
    </AppShell>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-full px-2 py-1"
      style={{
        background: 'var(--surface-3)',
        border: '1px solid var(--border)',
        color: 'var(--ink-2)',
      }}
    >
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div
      className="rounded-lg py-2"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
    >
      <div className="text-lg font-black" style={{ color: 'var(--ink)' }}>
        {value}
      </div>
      <div
        className="mt-0.5 text-[10px] uppercase tracking-widest"
        style={{ color: 'var(--muted-2)' }}
      >
        {label}
      </div>
    </div>
  );
}

// Android share-sheets often send a URL inside the `text` payload rather
// than as the dedicated `url` param. Grab the first http(s) URL we find.
function extractFirstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/\S+/);
  return m ? m[0] : null;
}

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
