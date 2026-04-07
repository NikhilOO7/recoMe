import Link from 'next/link';

const CWS_URL = 'https://chromewebstore.google.com/detail/recome/fgpjboodmfnjbpdmbapjjjbfkflhbkcf';

const FEATURES = [
  {
    icon: '🧠',
    title: 'Feed Intelligence',
    desc: 'Filters content across 9+ platforms based on your personal preference graph — not keyword blocklists. Learns what you genuinely care about and dims everything else.',
    detail:
      'Powered by a local-only weighted entity graph with typed edges and time-decaying weights.',
  },
  {
    icon: '🔍',
    title: 'Research Detected Cards',
    desc: 'When you land on an Amazon product page, see a contextual card showing how this product relates to your prior YouTube reviews and Reddit discussions.',
    detail:
      'Cross-platform research signals are matched by topic similarity, recency, and confidence.',
  },
  {
    icon: '🤖',
    title: '6 AI Agents',
    desc: 'FilterAgent, ScoutAgent, ShopperAgent, AdvisorAgent, SocialAgent, and GuardianAgent work together to personalize your experience.',
    detail:
      'Each agent has specialized scoring, can be queried via chat, and attributes every insight.',
  },
  {
    icon: '💬',
    title: 'Agent Chat',
    desc: 'Ask the agent to compare products, explain why something was recommended, show your research trail, or manage your watchlist.',
    detail: 'Supports Anthropic Claude, OpenAI GPT, and Google Gemini — your key, your choice.',
  },
  {
    icon: '📊',
    title: 'Interest Graph Inspector',
    desc: 'See exactly what RecoMe knows about you — top interests, blocked topics, entity relationships, weight changes over time, and recent signals.',
    detail: 'Full graph summary with entity breakdown, weight bars, and platform attribution.',
  },
  {
    icon: '🔒',
    title: 'Privacy-First Architecture',
    desc: 'All data stored locally in your browser. API keys encrypted at rest with AES-256-GCM. One-click export. One-click delete. Zero server calls for scoring.',
    detail: 'Optional E2E encrypted cloud sync — even the server cannot read your data.',
  },
];

const PLATFORMS = [
  { name: 'Amazon', icon: '📦', desc: 'Product pages, search, deals' },
  { name: 'YouTube', icon: '▶', desc: 'Videos, Shorts, channels' },
  { name: 'Reddit', icon: 'R', desc: 'Posts, comments, subreddits' },
  { name: 'eBay', icon: '🛍', desc: 'Listings, deals, search' },
  { name: 'Walmart', icon: 'W', desc: 'Products, Flash Deals' },
  { name: 'X / Twitter', icon: '𝕏', desc: 'Timeline, Explore, lists' },
  { name: 'Facebook', icon: '𝔽', desc: 'Feed, Marketplace, groups' },
  { name: 'Instagram', icon: '📸', desc: 'Feed, Reels, Explore' },
  { name: 'LinkedIn', icon: 'in', desc: 'Feed, jobs, search' },
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
      'RecoMe shows: "Research Detected — 3 signals across 2 platforms. Strong match with your headphone research."',
    resultColor: 'bg-[#2356e8]/[0.08] border-[#2356e8]/20 text-[#93b4fd]',
  },
  {
    scenario: 'Career Research',
    icon: '💼',
    steps: [
      { platform: 'YouTube', action: 'Watch "Day in the life of a data engineer" videos' },
      { platform: 'Reddit', action: 'Browse r/dataengineering salary threads' },
      { platform: 'LinkedIn', action: 'See a data engineering job posting' },
    ],
    result:
      'RecoMe connects: "You have been researching data engineering across YouTube and Reddit. This role matches your research trail."',
    resultColor: 'bg-[#5eead4]/[0.07] border-[#5eead4]/20 text-[#5eead4]',
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
            Browser Extension
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-[-3px] leading-[1.0] mb-6">
            Your Feed.
            <br />
            <span className="grad">Filtered by You.</span>
          </h1>

          <p className="text-lg text-white/[0.52] max-w-[620px] leading-relaxed mb-10">
            A browser extension that observes 9+ platforms, builds a private interest graph entirely
            on-device, and surfaces inline insights that platform algorithms never will — because
            they serve the platform, not you.
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
              { value: '9+', label: 'Platforms supported', color: '#93b4fd' },
              { value: '<15ms', label: 'Filter decision time', color: '#5eead4' },
              { value: '0', label: 'Server calls — all local', color: '#6ee7b7' },
              { value: 'Freemium', label: 'Pricing model', color: '#fcd34d' },
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
            What the Extension Does
          </h2>
          <p className="text-white/[0.48] mb-10 max-w-2xl">
            Six interconnected systems that run entirely in the browser — no data ever leaves your
            device.
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
            Works on the sites you already use.
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">
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

          <div className="grid lg:grid-cols-2 gap-6">
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
            Free. No account required to start. Works with Chrome, Edge, Brave, Arc, and other
            Chromium browsers.
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
            v1.2.0 &middot; Manifest V3 &middot; Open source &middot; 500 KB
          </p>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────── */}
      <footer className="py-10 border-t border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/30">
          <span>RecoMe {new Date().getFullYear()}</span>
          <div className="flex gap-5">
            <Link href="/" className="hover:text-white/60 transition-colors">
              Home
            </Link>
            <Link href="/sdk" className="hover:text-white/60 transition-colors">
              SDK
            </Link>
            <Link href="/agents" className="hover:text-white/60 transition-colors">
              Agents
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}
