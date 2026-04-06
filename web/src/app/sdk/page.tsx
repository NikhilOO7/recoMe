import Link from 'next/link';

export default function SDKPage() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <div className="glow w-[500px] h-[500px] bg-[#d97706] top-[20%] left-[10%] absolute" />
      <div className="glow w-[300px] h-[300px] bg-[#f59e0b] bottom-[20%] right-[15%] absolute" />

      <div className="relative z-10 max-w-lg mx-auto px-6 text-center">
        <div className="inline-flex items-center gap-2 bg-[#d97706]/10 border border-[#d97706]/20 rounded-full px-4 py-1.5 text-xs font-bold tracking-widest uppercase text-[#d97706] mb-6">
          ⚙️ SDK
        </div>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tighter mb-5">
          Preference API
          <br />
          for <span className="text-[#f59e0b]">developers.</span>
        </h1>
        <p className="text-lg text-white/50 leading-relaxed mb-8">
          Embed RecoMe&apos;s preference intelligence into your own product. Personalize
          recommendations, content ranking, and user experiences with a simple API.
        </p>
        <div className="inline-flex items-center gap-2 bg-white/[0.06] border border-white/[0.12] rounded-full px-5 py-2.5 text-sm font-semibold text-white/60 mb-8">
          Coming Soon — 2026
        </div>
        <div className="flex gap-3 justify-center">
          <Link
            href="/extension"
            className="bg-white text-[var(--ink)] px-6 py-3 rounded-xl font-bold text-sm hover:bg-white/90 transition-colors"
          >
            Try the Extension Now
          </Link>
          <Link
            href="/"
            className="border border-white/25 px-6 py-3 rounded-xl font-semibold text-sm hover:bg-white/5 transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </section>
  );
}
