import Link from 'next/link';

const CWS_URL = 'https://chromewebstore.google.com/detail/recome/fgpjboodmfnjbpdmbapjjjbfkflhbkcf';

export default function Home() {
  return (
    <>
      {/* ── HERO ───────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        <div className="glow w-[720px] h-[720px] bg-[#5eead4] -top-[220px] -left-[160px] absolute" />
        <div className="glow w-[520px] h-[520px] bg-[#a78bfa] -bottom-[120px] -right-[120px] absolute" />
        <div className="glow w-[320px] h-[320px] bg-[#fbbf24] top-[30%] right-[22%] absolute" />

        <div className="relative z-10 max-w-[920px] mx-auto px-6 pt-28 pb-20">
          <div className="inline-flex items-center gap-2 bg-[#5eead4]/[0.08] border border-[#5eead4]/25 rounded-full px-3 py-1.5 text-[11px] font-bold tracking-[0.18em] uppercase text-[#5eead4] mb-7">
            <span className="w-1.5 h-1.5 rounded-full bg-[#5eead4] pulse-dot" />
            Recome &middot; Personal Interest Graph
          </div>

          <h1 className="text-5xl sm:text-7xl lg:text-[82px] font-black leading-[1.02] tracking-[-0.03em] mb-6">
            Personal memory,
            <br />
            as <span className="grad">infrastructure</span>.
          </h1>

          <p className="text-lg sm:text-xl text-white/60 max-w-[680px] leading-relaxed mb-10">
            Recome remembers what you research across YouTube, Reddit, Amazon, Substack and eight
            more platforms &mdash; then surfaces it back to you, or to any product you build, as a
            typed interest graph powered by Neo4j, Qdrant, and LLM tool-calling.
          </p>

          <div className="flex gap-3.5 flex-wrap mb-14">
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
              Build on /v1 &mdash; Developers
            </Link>
            <a
              href="#thesis"
              className="border border-white/20 px-7 py-3.5 rounded-xl font-semibold text-[15px] hover:bg-white/[0.06] transition-colors"
            >
              The thesis
            </a>
            <Link
              href="/how-it-works"
              className="border border-white/20 px-7 py-3.5 rounded-xl font-semibold text-[15px] hover:bg-white/[0.06] transition-colors"
            >
              How it works
            </Link>
          </div>

          {/* Stat row — mirrors the deck. Values are sourced from
              docs/architecture/recome-overview.html and 0011 cost model. */}
          <div className="flex gap-4 flex-wrap">
            {[
              { value: '11', label: 'Platforms captured', color: 'var(--teal)' },
              { value: '2', label: 'Surfaces — consumer + IaaS', color: 'var(--amber)' },
              { value: '6', label: 'Active agents working your graph', color: 'var(--rose)' },
              { value: '~80%', label: 'Target gross margin', color: 'var(--violet)' },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-5 py-4 min-w-[140px]"
              >
                <div className="text-2xl font-black" style={{ color: s.color }}>
                  {s.value}
                </div>
                <div className="text-[11px] text-white/40 mt-1 leading-tight">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── THESIS ─────────────────────────────────────────────────── */}
      <section id="thesis" className="py-24 border-t border-white/[0.08] bg-white/[0.015]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#5eead4] mb-3">
            The thesis
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3 max-w-3xl">
            The chat isn&rsquo;t the product. The personal interest graph is.
          </h2>
          <p className="text-white/55 mb-10 max-w-2xl text-base sm:text-lg leading-relaxed">
            Perplexity searches the world. Recome searches your past attention. Two categorically
            different products powered by two categorically different data sources &mdash; one of
            which we own and they can&rsquo;t replicate.
          </p>

          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                accent: 'var(--teal)',
                bg: 'rgba(94,234,212,0.08)',
                border: 'rgba(94,234,212,0.25)',
                title: 'Capture from anywhere',
                desc: 'Web paste, PWA share-sheet, browser extension, bulk import, or IaaS API. Five inputs, one graph.',
              },
              {
                accent: 'var(--violet)',
                bg: 'rgba(167,139,250,0.08)',
                border: 'rgba(167,139,250,0.25)',
                title: 'Graph + vector, together',
                desc: 'Neo4j for typed relationships and traversal. Qdrant for semantic similarity. Together they answer questions search engines can’t.',
              },
              {
                accent: 'var(--amber)',
                bg: 'rgba(251,191,36,0.08)',
                border: 'rgba(251,191,36,0.25)',
                title: 'Two surfaces, one backend',
                desc: 'recome.app for individuals. /v1 for the companies who want to build on the user’s own interest data. Double the leverage, single intelligence stack.',
              },
            ].map((c) => (
              <div
                key={c.title}
                className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 hover:bg-white/[0.05] transition-colors"
              >
                <div
                  className="w-9 h-9 rounded-lg mb-4"
                  style={{ background: c.bg, border: `1px solid ${c.border}` }}
                />
                <h3 className="text-base font-bold mb-2" style={{ color: c.accent }}>
                  {c.title}
                </h3>
                <p className="text-sm text-white/55 leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-2xl p-7 border border-[#5eead4]/25 bg-gradient-to-br from-[#5eead4]/[0.08] to-[#a78bfa]/[0.04] text-base sm:text-lg leading-relaxed">
            <span className="text-[#5eead4] font-semibold">
              &ldquo;Perplexity for what you&rsquo;ve already looked at.&rdquo;
            </span>{' '}
            <span className="text-white/65">
              The one-line pitch. Whether anyone wants this is the real question &mdash; everything
              else is execution.
            </span>
          </div>
        </div>
      </section>

      {/* ── WHO IT IS FOR ──────────────────────────────────────────── */}
      <section className="py-24 border-t border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#a78bfa] mb-3">
            Who it&rsquo;s for
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            Three personas. Anyone else is a happy accident.
          </h2>
          <p className="text-white/55 mb-10 max-w-2xl">
            We don&rsquo;t build for &ldquo;everyone.&rdquo; We build for these three. If a feature
            request doesn&rsquo;t serve one of them, it goes in the parking lot.
          </p>

          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                accent: 'var(--teal)',
                bgTint: 'rgba(94,234,212,0.06)',
                initial: 'R',
                role: 'Consumer · Primary',
                name: 'Riya',
                bio: '28, designer, Bangalore',
                bullets: [
                  '3 considered purchases / quarter, $200+',
                  'Researches across YT / Reddit / Amazon for 1–3 weeks',
                  '40+ open tabs; loses the reviewer she liked',
                  'Phone-first (80% of attention)',
                ],
                metric:
                  'Week-2 retention. She opens it on Sunday, sees a forgotten trail — that’s the moment.',
              },
              {
                accent: 'var(--violet)',
                bgTint: 'rgba(167,139,250,0.06)',
                initial: 'A',
                role: 'Consumer · Secondary',
                name: 'Aman',
                bio: '22, CS undergrad, continuous learner',
                bullets: [
                  'Learns across Coursera / YT / Reddit / GitHub',
                  'Bookmarks 5+/day, never revisits',
                  'Will install the extension; will hit the API',
                  'Builds his own workflows',
                ],
                metric:
                  'Density of capture. Weekly digest surfaces three things he saved about distributed systems and never revisited.',
              },
              {
                accent: 'var(--amber)',
                bgTint: 'rgba(251,191,36,0.06)',
                initial: 'M',
                role: 'IaaS · Primary',
                name: 'Maya',
                bio: '31, eng at a Series A note-taking startup',
                bullets: [
                  'Wants "memory" in her product',
                  'Won’t build graph + vector infra herself',
                  'Decision-maker (no procurement)',
                  '$500/mo for experiments, $5k+/mo if it ships',
                ],
                metric:
                  'Time-to-first-API-call. Working integration in a single afternoon, or she walks.',
              },
            ].map((p) => (
              <div
                key={p.name}
                className="rounded-2xl p-6 border border-white/[0.08]"
                style={{ background: `linear-gradient(180deg, ${p.bgTint}, transparent)` }}
              >
                <div
                  className="w-14 h-14 rounded-full grid place-items-center text-2xl font-black mb-4"
                  style={{ background: p.accent, color: 'var(--ink)' }}
                >
                  {p.initial}
                </div>
                <div
                  className="text-[11px] font-bold tracking-[0.12em] uppercase mb-2"
                  style={{ color: p.accent }}
                >
                  {p.role}
                </div>
                <h3 className="text-xl font-bold">{p.name}</h3>
                <p className="text-[13px] text-white/40 mb-4">{p.bio}</p>
                <ul className="text-[13px] text-white/55 space-y-2 pt-2 border-t border-white/[0.06]">
                  {p.bullets.map((b) => (
                    <li
                      key={b}
                      className="pt-2 first:pt-0 first:border-t-0 border-t border-white/[0.04]"
                    >
                      {b}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 p-3 rounded-lg border border-white/[0.06] bg-white/[0.02] text-[13px] text-white/70 leading-relaxed">
                  <span className="text-white/40">Success metric: </span>
                  <span style={{ color: p.accent }} className="font-semibold">
                    {p.metric}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS (capture → graph → recall) ────────────────── */}
      <section id="how" className="py-24 border-t border-white/[0.08] bg-white/[0.015]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#5eead4] mb-3">
            How it works
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            From URL paste to graph node, in under a second.
          </h2>
          <p className="text-white/55 mb-12 max-w-2xl">
            One request chains the extractor, the LLM enricher, the graph writer and the vector
            store &mdash; with idempotency, retry, and tenant scoping baked in.
          </p>

          <div className="flex flex-col gap-4">
            {[
              {
                step: '01',
                color: 'var(--teal)',
                title: 'Capture from any surface',
                desc: 'Paste a URL at recome.app/paste, share from the PWA share-sheet, let the extension auto-capture in the background, or bulk-import a YouTube watch-history dump. Every input lands as a typed signal.',
                tag: 'POST /api/extract → og:title, topics, platform',
              },
              {
                step: '02',
                color: 'var(--violet)',
                title: 'Enrich + write to the graph',
                desc: 'The cloud API enriches topics through OpenAI, MERGEs User / Topic / Page / Signal into Neo4j, and upserts a 1536-d vector into your tenant’s Qdrant collection. Composed userIds give strict multi-tenant isolation by construction.',
                tag: 'MERGE (:User)-[:HAS_INTENT]->(:Topic) · upsert vector',
              },
              {
                step: '03',
                color: 'var(--rose)',
                title: 'Agents bring it back to you',
                desc: 'Recall surfaces a forgotten capture from 14+ days ago when a new signal hits a topic. Concierge tracks price drops on active intents. Curator pulls fresh content matching what you actually care about. Every recommendation cites the signals it drew from.',
                tag: '6 agents · sourced · pausable · within daily cost ceiling',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6"
              >
                <div className="flex gap-4 items-start">
                  <div
                    className="flex-shrink-0 w-11 h-11 rounded-xl grid place-items-center text-sm font-black border"
                    style={{
                      background: `${item.color === 'var(--teal)' ? 'rgba(94,234,212,0.12)' : item.color === 'var(--violet)' ? 'rgba(167,139,250,0.12)' : 'rgba(251,113,133,0.12)'}`,
                      borderColor: item.color,
                      color: item.color,
                    }}
                  >
                    {item.step}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-bold mb-2">{item.title}</h3>
                    <p className="text-sm text-white/55 leading-relaxed">{item.desc}</p>
                    <div
                      className="mt-4 rounded-lg border px-3 py-2 font-mono text-[12px]"
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        borderColor: 'rgba(255,255,255,0.08)',
                        color: item.color,
                      }}
                    >
                      {item.tag}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ACTIVE AGENTS (ADR-0012) ───────────────────────────────── */}
      <section id="agents" className="py-24 border-t border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#fb7185] mb-3">
            Active agents
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3 max-w-3xl">
            Background workers that bring you things. Perplexity is reactive. Recome is proactive.
          </h2>
          <p className="text-white/55 mb-10 max-w-2xl">
            Six agents read your graph on a schedule or on capture events and surface forgotten
            captures, price drops, fresh content and stalled decisions. Every output cites the
            signals it drew from. None of them ever takes irreversible action &mdash; recommend
            only.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                name: 'Recall',
                status: 'SHIPPED',
                statusColor: 'var(--green)',
                desc: 'Event-triggered. When a new signal lands on a topic, surfaces the right forgotten capture from ≥14 days ago. Zero LLM cost — deterministic ranking. Throttled to ≤2/wk.',
              },
              {
                name: 'Concierge',
                status: 'PHASE 2',
                statusColor: 'var(--amber)',
                desc: 'Tracks prices, alternatives and reviews on active purchase intents. 4×/day per active trail. Notifies on $-drop or stock change. Does NOT click buy — ever.',
              },
              {
                name: 'Curator',
                status: 'PHASE 2',
                statusColor: 'var(--amber)',
                desc: 'Pulls fresh content from RSS / YouTube / Reddit / Substack matching active interests. Daily digest. Read-only — never posts on your behalf.',
              },
              {
                name: 'Decision',
                status: 'PHASE 3',
                statusColor: 'var(--violet)',
                desc: 'On-demand. Pulls the full trail for one decision, summarizes options, recommends with full citations back to your captured signals.',
              },
              {
                name: 'Watchlist',
                status: 'PHASE 3',
                statusColor: 'var(--violet)',
                desc: 'User-set explicit watch on a topic, entity, or person. Notifies on graph changes — price, new mention, sentiment shift. Real-time on signal arrival.',
              },
              {
                name: 'Synthesist',
                status: 'PHASE 3',
                statusColor: 'var(--violet)',
                desc: 'Weekly long-form "where you are on each active intent" report. Replaces the templated digest with an LLM-synthesized one.',
              },
            ].map((a) => (
              <div
                key={a.name}
                className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 hover:bg-white/[0.05] transition-colors"
              >
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="text-base font-bold">{a.name}</h3>
                  <span
                    className="text-[10px] font-bold tracking-wider"
                    style={{ color: a.statusColor }}
                  >
                    {a.status}
                  </span>
                </div>
                <p className="text-[13px] text-white/55 leading-relaxed">{a.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
            <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#fb7185] mb-3">
              Trust constraints (binding)
            </p>
            <ul className="text-[13px] text-white/60 leading-7 list-disc pl-5">
              <li>
                <span className="text-white font-semibold">No irreversible action.</span> Every
                output is a recommendation. The user clicks buy / post / send / delete.
              </li>
              <li>
                <span className="text-white font-semibold">Sources mandatory.</span> Every event
                cites the captured signals it drew from.
              </li>
              <li>
                <span className="text-white font-semibold">One-click pause per agent.</span> Pause
                persists; no silent re-enable.
              </li>
              <li>
                <span className="text-white font-semibold">Quiet hours respected</span> (default
                22:00–08:00 local).
              </li>
              <li>
                <span className="text-white font-semibold">Daily cost ceiling per user</span>{' '}
                (default $0.10 LLM spend, hard cap).
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── TWO SURFACES (consumer + IaaS) ─────────────────────────── */}
      <section className="py-24 border-t border-white/[0.08] bg-white/[0.015]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#fbbf24] mb-3">
            Two surfaces, one backend
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            For people. For the products people use.
          </h2>
          <p className="text-white/55 mb-10 max-w-2xl">
            The same singleton intelligence stack powers both. Strict tenant isolation by
            construction &mdash; every IaaS write composes the userId as{' '}
            <span className="font-mono text-[#5eead4]">tenant_&lt;tid&gt;__&lt;extUid&gt;</span>.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <Link
              href="/signup"
              className="rounded-2xl border border-[#5eead4]/30 bg-gradient-to-br from-[#5eead4]/[0.08] to-transparent p-7 hover:from-[#5eead4]/[0.12] transition-colors group"
            >
              <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#5eead4] mb-3">
                Consumer &middot; recome.app
              </div>
              <h3 className="text-xl font-bold mb-2">Your second memory.</h3>
              <p className="text-[14px] text-white/60 leading-relaxed mb-4">
                Paste a URL, install the PWA, or add the extension. Recome remembers what you
                researched and the agents bring it back when it matters &mdash; a forgotten
                reviewer, a price drop, the thread you meant to revisit.
              </p>
              <ul className="text-[13px] text-white/50 space-y-1.5 mb-4">
                <li className="before:content-['→_'] before:text-[#5eead4]">
                  Mind Map &mdash; your interest graph rendered spatially
                </li>
                <li className="before:content-['→_'] before:text-[#5eead4]">
                  Recall, Curator, Concierge &mdash; agents that work in the background
                </li>
                <li className="before:content-['→_'] before:text-[#5eead4]">
                  GDPR-deletable. Pause anything. Wipeable in one click.
                </li>
              </ul>
              <span className="text-[13px] font-bold text-[#5eead4] group-hover:underline">
                Start at recome.app &rarr;
              </span>
            </Link>

            <Link
              href="/sdk"
              className="rounded-2xl border border-[#fbbf24]/30 bg-gradient-to-br from-[#fbbf24]/[0.08] to-transparent p-7 hover:from-[#fbbf24]/[0.12] transition-colors group"
            >
              <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#fbbf24] mb-3">
                IaaS &middot; /v1
              </div>
              <h3 className="text-xl font-bold mb-2">Personal-data infrastructure for builders.</h3>
              <p className="text-[14px] text-white/60 leading-relaxed mb-4">
                The same backend, exposed as an API. Drop the snippet into any product to add a
                personal interest graph backed by Neo4j + Qdrant &mdash; without building graph +
                vector infra yourself.
              </p>
              <ul className="text-[13px] text-white/50 space-y-1.5 mb-4">
                <li className="before:content-['→_'] before:text-[#fbbf24]">
                  Per-tenant Qdrant collections &middot; cross-tenant leaks blocked by construction
                </li>
                <li className="before:content-['→_'] before:text-[#fbbf24]">
                  Per-month quotas &middot; 429 with <span className="font-mono">resetsAt</span>{' '}
                  &middot; Stripe Meters
                </li>
                <li className="before:content-['→_'] before:text-[#fbbf24]">
                  <span className="font-mono">DELETE /v1/users/:id</span> &mdash; full GDPR wipe,
                  idempotent
                </li>
              </ul>
              <span className="text-[13px] font-bold text-[#fbbf24] group-hover:underline">
                Read the API docs &rarr;
              </span>
            </Link>
          </div>

          {/* API snippet — taken from the overview deck */}
          <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#0f0f0f] overflow-hidden">
            <div className="px-4 py-3 bg-white/[0.03] border-b border-white/[0.08] flex items-center gap-3 font-mono text-[12px] text-white/45">
              <span className="w-2 h-2 rounded-full bg-[#4ade80] pulse-dot" />
              <span className="font-bold text-[#5eead4]">POST</span>
              <span>https://recome-api.fly.dev/v1/signals</span>
            </div>
            <pre className="p-5 font-mono text-[12.5px] leading-[1.7] overflow-x-auto text-white/80">
              <span className="text-white/35">{`// Authenticated with your API key + the end-user's id.`}</span>
              {`\n`}
              <span className="text-[#60a5fa]">curl</span>
              {` -X POST https://recome-api.fly.dev/v1/signals \\\n`}
              {`  -H `}
              <span className="text-[#5eead4]">{`"Authorization: Bearer rk_live_a3f8…"`}</span>
              {` \\\n`}
              {`  -H `}
              <span className="text-[#5eead4]">{`"X-User-Id: user_42"`}</span>
              {` \\\n`}
              {`  -H `}
              <span className="text-[#5eead4]">{`"Content-Type: application/json"`}</span>
              {` \\\n`}
              {`  -d `}
              <span className="text-[#5eead4]">{`'{"signals":[{"kind":"view","pageUrl":"https://youtube.com/watch?v=abc","platform":"youtube","topics":[{"name":"standing desks"}]}]}'`}</span>
              {`\n\n`}
              <span className="text-white/35">{`// → 200 OK { ok: true, tenantId, externalUserId, count: 1, results: [{ signalId }] }`}</span>
            </pre>
          </div>
        </div>
      </section>

      {/* ── UNIQUE SURFACES (0014) ─────────────────────────────────── */}
      <section className="py-24 border-t border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#a78bfa] mb-3">
            Unique surfaces
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3 max-w-3xl">
            Features no competitor can ship without invalidating their core product.
          </h2>
          <p className="text-white/55 mb-10 max-w-2xl">
            Each of these has a structural reason why Perplexity, Anthropic, Glean, Karma, Mem, and
            the agentic browsers can&rsquo;t ship it from where they sit today.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                id: 'F-401',
                name: 'Mind Map',
                accent: 'var(--teal)',
                desc: 'Your own interest graph rendered spatially. Topic nodes sized by signal count, edges by co-occurrence. Time-scrub the past 90 days. Perplexity/Claude store opaque text memory — they can’t show this without rebuilding their storage layer.',
              },
              {
                id: 'F-403',
                name: 'Cross-platform Concierge',
                accent: 'var(--amber)',
                desc: 'Tracks one purchase intent across Amazon, YouTube reviews, Reddit threads, and competitor stores simultaneously. Karma sees one site at a time; Recome sees the trail.',
              },
              {
                id: 'F-405',
                name: 'Interest-Graph-as-API',
                accent: 'var(--violet)',
                desc: 'The user’s graph as a typed, deletable, portable resource other apps can read with their consent. No competitor exposes user-owned interest data as infrastructure.',
              },
              {
                id: 'F-406',
                name: 'Decision Completion',
                accent: 'var(--rose)',
                desc: 'When a research trail goes stale, the Decision agent pulls the full trail, summarizes the options, and recommends with sources. Replaces the "chat" surface with something that already knows what you looked at.',
              },
            ].map((f) => (
              <div
                key={f.id}
                className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 hover:bg-white/[0.05] transition-colors"
              >
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="text-base font-bold">
                    <span className="font-mono text-[12px] text-white/35 mr-2">{f.id}</span>
                    <span style={{ color: f.accent }}>{f.name}</span>
                  </h3>
                </div>
                <p className="text-[14px] text-white/55 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STACK ──────────────────────────────────────────────────── */}
      <section className="py-24 border-t border-white/[0.08] bg-white/[0.015]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#60a5fa] mb-3">
            The stack
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            Boring tech. Novel product.
          </h2>
          <p className="text-white/55 mb-10 max-w-2xl">
            Every layer is a load-bearing, well-supported choice. The novelty lives in the data
            model and the agents, not in the build pipeline.
          </p>

          <div className="flex flex-col gap-3">
            {[
              {
                tag: 'Frontend',
                color: 'var(--blue)',
                items: [
                  'Next.js 16',
                  'React 19',
                  'TypeScript 5.9',
                  'Tailwind 4',
                  'PWA + share-target',
                ],
              },
              {
                tag: 'Backend',
                color: 'var(--teal)',
                items: ['Node 20 LTS', 'Hono 4', 'Zod', 'pino', 'BullMQ (P1)'],
              },
              {
                tag: 'Data',
                color: 'var(--violet)',
                items: [
                  'Postgres 16 / Neon',
                  'Neo4j 5 / AuraDB',
                  'Qdrant 1.x',
                  'Redis / Upstash',
                  'R2',
                ],
              },
              {
                tag: 'AI / LLM',
                color: 'var(--amber)',
                items: [
                  'Anthropic Sonnet 4.6',
                  'OpenAI GPT-4o (fallback)',
                  'text-embedding-3-small (1536d)',
                  'Native tool-calling',
                ],
              },
              {
                tag: 'Infra',
                color: 'var(--green)',
                items: [
                  'Vercel (web)',
                  'Fly.io (cloud API)',
                  'Cloudflare (DNS / CDN / WAF)',
                  'GitHub Actions',
                ],
              },
            ].map((row) => (
              <div
                key={row.tag}
                className="flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-4 hover:border-white/15 transition-colors"
              >
                <span
                  className="text-[10px] font-bold tracking-[0.12em] uppercase px-3 py-1 rounded-full min-w-[90px] text-center text-[var(--ink)]"
                  style={{ background: row.color }}
                >
                  {row.tag}
                </span>
                <div className="flex flex-wrap gap-2">
                  {row.items.map((it) => (
                    <span
                      key={it}
                      className="text-[12px] px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/75"
                    >
                      {it}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRIVACY (specific, not generic) ────────────────────────── */}
      <section className="py-24 border-t border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#4ade80] mb-3">
            User-owned by construction
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3 max-w-3xl">
            We don&rsquo;t say &ldquo;privacy-first.&rdquo; We tell you what it actually means.
          </h2>
          <p className="text-white/55 mb-10 max-w-2xl">
            Per the ADR-0013 anti-positioning list: generic privacy claims are noise. Here&rsquo;s
            what we commit to instead.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                title: 'User-owned',
                desc: 'You can export the full graph as JSON at any time. You can transfer it. You can grant another app read access on your terms.',
              },
              {
                title: 'GDPR-deletable',
                desc: 'One call drops your Neo4j namespace, your Qdrant collection, and your Postgres rows. Idempotent. Verified by test.',
              },
              {
                title: 'Never trained on cross-user',
                desc: 'Topic enrichment runs against single-user context. Your interest graph never trains a shared model.',
              },
              {
                title: 'Opt-in for everything sensitive',
                desc: 'Personality Mirror is opt-in. Notifications are opt-in. Quiet hours by default. Pause any agent in one click; pause persists.',
              },
            ].map((p) => (
              <div
                key={p.title}
                className="rounded-2xl border border-[#4ade80]/15 bg-[#4ade80]/[0.05] p-5"
              >
                <h3 className="text-sm font-bold text-[#4ade80] mb-2">{p.title}</h3>
                <p className="text-[13px] text-white/55 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────── */}
      <section className="py-24 border-t border-white/[0.08]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight mb-5">
            Start your <span className="grad">interest graph</span>.
          </h2>
          <p className="text-white/55 mb-9 max-w-xl mx-auto text-base sm:text-lg leading-relaxed">
            recome.app is in beta and free. Paste your first URL and the graph starts building
            &mdash; the agents take it from there.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              href="/signup"
              className="bg-white text-[var(--ink)] px-8 py-4 rounded-xl font-bold text-[15px] hover:opacity-[0.88] transition-opacity"
            >
              Create an account
            </Link>
            <a
              href={CWS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-white/25 px-7 py-3.5 rounded-xl font-semibold text-[15px] hover:bg-white/5 transition-colors"
            >
              Add the extension
            </a>
            <Link
              href="/sdk"
              className="border border-[#fbbf24]/40 text-[#fbbf24] px-7 py-3.5 rounded-xl font-semibold text-[15px] hover:bg-[#fbbf24]/[0.08] transition-colors"
            >
              I&rsquo;m a developer
            </Link>
          </div>
          <p className="text-xs text-white/25 mt-5">
            Web + PWA + Chromium extension. iOS / Android share-sheet supported.
          </p>
        </div>
      </section>
    </>
  );
}
