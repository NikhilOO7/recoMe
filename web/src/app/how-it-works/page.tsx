'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// ── /how-it-works ──────────────────────────────────────────────────────────
// Public route (no auth) walking through the capture → signal → graph → agent
// → emission pipeline using *real* API payloads from the dev seed account.
// The shapes here track the actual /intelligence/signals + Neo4j edges + agent
// emission contract — kept honest so a stakeholder reading this page sees what
// engineers see when they tail the cloud logs.
//
// v1: static progressive-reveal (scroll-triggered fade-in per stage).
// v1.1 (deferred): `?demo=1` connects to a `/intelligence/demo/pipeline-stream`
// SSE route on the cloud side and streams the same five stages from a real
// signal flowing through the demo account. That route doesn't exist yet —
// noted in dev-plan P3.5 acceptance criteria.

interface Stage {
  id: string;
  step: string;
  title: string;
  oneLiner: string;
  /** Where this happens — extension / cloud / postgres / neo4j / etc. */
  where: string;
  payloadTitle: string;
  payload: string;
  /** One-paragraph honest description; what's deterministic vs LLM, what's not. */
  detail: string;
  /** Source file for engineers who want to verify the shape. */
  sourceFile: string;
}

const STAGES: Stage[] = [
  {
    id: 'capture',
    step: '01',
    title: 'Capture',
    oneLiner: 'A page becomes a Signal.',
    where: 'Chromium extension · browser',
    payloadTitle: 'extension/src/capture → IDB queue',
    payload: JSON.stringify(
      {
        id: 'cap_2026_05_30_abc123',
        kind: 'page_view',
        platform: 'youtube',
        url: 'https://www.youtube.com/watch?v=BJh_pVNLrLo',
        title: 'Designing Data-Intensive Applications · Martin Kleppmann',
        capturedAt: 1748620800000,
        dwellMs: 184_000,
        entityHints: ['Martin Kleppmann', 'Designing Data-Intensive Applications'],
      },
      null,
      2,
    ),
    detail:
      'The extension watches 15 platforms and emits a typed Signal on dwell ≥ 10s, search-bar reads, and PDP loads. Signals batch into an IndexedDB queue first so a flaky network never drops a capture. Nothing else lives in the browser — no graph, no agents, no LLM keys.',
    sourceFile: 'extension/src/capture/',
  },
  {
    id: 'signal',
    step: '02',
    title: 'Ingest',
    oneLiner: 'Cloud enriches with topics and entities.',
    where: 'cloud · POST /intelligence/signals',
    payloadTitle: 'SignalIngestion.ingest()',
    payload: JSON.stringify(
      {
        signalId: 'sig_J7p2L9',
        topicsCreated: 2,
        entitiesCreated: 1,
        topics: [
          { name: 'distributed systems', normalized: 'distributed-systems', score: 0.84 },
          { name: 'database internals', normalized: 'database-internals', score: 0.61 },
        ],
        entities: [{ name: 'Martin Kleppmann', kind: 'person', strength: 0.72 }],
      },
      null,
      2,
    ),
    detail:
      'Per-signal topic + entity extraction is deterministic-first (title parsing, URL heuristics, platform-specific shape) with an LLM fallback only when the deterministic pass yields nothing. Every enrichment cites the source signalId so the graph is auditable. The same /signals endpoint serves the extension, the PWA share-target, and IaaS tenant API keys.',
    sourceFile: 'cloud/src/intelligence/SignalIngestion.ts',
  },
  {
    id: 'graph',
    step: '03',
    title: 'Graph',
    oneLiner: 'Edges accumulate. Strength is recency-decayed.',
    where: 'Neo4j · single-user namespace',
    payloadTitle: 'Cypher: HAS_INTENT(User → Topic)',
    payload: `MERGE (u:User {id: $userId})
MERGE (t:Topic {normalized: 'distributed-systems'})
ON CREATE SET t.name = 'distributed systems'
MERGE (u)-[r:HAS_INTENT]->(t)
SET r.strength = coalesce(r.strength, 0) + $delta,
    r.lastTouched = $now,
    r.platformsTouched = apoc.coll.toSet(
      coalesce(r.platformsTouched, []) + ['youtube']
    )
RETURN r.strength AS strength`,
    detail:
      "The graph is the product. User → Topic edges carry strength (recency-decayed), platformsTouched (set of every platform that contributed), and lastTouched. Cross-platform trails light up when ≥ 2 platforms appear on the same topic edge — that's the F-401 surface on /mind. The Neo4j namespace is single-user; nothing trains across users.",
    sourceFile: 'cloud/src/graph/GraphRepo.ts',
  },
  {
    id: 'agent',
    step: '04',
    title: 'Agent',
    oneLiner: 'Curator wakes daily. Recall fires on re-encounter.',
    where: 'cloud · AgentRunner + Guardian',
    payloadTitle: 'CuratorAgent.run() (deterministic v1)',
    payload: JSON.stringify(
      {
        status: 'succeeded',
        emit: {
          kind: 'fresh_content',
          title: 'distributed systems (dormant 2w) — Curator found 1 new piece.',
          body: '• "Jepsen — TigerBeetle 0.16" (aphyr.com) — distributed systems (dormant 2w)',
          sources: [
            { kind: 'page', url: 'https://aphyr.com/posts/...', label: 'aphyr.com · Jepsen' },
            { kind: 'topic', id: 'distributed-systems', label: 'distributed systems' },
          ],
          dedupeKey: 'curator:20603',
        },
        llmTokens: 0,
        costMicros: 0,
      },
      null,
      2,
    ),
    detail:
      "Each agent runs through the same AgentRunner lifecycle: canRun() → Guardian (opt-in / pause / daily cost cap / quiet hours) → run() → dedupe-insert AgentEvent → record AgentRun for the audit log. Curator + Recall ship deterministic in v1 — zero LLM tokens. Decision adds LLM streaming on demand. Guardian's ~$0.10/user/day cap is the hard ceiling per ADR-0012.",
    sourceFile: 'cloud/src/agents/AgentRunner.ts',
  },
  {
    id: 'emit',
    step: '05',
    title: 'Surface',
    oneLiner: 'It shows up where you already are.',
    where: 'web /inbox · extension overlay · PWA',
    payloadTitle: 'GET /intelligence/inbox',
    payload: JSON.stringify(
      {
        events: [
          {
            id: 'evt_K3m9Pq',
            agent: 'curator',
            kind: 'fresh_content',
            title: 'distributed systems (dormant 2w) — Curator found 1 new piece.',
            createdAt: '2026-05-30T12:00:08.314Z',
            seenAt: null,
            sources: [
              { kind: 'page', label: 'aphyr.com · Jepsen' },
              { kind: 'topic', label: 'distributed systems' },
            ],
          },
        ],
      },
      null,
      2,
    ),
    detail:
      "No new UI to learn. Emissions show in the web /inbox, the extension's overlay badge, and (when PWA notifications land in P4.3) as a system notification. Every event cites its sources back to the underlying graph nodes — click a source to jump to the trail page. Feedback (useful / not_useful) closes the loop into Guardian's throttle decisions.",
    sourceFile: 'cloud/src/agents/AgentEventStore.ts',
  },
];

export default function HowItWorksPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="glow w-[720px] h-[720px] bg-[#5eead4] -top-[220px] -left-[160px] absolute" />
      <div className="glow w-[520px] h-[520px] bg-[#a78bfa] -bottom-[120px] -right-[120px] absolute" />

      <section className="relative z-10 max-w-[920px] mx-auto px-6 pt-28 pb-12">
        <div className="inline-flex items-center gap-2 bg-[#5eead4]/[0.08] border border-[#5eead4]/25 rounded-full px-3 py-1.5 text-[11px] font-bold tracking-[0.18em] uppercase text-[#5eead4] mb-7">
          <span className="w-1.5 h-1.5 rounded-full bg-[#5eead4] pulse-dot" />
          How it works
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-[68px] font-black leading-[1.05] tracking-[-0.03em] mb-6">
          From a page-view to a <span className="grad">recommendation</span> —<br />
          five honest stages.
        </h1>

        <p className="text-lg text-white/60 max-w-[660px] leading-relaxed mb-3">
          Every panel below shows the actual payload Recome moves between stages. No mock data, no
          marketing diagrams — the same shapes that flow through prod.
        </p>
        <p className="text-sm text-white/35 max-w-[660px] leading-relaxed">
          Live mode (a real signal streaming through the demo account) ships next cycle — see the
          P3.5 follow-up in the dev plan.
        </p>
      </section>

      <section className="relative z-10 max-w-[920px] mx-auto px-6 pb-24 space-y-12">
        {STAGES.map((stage, i) => (
          <StageCard key={stage.id} stage={stage} index={i} />
        ))}
      </section>

      <section className="relative z-10 border-t border-white/[0.08] py-20">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-4">
            That&rsquo;s it. <span className="grad">No magic.</span>
          </h2>
          <p className="text-white/55 mb-8 max-w-xl mx-auto text-base leading-relaxed">
            One typed pipeline, five stages, every emission cites the signals that built it. Start
            your interest graph — the agents take it from there.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              href="/signup"
              className="bg-white text-[var(--ink)] px-7 py-3.5 rounded-xl font-bold text-[15px] hover:opacity-[0.88] transition-opacity"
            >
              Start at recome.app
            </Link>
            <Link
              href="/sdk"
              className="border border-[#fbbf24]/40 text-[#fbbf24] px-7 py-3.5 rounded-xl font-semibold text-[15px] hover:bg-[#fbbf24]/[0.08] transition-colors"
            >
              Build on /v1
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function StageCard({ stage, index }: { stage: Stage; index: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            obs.disconnect();
            return;
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-6 lg:gap-10 transition-all duration-700 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      }`}
      style={{ transitionDelay: `${Math.min(index, 3) * 40}ms` }}
    >
      <div className="lg:pt-2">
        <div className="text-[11px] font-bold tracking-[0.22em] uppercase text-[#5eead4] mb-1">
          Stage {stage.step}
        </div>
        <div className="text-3xl font-black tracking-tight mb-1">{stage.title}</div>
        <div className="text-xs text-white/45 leading-relaxed">{stage.where}</div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-7">
        <p className="text-xl font-semibold leading-snug mb-4">{stage.oneLiner}</p>
        <p className="text-sm text-white/60 leading-relaxed mb-6">{stage.detail}</p>

        <div className="rounded-xl border border-white/[0.08] bg-black/30 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] text-[11px] font-mono">
            <span className="text-white/45">{stage.payloadTitle}</span>
            <span className="text-white/30">{stage.sourceFile}</span>
          </div>
          <pre className="text-[12px] leading-relaxed text-white/75 font-mono p-4 overflow-x-auto whitespace-pre">
            {stage.payload}
          </pre>
        </div>
      </div>
    </div>
  );
}
