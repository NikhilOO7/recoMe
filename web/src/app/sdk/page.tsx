import Link from 'next/link';

const CWS_URL = 'https://chromewebstore.google.com/detail/recome/fgpjboodmfnjbpdmbapjjjbfkflhbkcf';

const CAPABILITIES = [
  {
    icon: '📊',
    title: 'Preference API',
    desc: 'Query user preferences, interests, and affinities via a simple REST or SDK call.',
  },
  {
    icon: '🎯',
    title: 'Personalization Engine',
    desc: 'Rank and filter any content feed based on learned user preferences — not collaborative filtering.',
  },
  {
    icon: '🔒',
    title: 'Privacy-Preserving',
    desc: 'Preferences are anonymized and bucketed. Raw browsing data never leaves the user device.',
  },
  {
    icon: '⚡',
    title: 'Real-Time Scoring',
    desc: 'Sub-50ms scoring for content ranking, product recommendations, and feed personalization.',
  },
  {
    icon: '🔌',
    title: 'Simple Integration',
    desc: 'Three lines of code. Works with any frontend framework, any backend, any content type.',
  },
  {
    icon: '📈',
    title: 'Analytics Dashboard',
    desc: 'See how preferences drive engagement, conversion, and retention — without tracking individuals.',
  },
];

export default function SDKPage() {
  return (
    <>
      <section className="relative min-h-screen flex items-center overflow-hidden">
        <div className="glow w-[500px] h-[500px] bg-[#d97706] top-[20%] left-[10%] absolute" />
        <div className="glow w-[300px] h-[300px] bg-[#f59e0b] bottom-[20%] right-[15%] absolute" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 pt-28 pb-20">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-[#d97706]/10 border border-[#d97706]/20 rounded-full px-4 py-1.5 text-xs font-bold tracking-widest uppercase text-[#d97706] mb-6">
              <span className="w-2 h-2 rounded-full bg-[#d97706]" />
              SDK
            </div>
            <h1 className="text-4xl sm:text-6xl font-black tracking-[-3px] mb-5">
              Preference API
              <br />
              for <span className="text-[#f59e0b]">developers.</span>
            </h1>
            <p className="text-lg text-white/50 max-w-xl mx-auto leading-relaxed mb-8">
              Embed RecoMe&apos;s preference intelligence into your own product. Personalize
              recommendations, content ranking, and user experiences — powered by real user
              preferences, not surveillance.
            </p>
            <div className="inline-flex items-center gap-2 bg-white/[0.06] border border-white/[0.12] rounded-full px-5 py-2.5 text-sm font-semibold text-white/60 mb-10">
              Coming 2026
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
            {CAPABILITIES.map((c) => (
              <div
                key={c.title}
                className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 hover:bg-white/[0.05] transition-colors"
              >
                <div className="text-xl mb-3">{c.icon}</div>
                <h3 className="text-sm font-bold mb-1.5">{c.title}</h3>
                <p className="text-xs text-white/45 leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>

          {/* Code preview */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 mb-16">
            <p className="text-xs font-bold tracking-widest uppercase text-[#d97706] mb-4">
              Preview
            </p>
            <pre className="text-sm text-white/60 font-mono leading-relaxed overflow-x-auto">
              {`import { RecoMe } from '@recome/sdk';

const reco = new RecoMe({ apiKey: 'your-key' });

// Get personalized ranking for a content feed
const ranked = await reco.rank({
  userId: 'user_123',
  items: products,
  context: 'shopping'
});`}
            </pre>
          </div>

          <div className="text-center">
            <p className="text-white/40 text-sm mb-4">
              The extension is the foundation. Try it now — the SDK builds on top.
            </p>
            <a
              href={CWS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white text-[var(--ink)] px-6 py-3 rounded-xl font-bold text-sm hover:opacity-[0.88] transition-opacity"
            >
              Try the Extension Now
            </a>
          </div>
        </div>
      </section>

      <footer className="py-10 border-t border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between text-xs text-white/30">
          <span>RecoMe {new Date().getFullYear()}</span>
          <div className="flex gap-5">
            <Link href="/" className="hover:text-white/60">
              Home
            </Link>
            <Link href="/extension" className="hover:text-white/60">
              Extension
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
