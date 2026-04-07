import Link from 'next/link';

const CWS_URL = 'https://chromewebstore.google.com/detail/recome/fgpjboodmfnjbpdmbapjjjbfkflhbkcf';

export default function Home() {
  return (
    <>
      {/* ── HERO ───────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        <div className="glow w-[700px] h-[700px] bg-[#2356e8] -top-[200px] -left-[150px] absolute" />
        <div className="glow w-[500px] h-[500px] bg-[#10b981] -bottom-[100px] -right-[100px] absolute" />
        <div className="glow w-[300px] h-[300px] bg-[#7c3aed] top-[30%] right-[20%] absolute" />

        <div className="relative z-10 max-w-[860px] mx-auto px-6 pt-28 pb-20">
          <div className="inline-flex items-center gap-2 bg-white/[0.06] border border-white/[0.12] rounded-full px-4 py-1.5 text-xs font-bold tracking-widest uppercase text-white/50 mb-7">
            Now in Beta <span className="text-[#5eead4]">Free</span>
          </div>

          <h1 className="text-5xl sm:text-7xl lg:text-[86px] font-black leading-[1.0] tracking-[-3px] mb-6">
            Your <span className="grad">Research</span>,<br />
            Connected.
          </h1>

          <p className="text-lg text-white/[0.52] max-w-[620px] leading-relaxed mb-10">
            A browser extension that observes your research across YouTube, Reddit, and Amazon —
            builds a private interest graph entirely on your device — and surfaces insights that
            platform algorithms never will.
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
              href="#how"
              className="border border-white/[0.22] px-7 py-3.5 rounded-xl font-semibold text-[15px] hover:bg-white/[0.06] transition-all"
            >
              See How It Works
            </a>
          </div>

          {/* Stat row */}
          <div className="flex gap-4 flex-wrap">
            {[
              { value: '9+', label: 'Platforms supported', color: '#93b4fd' },
              { value: '<15ms', label: 'Filter decision time', color: '#5eead4' },
              { value: '0', label: 'Server calls — all local', color: '#6ee7b7' },
              { value: 'Free', label: 'No credit card needed', color: '#fcd34d' },
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

      {/* ── WHAT IT DOES ───────────────────────────────────────────── */}
      <section className="py-24 border-t border-white/[0.08] bg-white/[0.015]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs font-bold tracking-widest uppercase text-[#93b4fd] mb-3">
            Core Capabilities
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">What RecoMe Does</h2>
          <p className="text-white/[0.48] mb-10 max-w-2xl">
            Four interconnected systems that run entirely in the browser — no data ever leaves your
            device.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                icon: '🧠',
                title: 'Feed Intelligence',
                desc: 'Filters content across 9+ platforms based on your personal preference graph — not keyword blocklists. The filter learns what you genuinely care about.',
                detail:
                  'Amazon · YouTube · Reddit · Twitter · Instagram · Facebook · LinkedIn · eBay · Walmart',
              },
              {
                icon: '🕸️',
                title: 'Interest Graph Builder',
                desc: 'Every scroll, click, and dwell time writes to a weighted entity graph stored locally. Entities are connected by typed edges that decay or strengthen over time.',
                detail: 'e.g. interested_in[headphones, w:0.91] · blocked[crypto, w:0.95]',
              },
              {
                icon: '💡',
                title: 'Inline Insights',
                desc: 'OpportunityRanker scores every item on the current page and surfaces the top insights as non-intrusive inline cards — directly in the platform you are browsing.',
                detail: 'Signals: relevance · evidence quality · urgency · novelty',
              },
              {
                icon: '🔄',
                title: 'Cross-Platform Memory',
                desc: 'One interest graph spans all platforms. A preference learned from YouTube reviews affects Amazon product recommendations. Research is never siloed.',
                detail: 'Graph sync: device-local · optional encrypted backup · never sold',
              },
            ].map((f) => (
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

      {/* ── WHO IT IS FOR ──────────────────────────────────────────── */}
      <section className="py-24 border-t border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs font-bold tracking-widest uppercase text-[#93b4fd] mb-3">
            Built For
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-10">
            People who care about what they consume.
          </h2>

          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                emoji: '💼',
                label: 'Power User',
                name: 'The Researcher',
                sub: 'Follows 200+ sources across 5 platforms',
                desc: 'Watches product reviews on YouTube, reads threads on Reddit, then shops on Amazon. Needs one brain that connects it all.',
                pain: 'Pain: Platforms forget your context the moment you leave.',
              },
              {
                emoji: '🛒',
                label: 'Smart Shopper',
                name: 'The Deal Hunter',
                sub: 'Compares across Amazon, eBay, Walmart',
                desc: 'Wants to know why a product matches their research — not just that it is "recommended" by an algorithm optimizing for ad revenue.',
                pain: 'Pain: Endless tabs, no memory of what you already checked.',
              },
              {
                emoji: '🔒',
                label: 'Privacy Advocate',
                name: 'The Local-First User',
                sub: 'Zero-server, zero-tracking browsing',
                desc: 'Wants intelligent recommendations without giving data to cloud services. All processing on-device, all data exportable and deletable.',
                pain: 'Pain: Every "personalization" tool is actually a data pipeline.',
              },
            ].map((p) => (
              <div
                key={p.name}
                className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6"
              >
                <div className="text-[11px] font-bold tracking-widest uppercase text-[#2356e8] mb-3.5">
                  {p.label}
                </div>
                <div className="w-12 h-12 rounded-xl bg-[#2356e8]/[0.15] border border-[#2356e8]/25 flex items-center justify-center text-2xl mb-3.5">
                  {p.emoji}
                </div>
                <h4 className="text-base font-bold mb-1">{p.name}</h4>
                <p className="text-[13px] text-white/[0.35] mb-3.5">{p.sub}</p>
                <p className="text-[13px] text-white/50 leading-relaxed">{p.desc}</p>
                <div className="mt-3.5 pt-3.5 border-t border-white/[0.08] text-xs text-white/[0.3]">
                  {p.pain}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────────── */}
      <section id="how" className="py-24 border-t border-white/[0.08] bg-white/[0.015]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs font-bold tracking-widest uppercase text-[#5eead4] mb-3">
            How It Works
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-12">
            Three platforms. One research trail.
          </h2>

          <div className="flex flex-col gap-4">
            {[
              {
                step: '01',
                icon: '▶',
                color: '#ef4444',
                title: 'Research on YouTube',
                desc: 'Watch product reviews, comparisons, and tutorials. RecoMe quietly notes what topics you explore — "noise-cancelling headphones", "USB-C monitors", "standing desks".',
                result: 'Graph updated: interested_in[headphones] strength +0.3',
                resultColor: 'bg-[#2356e8]/[0.08] border-[#2356e8]/20',
              },
              {
                step: '02',
                icon: 'R',
                color: '#ff4500',
                title: 'Read opinions on Reddit',
                desc: 'Browse r/BuyItForLife, r/headphones, or any subreddit. RecoMe captures discussion themes, recommendations, and warnings from the threads you read.',
                result: 'Research signal: "Sony XM5 recommended over Bose" from r/headphones',
                resultColor: 'bg-[#5eead4]/[0.07] border-[#5eead4]/20',
              },
              {
                step: '03',
                icon: '📦',
                color: '#ff9900',
                title: 'Decide on Amazon',
                desc: 'When you land on a product page, RecoMe shows a "Research Detected" card — connecting your YouTube reviews and Reddit opinions to this specific product.',
                result:
                  'Research Detected: Strong match — 3 signals across 2 platforms for "headphones"',
                resultColor: 'bg-[#2356e8]/[0.08] border-[#2356e8]/20',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6"
              >
                <div className="flex gap-4 items-start">
                  <div
                    className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold border"
                    style={{
                      background: `${item.color}15`,
                      borderColor: `${item.color}30`,
                      color: item.color,
                    }}
                  >
                    {item.icon}
                  </div>
                  <div className="flex-1">
                    <span className="text-[11px] font-bold text-[#5eead4] tracking-wider">
                      STEP {item.step}
                    </span>
                    <h3 className="text-base font-bold mt-1 mb-2">{item.title}</h3>
                    <p className="text-sm text-white/[0.48] leading-relaxed">{item.desc}</p>
                    <div className={`mt-4 rounded-xl border p-4 ${item.resultColor}`}>
                      <div className="text-[11px] font-bold tracking-widest uppercase text-[#93b4fd] mb-1">
                        Result
                      </div>
                      <p className="text-sm text-white/[0.65] leading-relaxed">{item.result}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRIVACY ────────────────────────────────────────────────── */}
      <section className="py-24 border-t border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs font-bold tracking-widest uppercase text-[#10b981] mb-3">
            Privacy First
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-10">
            Your data stays on your device.
            <br />
            <span className="text-white/40">Period.</span>
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                icon: '💾',
                title: 'Local Storage Only',
                desc: 'All data stored in your browser. Nothing uploaded.',
              },
              {
                icon: '🔐',
                title: 'Encrypted Keys',
                desc: 'API keys encrypted at rest using AES-256-GCM.',
              },
              {
                icon: '📤',
                title: 'One-Click Export',
                desc: 'Export all your data as JSON. Delete everything instantly.',
              },
              {
                icon: '🚫',
                title: 'No Tracking',
                desc: 'Zero analytics. Zero telemetry. Zero server calls for scoring.',
              },
            ].map((p) => (
              <div
                key={p.title}
                className="bg-[#10b981]/[0.06] border border-[#10b981]/[0.15] rounded-2xl p-5"
              >
                <div className="text-xl mb-3">{p.icon}</div>
                <h3 className="text-sm font-bold mb-1.5">{p.title}</h3>
                <p className="text-xs text-white/[0.48] leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRODUCTS ───────────────────────────────────────────────── */}
      <section className="py-24 border-t border-white/[0.08] bg-white/[0.015]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs font-bold tracking-widest uppercase text-white/40 mb-3">
            Ecosystem
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-10">
            Three products. One intelligence.
          </h2>

          <div className="grid sm:grid-cols-3 gap-4">
            <Link
              href="/extension"
              className="bg-[#2356e8]/[0.08] border border-[#2356e8]/25 rounded-2xl p-6 hover:bg-[#2356e8]/[0.12] transition-colors group"
            >
              <div className="text-2xl mb-3">🧩</div>
              <h3 className="text-base font-bold mb-1">Browser Extension</h3>
              <p className="text-[13px] text-white/50 leading-relaxed mb-3">
                The core product. Research context across 9+ platforms, entirely on your device.
              </p>
              <span className="text-xs font-bold text-[#93b4fd] group-hover:underline">
                Available Now →
              </span>
            </Link>

            <Link
              href="/sdk"
              className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 hover:bg-white/[0.05] transition-colors"
            >
              <div className="text-2xl mb-3">⚙️</div>
              <h3 className="text-base font-bold mb-1">SDK</h3>
              <p className="text-[13px] text-white/50 leading-relaxed mb-3">
                Embed preference intelligence into your own product via a simple API.
              </p>
              <span className="text-xs font-semibold text-white/30">Coming 2026</span>
            </Link>

            <Link
              href="/agents"
              className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 hover:bg-white/[0.05] transition-colors"
            >
              <div className="text-2xl mb-3">🤖</div>
              <h3 className="text-base font-bold mb-1">AI Agents</h3>
              <p className="text-[13px] text-white/50 leading-relaxed mb-3">
                Six specialized agents — standalone API for shopping, research, and privacy
                auditing.
              </p>
              <span className="text-xs font-semibold text-white/30">Coming 2026</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────── */}
      <section className="py-24 border-t border-white/[0.08]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Stop letting algorithms decide for you.
          </h2>
          <p className="text-white/50 mb-8 max-w-lg mx-auto">
            Install the free browser extension. No account required to start — RecoMe works locally
            from day one.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <a
              href={CWS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white text-[var(--ink)] px-8 py-4 rounded-xl font-bold text-[15px] hover:opacity-[0.88] transition-opacity"
            >
              Add to Chrome — Free
            </a>
            <Link
              href="/signup"
              className="border border-white/25 px-7 py-3.5 rounded-xl font-semibold text-[15px] hover:bg-white/5 transition-colors"
            >
              Create Account
            </Link>
          </div>
          <p className="text-xs text-white/25 mt-5">
            Works with Chrome, Edge, Brave, Arc, and other Chromium browsers
          </p>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────── */}
      <footer className="py-10 border-t border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/30">
          <span>RecoMe {new Date().getFullYear()} — Your research, connected.</span>
          <div className="flex gap-5">
            <Link href="/extension" className="hover:text-white/60 transition-colors">
              Extension
            </Link>
            <Link href="/sdk" className="hover:text-white/60 transition-colors">
              SDK
            </Link>
            <Link href="/agents" className="hover:text-white/60 transition-colors">
              Agents
            </Link>
            <Link href="/login" className="hover:text-white/60 transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}
