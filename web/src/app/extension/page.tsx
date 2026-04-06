import Link from 'next/link';

const FEATURES = [
  {
    icon: '🔍',
    title: 'Cross-Platform Research',
    desc: 'YouTube reviews + Reddit threads + Amazon products — all connected in one research trail on your device.',
  },
  {
    icon: '📦',
    title: 'Research Detected Cards',
    desc: 'When you land on an Amazon product page, see exactly how it relates to your prior research across platforms.',
  },
  {
    icon: '🛡️',
    title: 'Privacy-First',
    desc: 'Everything stays on your device. API keys encrypted at rest. Export or delete all data with one click.',
  },
  {
    icon: '🧠',
    title: 'Smart Agents',
    desc: 'Six AI agents — FilterAgent, ScoutAgent, ShopperAgent, AdvisorAgent, SocialAgent, GuardianAgent — working together.',
  },
  {
    icon: '⚡',
    title: 'Works Everywhere',
    desc: 'Amazon, YouTube, Reddit, eBay, Walmart, X, Facebook, Instagram, LinkedIn — and more coming.',
  },
  {
    icon: '💬',
    title: 'Agent Chat',
    desc: 'Ask the agent to compare products, explain why something was recommended, or show your watchlist.',
  },
];

const PLATFORMS = [
  { name: 'Amazon', icon: '📦', status: 'Full support' },
  { name: 'YouTube', icon: '▶', status: 'Full support' },
  { name: 'Reddit', icon: 'R', status: 'Full support' },
  { name: 'eBay', icon: '🛍', status: 'Full support' },
  { name: 'Walmart', icon: 'W', status: 'Full support' },
  { name: 'X / Twitter', icon: '𝕏', status: 'Full support' },
  { name: 'Facebook', icon: '𝔽', status: 'Full support' },
  { name: 'Instagram', icon: '📸', status: 'Full support' },
  { name: 'LinkedIn', icon: 'in', status: 'Full support' },
];

export default function ExtensionPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative pt-28 pb-20 overflow-hidden">
        <div className="glow w-[600px] h-[600px] bg-[#2356e8] -top-[200px] -left-[100px] absolute" />
        <div className="glow w-[400px] h-[400px] bg-[#5eead4] bottom-0 right-0 absolute" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-[#2356e8]/10 border border-[#2356e8]/20 rounded-full px-4 py-1.5 text-xs font-bold tracking-widest uppercase text-[#2356e8] mb-6">
            🧩 Browser Extension
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tighter mb-5">
            Your research,
            <br />
            <span className="grad">always with you.</span>
          </h1>
          <p className="text-lg text-white/50 max-w-xl mx-auto mb-10 leading-relaxed">
            A lightweight Chrome extension that silently connects your research across YouTube,
            Reddit, and Amazon — then surfaces context exactly when you need it.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <a
              href="#install"
              className="bg-white text-[var(--ink)] px-7 py-3.5 rounded-xl font-bold text-[15px] hover:bg-white/90 transition-colors"
            >
              Install for Free
            </a>
            <Link
              href="/signup"
              className="border border-white/25 px-7 py-3.5 rounded-xl font-semibold text-[15px] hover:bg-white/5 transition-colors"
            >
              Create Account
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 border-t border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs font-bold tracking-widest uppercase text-[#5eead4] mb-3">
            Features
          </p>
          <h2 className="text-3xl font-bold tracking-tight mb-10">
            Everything you need. Nothing you don&apos;t.
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5"
              >
                <div className="text-xl mb-3">{f.icon}</div>
                <h3 className="text-sm font-bold mb-1.5">{f.title}</h3>
                <p className="text-xs text-white/45 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Supported Platforms */}
      <section className="py-20 border-t border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs font-bold tracking-widest uppercase text-[#5eead4] mb-3">
            Platforms
          </p>
          <h2 className="text-3xl font-bold tracking-tight mb-10">
            Works on the sites you already use.
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">
            {PLATFORMS.map((p) => (
              <div
                key={p.name}
                className="flex flex-col items-center gap-2 bg-white/[0.03] border border-white/[0.08] rounded-xl py-4 px-2"
              >
                <span className="text-2xl">{p.icon}</span>
                <span className="text-xs font-semibold">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Install CTA */}
      <section id="install" className="py-20 border-t border-white/[0.08]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight mb-4">Install in seconds.</h2>
          <p className="text-white/50 mb-8 max-w-md mx-auto">
            Free. No account required to start. Works with Chrome, Edge, Brave, Arc, and other
            Chromium browsers.
          </p>
          <a
            href="https://chromewebstore.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-white text-[var(--ink)] px-8 py-4 rounded-xl font-bold text-base hover:bg-white/90 transition-colors"
          >
            Add to Chrome — Free
          </a>
          <p className="text-xs text-white/30 mt-4">
            v1.2.0 &middot; 500 KB &middot; Manifest V3 &middot; Open source
          </p>
        </div>
      </section>
    </>
  );
}
