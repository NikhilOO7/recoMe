'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '@/lib/auth';

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
    <div className="mx-auto max-w-2xl px-6 pt-20 pb-16">
      <h1 className="text-3xl font-bold">Paste any URL</h1>
      <p className="mt-2 text-sm text-white/50">
        YouTube video, Reddit thread, Amazon product, Substack post, X tweet — we&apos;ll remember
        it and show you what else you&apos;ve looked at on the same topic.
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3">
        <input
          type="url"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-base outline-none focus:border-white/30"
        />
        <input
          type="text"
          value={topicOverride}
          onChange={(e) => setTopicOverride(e.target.value)}
          placeholder="Optional: what are you researching? (e.g. standing desks)"
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none focus:border-white/30"
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black disabled:opacity-40"
        >
          {busy ? 'Capturing…' : 'Capture'}
        </button>
      </form>

      {err && (
        <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {err}
        </div>
      )}

      {extracted && (
        <section className="mt-10 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
          <div className="text-[10px] uppercase tracking-widest text-white/40">Captured</div>
          <div className="mt-1 text-base font-semibold">{extracted.title ?? extracted.url}</div>
          {extracted.description && (
            <div className="mt-1 line-clamp-3 text-sm text-white/60">{extracted.description}</div>
          )}
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/60">
            <span className="rounded-full bg-white/[0.06] px-2 py-1">{extracted.platform}</span>
            {extracted.topics.slice(0, 6).map((t) => (
              <span key={t} className="rounded-full bg-white/[0.06] px-2 py-1">
                {t}
              </span>
            ))}
          </div>
        </section>
      )}

      {trail && (
        <section className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
          <div className="text-[10px] uppercase tracking-widest text-white/40">Your trail</div>
          <div className="mt-1 text-base font-semibold">{trail.topic}</div>
          <div className="mt-2 grid grid-cols-3 gap-3 text-center text-xs text-white/60">
            <Stat label="Signals" value={trail.signalCount} />
            <Stat label="Platforms" value={trail.platforms.length} />
            <Stat label="Strength" value={Math.round(trail.strength * 100) + '%'} />
          </div>
          <div className="mt-3 text-xs text-white/40">
            {trail.platforms.join(' · ')} • {timeAgo(trail.firstSeen)} → {timeAgo(trail.lastSeen)}
          </div>

          {related.length > 0 && (
            <div className="mt-4 border-t border-white/[0.06] pt-3">
              <div className="text-[10px] uppercase tracking-widest text-white/40">Related</div>
              <ul className="mt-2 flex flex-wrap gap-2 text-xs text-white/70">
                {related.map((r) => (
                  <li key={r.topic} className="rounded-full bg-white/[0.06] px-2.5 py-1">
                    {r.topic}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {extracted && !trail && !err && (
        <p className="mt-6 text-sm text-white/40">
          First time you&apos;ve looked at this topic. Capture a few more — the trail fills in fast.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] py-2">
      <div className="text-lg font-black">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-widest text-white/40">{label}</div>
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
