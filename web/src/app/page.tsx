import Link from 'next/link';

export default function Home() {
  return (
    <>
      {/* HERO */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        <div className="glow w-[700px] h-[700px] bg-[#2356e8] -top-[200px] -left-[150px] absolute" />
        <div className="glow w-[500px] h-[500px] bg-[#10b981] -bottom-[100px] -right-[100px] absolute" />
        <div className="glow w-[300px] h-[300px] bg-[#7c3aed] top-[30%] right-[20%] absolute" />

        <div className="relative z-10 max-w-[820px] mx-auto px-6 pt-28 pb-20">
          <div className="inline-flex items-center gap-2 bg-white/[0.06] border border-white/[0.12] rounded-full px-4 py-1.5 text-xs font-bold tracking-widest uppercase text-white/50 mb-7">
            Now in Beta <span className="text-[#5eead4]">Free</span>
          </div>

          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black leading-[1.0] tracking-tighter mb-6">
            Your <span className="grad">Research</span>,<br />
            Connected.
          </h1>

          <p className="text-lg text-white/55 max-w-[600px] leading-relaxed mb-11">
            RecoMe remembers what you research across YouTube, Reddit, and Amazon — then shows you
            why a product matches what you care about. All on your device. Nothing shared.
          </p>

          <div className="flex gap-3.5 flex-wrap mb-16">
            <Link
              href="/extension"
              className="bg-white text-[var(--ink)] px-7 py-3.5 rounded-xl font-bold text-[15px] hover:bg-white/90 transition-colors"
            >
              Install Extension
            </Link>
            <a
              href="#how"
              className="border border-white/25 px-7 py-3.5 rounded-xl font-semibold text-[15px] hover:bg-white/5 transition-colors"
            >
              See How It Works
            </a>
          </div>

          {/* Product cards */}
          <div className="flex gap-3 flex-wrap">
            <Link
              href="/extension"
              className="group flex items-center gap-2.5 bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 hover:bg-white/[0.09] transition-all hover:-translate-y-0.5"
            >
              <span className="text-lg">🧩</span>
              <div>
                <div className="text-[13px] font-bold">Extension</div>
                <div className="text-[11px] text-white/40">Available Now</div>
              </div>
            </Link>
            <Link
              href="/sdk"
              className="group flex items-center gap-2.5 bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 hover:bg-white/[0.09] transition-all hover:-translate-y-0.5"
            >
              <span className="text-lg">⚙️</span>
              <div>
                <div className="text-[13px] font-bold">SDK</div>
                <div className="text-[11px] text-white/40">Coming Soon</div>
              </div>
            </Link>
            <Link
              href="/agents"
              className="group flex items-center gap-2.5 bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 hover:bg-white/[0.09] transition-all hover:-translate-y-0.5"
            >
              <span className="text-lg">🤖</span>
              <div>
                <div className="text-[13px] font-bold">AI Agents</div>
                <div className="text-[11px] text-white/40">Coming Soon</div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* WHY RECOME */}
      <section className="py-24 border-t border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs font-bold tracking-widest uppercase text-[#5eead4] mb-3">
            Why RecoMe
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-12">
            The internet knows what you clicked.
            <br />
            <span className="text-white/40">RecoMe knows what you actually care about.</span>
          </h2>

          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                icon: '🔍',
                title: 'Cross-Platform Memory',
                desc: 'Watch a YouTube review, read a Reddit thread, browse Amazon — RecoMe connects them into one research trail.',
              },
              {
                icon: '🔒',
                title: '100% Private',
                desc: 'All data stays on your device. No tracking servers. No profiles sold. Export or delete everything with one click.',
              },
              {
                icon: '🧠',
                title: 'Smart, Not Noisy',
                desc: 'RecoMe learns your priorities silently. No surveys, no setup walls. It gets better the more you browse.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-6"
              >
                <div className="text-2xl mb-3">{item.icon}</div>
                <h3 className="text-[15px] font-bold mb-2">{item.title}</h3>
                <p className="text-[13px] text-white/45 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="py-24 border-t border-white/[0.08]">
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
                title: 'Research on YouTube',
                desc: 'Watch product reviews, comparisons, and tutorials. RecoMe quietly notes what topics you explore — "noise-cancelling headphones", "USB-C monitors", etc.',
              },
              {
                step: '02',
                icon: 'R',
                title: 'Read opinions on Reddit',
                desc: 'Browse r/BuyItForLife, r/headphones, or any subreddit. RecoMe captures discussion themes, recommendations, and warnings from the threads you read.',
              },
              {
                step: '03',
                icon: '📦',
                title: 'Decide on Amazon',
                desc: 'When you land on a product page, RecoMe shows a "Research Detected" card — connecting your YouTube and Reddit research to this specific product.',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="flex gap-4 items-start bg-white/[0.03] border border-white/[0.08] rounded-xl p-5"
              >
                <div className="text-2xl flex-shrink-0 w-10 h-10 rounded-lg bg-white/[0.06] flex items-center justify-center text-sm font-bold">
                  {item.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold text-[#5eead4] tracking-wider">
                      STEP {item.step}
                    </span>
                  </div>
                  <h3 className="text-[15px] font-bold mb-1">{item.title}</h3>
                  <p className="text-[13px] text-white/45 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 border-t border-white/[0.08]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Ready to connect your research?
          </h2>
          <p className="text-white/50 mb-8 max-w-lg mx-auto">
            Install the free browser extension. No account required to start — RecoMe works locally
            from day one.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              href="/extension"
              className="bg-white text-[var(--ink)] px-7 py-3.5 rounded-xl font-bold text-[15px] hover:bg-white/90 transition-colors"
            >
              Install Extension
            </Link>
            <Link
              href="/signup"
              className="border border-white/25 px-7 py-3.5 rounded-xl font-semibold text-[15px] hover:bg-white/5 transition-colors"
            >
              Create Account
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-10 border-t border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between text-xs text-white/30">
          <span>RecoMe {new Date().getFullYear()}</span>
          <div className="flex gap-4">
            <Link href="/extension" className="hover:text-white/60">
              Extension
            </Link>
            <Link href="/sdk" className="hover:text-white/60">
              SDK
            </Link>
            <Link href="/agents" className="hover:text-white/60">
              Agents
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}
