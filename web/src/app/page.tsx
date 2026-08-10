import Link from 'next/link';

// Public homepage. Content law (docs/PRODUCT.md + docs/VISION.md):
//   - benefit-led hero; infrastructure jargon stays on /sdk
//   - only the five real agents + the Guardian gate; honest status tags
//   - the five trust constraints verbatim as product law
//   - no internal artifacts on a public page (ADR ids, phase labels,
//     margin targets, persona strategy)
// Every color pairs a token bg with a token ink — both themes hold.

const AGENTS: Array<{
  name: string;
  tone: string;
  status: 'Live' | 'Coming soon';
  desc: string;
}> = [
  {
    name: 'Recall',
    tone: 'var(--recall)',
    status: 'Live',
    desc: 'Surfaces the research you forgot — the review thread from three weeks ago, back exactly when the topic comes up again.',
  },
  {
    name: 'Curator',
    tone: 'var(--curator)',
    status: 'Live',
    desc: 'Brings fresh material for the threads you are actually on, and says which of your signals made it relevant.',
  },
  {
    name: 'Decision',
    tone: 'var(--decision)',
    status: 'Live',
    desc: 'Your on-demand advisor. Ask it about the page you are on and it answers from your own trail — streamed, with citations.',
  },
  {
    name: 'Curriculum',
    tone: 'var(--concierge)',
    status: 'Live',
    desc: 'Turns scattered learning into a four-week plan anchored to what you have already watched and read.',
  },
  {
    name: 'Concierge',
    tone: 'var(--watchlist)',
    status: 'Coming soon',
    desc: 'Watches the commerce pages you researched and brings you the price move. It recommends — it never clicks Buy.',
  },
];

const TRUST = [
  {
    title: 'Every output cites its sources',
    desc: 'Each agent result links back to the captured signals it drew from. No black-box output, ever.',
  },
  {
    title: 'Recommend, never act',
    desc: 'No agent takes an irreversible action. You click Buy. You hit Send. Always.',
  },
  {
    title: 'Pause anything in one click',
    desc: 'Per agent, per platform, or everything at once. A pause stays paused.',
  },
  {
    title: 'See and delete everything',
    desc: 'The audit log shows every signal and every agent run. Export it, or wipe your account — graph, vectors, and history go together.',
  },
  {
    title: 'A hard daily cost ceiling',
    desc: 'Agent spend is capped per user per day, enforced in code by the Guardian gate — not by a policy page.',
  },
];

export default function Home() {
  return (
    <>
      {/* ── HERO ───────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="glow w-[720px] h-[720px] bg-[#5eead4] -top-[220px] -left-[160px] absolute" />
        <div className="glow w-[520px] h-[520px] bg-[#a78bfa] -bottom-[120px] -right-[120px] absolute" />

        <div className="relative z-10 max-w-6xl mx-auto px-6 pt-40 pb-24">
          <div className="inline-flex items-center gap-2 border border-[var(--accent-border)] bg-[var(--accent-soft)] rounded-full px-3.5 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] pulse-dot" />
            <span className="eyebrow text-[var(--accent)]">Personal attention infrastructure</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.04] tracking-[-0.03em] mb-7 max-w-4xl text-balance">
            Everything you research, <span className="grad">working for you.</span>
          </h1>

          <p className="text-lg sm:text-xl text-[var(--muted)] max-w-2xl leading-relaxed mb-10">
            RecoMe captures what you actually pay attention to across YouTube, Amazon, Reddit and a
            dozen more sites, builds it into an interest graph you control, and puts five background
            agents to work on it. The review you forgot. The price you were waiting on. The next
            thing to learn.
          </p>

          <div className="flex gap-3.5 flex-wrap mb-16">
            <Link href="/signup" className="btn btn-primary">
              Start free
            </Link>
            <Link href="/extension" className="btn btn-secondary">
              Get the extension
            </Link>
            <Link href="/sdk" className="btn btn-quiet">
              Build on the API
            </Link>
          </div>

          <div className="flex gap-4 flex-wrap">
            {[
              { value: '15', label: 'platforms captured' },
              { value: '5 + 1', label: 'agents, gated by a Guardian' },
              { value: '100%', label: 'of outputs cite their sources' },
              { value: '1 click', label: 'to pause or delete anything' },
            ].map((s) => (
              <div key={s.label} className="card px-5 py-4 min-w-[150px]">
                <div className="text-2xl font-black text-[var(--accent)] tabular-nums">
                  {s.value}
                </div>
                <div className="text-[12px] text-[var(--muted-2)] mt-1 leading-tight">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── THESIS ─────────────────────────────────────────────────── */}
      <section id="thesis" className="py-24 border-t border-[var(--border)] bg-[var(--surface)]/40">
        <div className="max-w-6xl mx-auto px-6">
          <p className="eyebrow text-[var(--accent)] mb-3">Why this exists</p>
          <h2 className="section-title mb-5 max-w-3xl">
            Every platform keeps a model of you — and every one of them serves the platform.
          </h2>
          <p className="text-[var(--muted)] mb-12 max-w-2xl text-base sm:text-lg leading-relaxed">
            Your research, half-finished decisions, and learning threads die at the tab. RecoMe
            builds the model of you that works{' '}
            <em className="text-[var(--ink)] not-italic font-semibold">for</em> you: the chat
            isn&rsquo;t the product — the personal interest graph is.
          </p>

          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                title: 'Capture everywhere you already are',
                desc: 'The browser extension captures as you research. Share to the app from your phone. Paste a link. Fifteen platforms, one graph.',
              },
              {
                title: 'One graph, and it is yours',
                desc: 'Topics, products, creators, and how strongly you actually care — weighted by real attention, cooling off when you move on. Export it or delete it any time.',
              },
              {
                title: 'Agents bring it back',
                desc: 'You never open a chat box to benefit. The agents watch the graph and bring you what you would have missed — cited, in context, where you already are.',
              },
            ].map((c) => (
              <div key={c.title} className="card card-hover p-6 transition-colors">
                <h3 className="text-base font-bold mb-2 text-[var(--ink)]">{c.title}</h3>
                <p className="text-sm text-[var(--muted)] leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-2xl p-7 border border-[var(--accent-border)] bg-[var(--accent-soft)] text-base sm:text-lg leading-relaxed">
            <span className="text-[var(--accent-ink)] font-semibold">
              Search answers the questions you know to ask.
            </span>{' '}
            <span className="text-[var(--muted)]">
              Your graph answers the ones you forgot you had — the review you half-read, the course
              you meant to start, the price you were waiting on.
            </span>
          </div>
        </div>
      </section>

      {/* ── AGENTS ─────────────────────────────────────────────────── */}
      <section id="agents" className="py-24 border-t border-[var(--border)] scroll-mt-16">
        <div className="max-w-6xl mx-auto px-6">
          <p className="eyebrow text-[var(--accent)] mb-3">The agents</p>
          <h2 className="section-title mb-5 max-w-3xl">
            Five background workers. One Guardian watching all of them.
          </h2>
          <p className="text-[var(--muted)] mb-12 max-w-2xl leading-relaxed">
            Agents read your graph on a schedule or when something happens, and surface what
            matters. Every output cites the signals it drew from, and none of them ever takes an
            action on your behalf.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AGENTS.map((a) => (
              <div key={a.name} className="card card-hover p-6 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: a.tone }} />
                    <h3 className="text-base font-bold text-[var(--ink)]">{a.name}</h3>
                  </div>
                  <span
                    className={`text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full ${
                      a.status === 'Live'
                        ? 'text-[var(--success)] border border-[var(--success)]/30'
                        : 'text-[var(--muted-2)] border border-[var(--border-strong)]'
                    }`}
                  >
                    {a.status}
                  </span>
                </div>
                <p className="text-[13.5px] text-[var(--muted)] leading-relaxed">{a.desc}</p>
              </div>
            ))}

            {/* Guardian — the gate, deliberately styled apart from the roster */}
            <div className="rounded-2xl p-6 border border-[var(--warn)]/35 bg-[var(--warn)]/[0.06]">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--warn)]" />
                <h3 className="text-base font-bold text-[var(--ink)]">Guardian</h3>
              </div>
              <p className="text-[13.5px] text-[var(--muted)] leading-relaxed">
                Not an agent — the gate every agent passes through. Opt-in checks, per-agent
                throttles, quiet hours, and a hard daily spend ceiling. If an agent would annoy you
                or overspend, it simply doesn&rsquo;t run.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── IN-PAGE MOCKUP ─────────────────────────────────────────────
          Faithful CSS recreation of the extension surfaces (Sidebar,
          InsightCard, CardBadge) in their exact shipped palette. The
          extension always renders dark, so this block paints explicit
          colors — it depicts a screenshot, not themed site chrome. */}
      <section className="py-24 border-t border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-6">
          <p className="eyebrow text-[var(--accent)] mb-3">On the page</p>
          <h2 className="section-title mb-5 max-w-3xl">You browse. RecoMe works in the margins.</h2>
          <p className="text-[var(--muted)] mb-12 max-w-2xl leading-relaxed">
            The extension draws three quiet surfaces onto the sites you already use — the sidebar
            with your live graph, cards from agents when they have something, and a relevance badge
            on results you researched. Nothing to open, nothing to maintain.
          </p>

          {/* Browser frame */}
          <div className="rounded-2xl border border-[var(--border)] overflow-hidden shadow-2xl">
            {/* Chrome bar */}
            <div className="flex items-center gap-3 px-4 py-2.5 bg-[#161b23] border-b border-white/[0.06]">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
                <span className="w-3 h-3 rounded-full bg-[#28c840]" />
              </div>
              <div className="flex-1 max-w-md mx-auto bg-[#0a0d12] rounded-md px-3 py-1 text-[11px] font-mono text-white/40 text-center truncate">
                amazon.com/s?k=standing+desk
              </div>
            </div>

            {/* Page body: product column + sidebar column */}
            <div className="grid md:grid-cols-[1fr_300px] gap-6 p-6 bg-[#0d1117]">
              {/* Left: product card with badge + insight card */}
              <div className="flex flex-col gap-5 min-w-0">
                {/* Product card with CardBadge */}
                <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-4 flex gap-4">
                  <div className="w-24 h-24 rounded-lg bg-white/[0.06] flex-shrink-0 grid place-items-center text-3xl">
                    🪑
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="h-3.5 w-3/4 rounded bg-white/[0.12] mb-2" />
                    <div className="h-3 w-1/2 rounded bg-white/[0.07] mb-3" />
                    <div className="h-3 w-1/3 rounded bg-white/[0.07] mb-4" />
                    {/* CardBadge */}
                    <div className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 bg-[#10151d]/95 border border-[#5eead4]/35">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#5eead4]" />
                      <span className="text-[11px] font-semibold text-[#5eead4]">Relevant</span>
                      <span className="text-[11px] text-white/55">
                        matches your standing-desks trail
                      </span>
                    </div>
                  </div>
                </div>

                {/* Skeleton second product row */}
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-4 flex gap-4 opacity-60">
                  <div className="w-24 h-24 rounded-lg bg-white/[0.05] flex-shrink-0" />
                  <div className="flex-1 pt-1">
                    <div className="h-3.5 w-2/3 rounded bg-white/[0.09] mb-2" />
                    <div className="h-3 w-1/2 rounded bg-white/[0.06] mb-3" />
                    <div className="h-3 w-1/4 rounded bg-white/[0.06]" />
                  </div>
                </div>

                {/* InsightCard — Recall emission */}
                <div className="rounded-xl p-4 bg-gradient-to-br from-[#10151d]/[0.98] to-[#0a0d12]/[0.98] border border-[#5eead4]/35 flex gap-3.5 max-w-md">
                  <div className="w-8 h-8 rounded-lg grid place-items-center text-sm font-black bg-[#5eead4]/15 border border-[#5eead4]/40 text-[#5eead4] flex-shrink-0">
                    ↻
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#5eead4] mb-1">
                      Recall
                    </div>
                    <p className="text-[13px] font-semibold text-white/90 leading-snug mb-1">
                      You watched two reviews of this desk — three weeks ago.
                    </p>
                    <p className="text-[12px] text-white/55 leading-relaxed mb-2.5">
                      The r/StandingDesks thread you dwelled on called out this exact model&rsquo;s
                      motor under load.
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] uppercase tracking-wider text-white/40">
                        From your graph:
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full text-[#5eead4] bg-[#5eead4]/10 border border-[#5eead4]/25">
                        standing desks
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full text-[#5eead4] bg-[#5eead4]/10 border border-[#5eead4]/25">
                        r/StandingDesks thread
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Sidebar mockup */}
              <div className="rounded-[14px] bg-gradient-to-b from-[#10151d] to-[#0a0d12] border border-[#5eead4]/[0.18] overflow-hidden self-start hidden md:block">
                <div className="flex items-center justify-between px-3.5 py-3 border-b border-white/[0.06] bg-[#5eead4]/[0.04]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#10b981]" />
                    <span className="text-[13px] font-bold text-white">RecoMe Active</span>
                  </div>
                  <span className="text-white/40 text-xs">⌄</span>
                </div>
                <div className="p-3">
                  <div className="rounded-[10px] border border-[#5eead4]/[0.18] bg-gradient-to-br from-[#0d9488]/10 to-[#5eead4]/[0.04] p-3 mb-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#5eead4] mb-2">
                      Interest graph
                    </div>
                    {[
                      ['standing desks', 0.85],
                      ['mechanical keyboards', 0.61],
                      ['espresso grinders', 0.55],
                    ].map(([name, w]) => (
                      <div key={String(name)} className="mb-2 last:mb-0">
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="text-[12px] text-white/85">{name}</span>
                          <span className="text-[10.5px] font-mono text-white/50">
                            {Number(w).toFixed(2)}
                          </span>
                        </div>
                        <div className="h-1 rounded-sm bg-white/[0.06] overflow-hidden">
                          <div
                            className="h-full rounded-sm bg-gradient-to-r from-[#5eead4] to-[#a78bfa]"
                            style={{ width: `${Number(w) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-[10px] border border-[#5eead4]/[0.18] bg-gradient-to-br from-[#0d9488]/10 to-[#5eead4]/[0.04] p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#5eead4]">
                        Agents
                      </span>
                      <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#5eead4] text-[#0a0d12] text-[10.5px] font-extrabold grid place-items-center">
                        2
                      </span>
                    </div>
                    {[
                      ['Recall', '2 new insights ready', '#10b981'],
                      ['Curator', 'Watching your graph', '#10b981'],
                      ['Decision', 'Ask about this page', '#60a5fa'],
                    ].map(([name, sub, dot]) => (
                      <div
                        key={String(name)}
                        className="flex gap-2.5 py-1.5 border-b border-white/[0.04] last:border-0"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full mt-[7px] flex-shrink-0"
                          style={{ background: String(dot) }}
                        />
                        <div>
                          <div className="text-[12px] font-semibold text-white/85">{name}</div>
                          <div className="text-[11px] text-white/50">{sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p className="text-[12px] text-[var(--muted-2)] mt-4 text-center">
            Illustrative mock-up of the shipped surfaces — example topics, not anyone&rsquo;s data.
          </p>
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────────── */}
      <section id="how" className="py-24 border-t border-[var(--border)] bg-[var(--surface)]/40">
        <div className="max-w-6xl mx-auto px-6">
          <p className="eyebrow text-[var(--accent)] mb-3">How it works</p>
          <h2 className="section-title mb-5">
            Browse like you always do. That&rsquo;s the whole job.
          </h2>
          <p className="text-[var(--muted)] mb-12 max-w-2xl leading-relaxed">
            No tagging, no filing, no maintenance. Attention in, useful things out.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                step: '1',
                title: 'Capture',
                desc: 'Dwell on a page for ten seconds and the extension records a signal — the topic, not the keystrokes. Or share a link from your phone.',
              },
              {
                step: '2',
                title: 'Graph',
                desc: 'Signals become a weighted map of your interests: what you care about, how strongly, and how it connects across platforms.',
              },
              {
                step: '3',
                title: 'Agents',
                desc: 'The five agents work the graph in the background — through the Guardian gate, within your budget, on your terms.',
              },
              {
                step: '4',
                title: 'Surfaces',
                desc: 'Results reach you where you already are: cards on the page, your inbox, the mind map, or a weekly digest.',
              },
            ].map((item) => (
              <div key={item.step} className="card p-6">
                <div className="w-9 h-9 rounded-lg grid place-items-center text-sm font-black mb-4 bg-[var(--accent-soft)] border border-[var(--accent-border)] text-[var(--accent-ink)]">
                  {item.step}
                </div>
                <h3 className="text-base font-bold mb-2 text-[var(--ink)]">{item.title}</h3>
                <p className="text-[13.5px] text-[var(--muted)] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST ──────────────────────────────────────────────────── */}
      <section id="trust" className="py-24 border-t border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-6">
          <p className="eyebrow text-[var(--accent)] mb-3">The rules we can&rsquo;t break</p>
          <h2 className="section-title mb-5 max-w-3xl">
            Attention data demands stricter rules. Ours are enforced in code.
          </h2>
          <p className="text-[var(--muted)] mb-12 max-w-2xl leading-relaxed">
            These five constraints are product law — they ship as code paths, not promises. Read the
            full detail in our{' '}
            <Link href="/privacy" className="text-[var(--accent)] hover:underline">
              privacy commitments
            </Link>
            .
          </p>

          <ol className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TRUST.map((t, i) => (
              <li key={t.title} className="card p-6 flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-lg grid place-items-center font-mono text-sm font-bold bg-[var(--accent-soft)] border border-[var(--accent-border)] text-[var(--accent-ink)]">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-[15px] font-bold mb-1.5 text-[var(--ink)]">{t.title}</h3>
                  <p className="text-[13.5px] text-[var(--muted)] leading-relaxed">{t.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── DEVELOPERS ─────────────────────────────────────────────── */}
      <section className="py-24 border-t border-[var(--border)] bg-[var(--surface)]/40">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-10 items-start">
            <div>
              <p className="eyebrow text-[var(--accent)] mb-3">For developers</p>
              <h2 className="section-title mb-5">
                Your app cold-starts on every user. One API call fixes that.
              </h2>
              <p className="text-[var(--muted)] mb-6 leading-relaxed">
                The same engine, as infrastructure: send your users&rsquo; signals to{' '}
                <span className="font-mono text-[13px] text-[var(--accent)]">/v1</span>, read back
                structured interests and research trails. Tenant-isolated by construction — your
                users&rsquo; graphs are built only from what your app sends, never from anyone
                else&rsquo;s data.
              </p>
              <ul className="text-sm text-[var(--muted)] space-y-2.5 mb-8">
                {[
                  'Typed signals in, weighted trails and intents out',
                  'Per-signal validation — one bad record never rejects the batch',
                  'Metered quotas, usage endpoint, OpenAPI docs at /v1/docs',
                  'GDPR delete for any of your users with a single call',
                ].map((li) => (
                  <li key={li} className="flex gap-2.5">
                    <span className="text-[var(--accent)] flex-shrink-0">→</span>
                    {li}
                  </li>
                ))}
              </ul>
              <Link href="/sdk" className="btn btn-secondary">
                Read the API docs
              </Link>
            </div>

            <div className="card overflow-hidden">
              <div className="px-4 py-3 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center gap-3 font-mono text-[12px] text-[var(--muted-2)]">
                <span className="w-2 h-2 rounded-full bg-[var(--success)] pulse-dot" />
                <span className="font-bold text-[var(--accent)]">POST</span>
                <span>https://api.recome.app/v1/signals</span>
              </div>
              <pre className="p-5 font-mono text-[12.5px] leading-[1.7] overflow-x-auto text-[var(--ink-2)]">
                <span className="text-[var(--muted-2)]">{`# Your API key + your user's id — that's the whole setup.`}</span>
                {`\ncurl -X POST https://api.recome.app/v1/signals \\\n  -H `}
                <span className="text-[var(--accent)]">{`"Authorization: Bearer rk_live_…"`}</span>
                {` \\\n  -H `}
                <span className="text-[var(--accent)]">{`"X-User-Id: user_42"`}</span>
                {` \\\n  -d `}
                <span className="text-[var(--accent)]">{`'{"signals":[{"kind":"view",
      "pageUrl":"https://youtube.com/watch?v=…",
      "platform":"youtube",
      "topics":[{"name":"standing desks"}]}]}'`}</span>
                {`\n\n`}
                <span className="text-[var(--muted-2)]">{`# → 200 { ok, accepted: 1, results: [...],
#          rejected: [], retryable: [] }`}</span>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────── */}
      <section className="py-28 border-t border-[var(--border)]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight mb-6 text-balance">
            Start your <span className="grad">interest graph</span>.
          </h2>
          <p className="text-[var(--muted)] mb-10 max-w-xl mx-auto text-base sm:text-lg leading-relaxed">
            Free while in beta. Sign up, add the extension, and keep browsing — the first thing it
            brings back is usually something you&rsquo;d already forgotten.
          </p>
          <div className="flex gap-3.5 justify-center flex-wrap">
            <Link href="/signup" className="btn btn-primary !px-8 !py-4">
              Create an account
            </Link>
            <Link href="/extension" className="btn btn-secondary">
              Get the extension
            </Link>
          </div>
          <p className="text-xs text-[var(--muted-2)] mt-6">
            Web app · installable PWA · Chromium extension · share from iOS &amp; Android
          </p>
        </div>
      </section>
    </>
  );
}
