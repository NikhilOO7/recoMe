// Link import removed — footer is now in layout

const CWS_URL = 'https://chromewebstore.google.com/detail/recome/fgpjboodmfnjbpdmbapjjjbfkflhbkcf';

const FEATURES = [
  {
    icon: '⌖',
    title: 'Passive Capture',
    desc: 'Watches your browsing on 15 platforms and feeds the cross-platform topics you research into your interest graph. No notes to take, no clicks to make.',
    detail:
      'Page-level dwell (10s) + search-bar reads. Signals batch-uploaded to cloud Neo4j; nothing persists in the browser beyond an offline IDB queue.',
  },
  {
    icon: '◆',
    title: 'Per-Card Scoring',
    desc: 'Every product on Amazon, every video on YouTube, every post on Reddit gets a coloured badge — relevant, neutral, caution, or filtered — grounded in your graph.',
    detail:
      'POST /intelligence/score/cards returns a verdict and a reasoning string per card; reasoning callout reveals on hover.',
  },
  {
    icon: '↻',
    title: 'Recall',
    desc: 'When you re-encounter a topic on a new platform, Recall surfaces the relevant captures you forgot — the Verge review you bookmarked three weeks ago, the Reddit thread from last month.',
    detail:
      'Triangular age-factor × signal-weight ranking. Hard cap of 2 notifications per week per user.',
  },
  {
    icon: '$',
    title: 'Concierge on Commerce',
    desc: 'Land on an Amazon, eBay, or Walmart product page and Concierge price-checks across retailers, surfaces alternatives matching your revealed criteria, and pulls fresh reviews.',
    detail: 'Recommends only — never transacts. Add explicit watches via the /ask Watchlist panel.',
  },
  {
    icon: '★',
    title: 'Curator + Curriculum',
    desc: 'Curator brings fresh content on topics you have been quiet on; Curriculum builds a four-week reading plan that bridges from what you already know to what you want to learn.',
    detail:
      'Curator: scheduled 1×/day, surfaces from the sidebar. Curriculum: on-demand from Udemy / Coursera / edX overlays.',
  },
  {
    icon: '?',
    title: 'Ask Decision — Anywhere',
    desc: 'Open the in-page chat from the sidebar and ask Decision about the page you are on. Multi-turn, grounded in your graph, cites every signal it draws from.',
    detail:
      'Decision agent on-demand. Pulls top intents matching topic + entity hints from the active platform capture.',
  },
];

const PLATFORMS = [
  { name: 'Amazon', icon: '📦', desc: 'PDP, search · per-card badges' },
  { name: 'YouTube', icon: '▶', desc: 'Watch, home, search' },
  { name: 'Reddit', icon: 'R', desc: 'Posts, feed · auto Recall' },
  { name: 'eBay', icon: '🛍', desc: 'Listings · Concierge' },
  { name: 'Walmart', icon: 'W', desc: 'Products · Concierge' },
  { name: 'X / Twitter', icon: '𝕏', desc: 'Tweet capture' },
  { name: 'Facebook', icon: '𝔽', desc: 'Light capture' },
  { name: 'Instagram', icon: '📸', desc: 'Posts + Reels' },
  { name: 'TikTok', icon: '♪', desc: 'Video descriptions' },
  { name: 'LinkedIn', icon: 'in', desc: 'Jobs, companies' },
  { name: 'Indeed', icon: '◯', desc: 'Job postings' },
  { name: 'Glassdoor', icon: 'G', desc: 'Job + company pages' },
  { name: 'Udemy', icon: '🎓', desc: 'Courses · Curriculum' },
  { name: 'Coursera', icon: 'C', desc: 'Courses · Curriculum' },
  { name: 'edX', icon: 'X', desc: 'Courses · Curriculum' },
];

const USE_CASES = [
  {
    scenario: 'Shopping Research',
    icon: '🛒',
    steps: [
      { platform: 'YouTube', action: 'Watch "Best noise-cancelling headphones 2026" review' },
      { platform: 'Reddit', action: 'Read r/headphones thread comparing Sony vs Bose' },
      { platform: 'Amazon', action: 'Land on Sony XM5 product page' },
    ],
    result:
      'Concierge fires within 2 seconds: "Three weeks ago a YouTube reviewer flagged the bearings on this model. There is a $200-cheaper alternative on Walmart that matched your revealed criteria — open the comparison?"',
    resultColor: 'bg-[#2356e8]/[0.08] border-[#2356e8]/20 text-[#93b4fd]',
  },
  {
    scenario: 'Career Research',
    icon: '💼',
    steps: [
      { platform: 'YouTube', action: 'Watch "Day in the life of a data engineer" videos' },
      { platform: 'Reddit', action: 'Browse r/dataengineering salary threads' },
      { platform: 'LinkedIn', action: 'See a data-engineering job posting' },
    ],
    result:
      'Sidebar shows the role anchored in your graph; Recall surfaces the salary thread; Curator finds fresher posts on the same topic. Click Ask Decision for a citation-grounded "should I apply?" walkthrough.',
    resultColor: 'bg-[#5eead4]/[0.07] border-[#5eead4]/20 text-[#5eead4]',
  },
  {
    scenario: 'Curriculum from a Course Page',
    icon: '🎓',
    steps: [
      { platform: 'Udemy', action: 'Land on a "Climate-adaptation policy" course page' },
      { platform: 'Sidebar', action: 'Click "Build curriculum" — type the topic' },
      { platform: 'Inbox', action: 'Curriculum emits a 4-week plan anchored in your graph' },
    ],
    result:
      'Week 1 references an essay from a Substack you already read; week 2 bridges into the new topic via something you understand; week 4 is a Synthesist summary of what you learned.',
    resultColor: 'bg-[#fb7185]/[0.07] border-[#fb7185]/25 text-[#fb7185]',
  },
];

export default function ExtensionPage() {
  return (
    <>
      {/* ── HERO ───────────────────────────────────────────────────── */}
      <section className="relative pt-28 pb-20 overflow-hidden">
        <div className="glow w-[600px] h-[600px] bg-[#2356e8] -top-[200px] -left-[100px] absolute" />
        <div className="glow w-[400px] h-[400px] bg-[#7c3aed] bottom-0 right-0 absolute" />

        <div className="relative z-10 max-w-[860px] mx-auto px-6">
          <div className="inline-flex items-center gap-2 bg-[#2356e8]/[0.12] border border-[#2356e8]/25 rounded-full px-4 py-1.5 text-xs font-bold tracking-widest uppercase text-[#93b4fd] mb-6">
            <span className="w-2 h-2 rounded-full bg-[#2356e8]" />
            Browser Extension · v2.0
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-[-3px] leading-[1.0] mb-6">
            Your interest graph,
            <br />
            <span className="grad">working on its own.</span>
          </h1>

          <p className="text-lg text-white/[0.52] max-w-[620px] leading-relaxed mb-10">
            A browser extension that watches your research across 15 sites, builds your personal
            interest graph in the cloud, and surfaces what five background agents — Recall,
            Concierge, Curator, Decision, Curriculum — find for you while you browse.
          </p>

          <div className="flex gap-3.5 flex-wrap mb-14">
            <a
              href={CWS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white text-[var(--ink)] px-7 py-3.5 rounded-xl font-bold text-[15px] hover:opacity-[0.88] transition-opacity"
            >
              Add to Chrome — Free
            </a>
            <a
              href="#use-cases"
              className="border border-white/[0.22] px-7 py-3.5 rounded-xl font-semibold text-[15px] hover:bg-white/[0.06] transition-all"
            >
              See It In Action
            </a>
          </div>

          {/* Stat row */}
          <div className="flex gap-4 flex-wrap">
            {[
              { value: '15', label: 'Platforms supported', color: '#93b4fd' },
              { value: '5', label: 'Background agents', color: '#5eead4' },
              { value: '$0.10', label: 'Hard daily cost cap / user', color: '#6ee7b7' },
              { value: 'Open', label: 'Audit log of every run', color: '#fcd34d' },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-5 py-4 min-w-[120px]"
              >
                <div className="text-2xl font-black" style={{ color: s.color }}>
                  {s.value}
                </div>
                <div className="text-[11px] text-white/40 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ───────────────────────────────────────────────── */}
      <section className="py-24 border-t border-white/[0.08] bg-white/[0.015]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs font-bold tracking-widest uppercase text-[#93b4fd] mb-3">
            Core Capabilities
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            What the extension does
          </h2>
          <p className="text-white/[0.48] mb-10 max-w-2xl">
            A thin capture surface + an in-page render layer that talks to a cloud-side graph and
            agent runtime. No LLM keys in the browser. The graph is yours — exportable, deletable,
            audited.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-7 hover:bg-white/[0.065] transition-colors"
              >
                <div className="w-[42px] h-[42px] rounded-xl bg-[#2356e8]/[0.12] border border-[#2356e8]/20 flex items-center justify-center text-xl mb-4">
                  {f.icon}
                </div>
                <h3 className="text-base font-bold mb-2">{f.title}</h3>
                <p className="text-sm text-white/[0.48] leading-relaxed mb-3">{f.desc}</p>
                <p className="text-xs text-white/[0.28] font-mono leading-relaxed">{f.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLATFORMS ──────────────────────────────────────────────── */}
      <section className="py-24 border-t border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs font-bold tracking-widest uppercase text-[#5eead4] mb-3">
            Platform Coverage
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-10">
            15 sites. One graph.
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {PLATFORMS.map((p) => (
              <div
                key={p.name}
                className="flex flex-col items-center gap-2 bg-white/[0.03] border border-white/[0.08] rounded-xl py-5 px-2 hover:bg-white/[0.06] transition-colors"
              >
                <span className="text-2xl">{p.icon}</span>
                <span className="text-xs font-bold text-center">{p.name}</span>
                <span className="text-[10px] text-white/30 text-center leading-tight">
                  {p.desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── USE CASES ──────────────────────────────────────────────── */}
      <section id="use-cases" className="py-24 border-t border-white/[0.08] bg-white/[0.015]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs font-bold tracking-widest uppercase text-[#93b4fd] mb-3">
            In Action
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-10">
            Real workflows. Real context.
          </h2>

          <div className="grid lg:grid-cols-3 gap-6">
            {USE_CASES.map((uc) => (
              <div
                key={uc.scenario}
                className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6"
              >
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-2xl">{uc.icon}</span>
                  <h3 className="text-base font-bold">{uc.scenario}</h3>
                </div>

                <div className="flex flex-col gap-2.5 mb-5">
                  {uc.steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="text-[11px] font-bold text-[#5eead4] tracking-wider mt-0.5 flex-shrink-0 w-8">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <span className="text-xs font-bold text-white/60">{step.platform}:</span>{' '}
                        <span className="text-xs text-white/40">{step.action}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className={`rounded-xl border p-4 ${uc.resultColor}`}>
                  <div className="text-[11px] font-bold tracking-widest uppercase mb-1">
                    RecoMe Shows
                  </div>
                  <p className="text-sm text-white/[0.65] leading-relaxed">{uc.result}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── INSTALL CTA ────────────────────────────────────────────── */}
      <section className="py-24 border-t border-white/[0.08]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Install in seconds.
          </h2>
          <p className="text-white/50 mb-8 max-w-md mx-auto">
            Free. Sign in once on the web app and the extension picks up your session. Works in
            Chrome, Edge, Brave, Arc, and other Chromium browsers.
          </p>
          <a
            href={CWS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-white text-[var(--ink)] px-8 py-4 rounded-xl font-bold text-base hover:opacity-[0.88] transition-opacity"
          >
            Add to Chrome — Free
          </a>
          <p className="text-xs text-white/25 mt-5">
            v2.0.0 &middot; Manifest V3 &middot; Open source
          </p>
        </div>
      </section>

      {/* Footer provided by layout */}
    </>
  );
}
