import Link from 'next/link';

const AGENTS = [
  {
    name: 'FilterAgent',
    icon: '🔍',
    desc: 'Controls feed quality by learning what you want to see less of.',
  },
  {
    name: 'ScoutAgent',
    icon: '🔭',
    desc: 'Discovers courses, events, deals, and articles matching your interests.',
  },
  {
    name: 'ShopperAgent',
    icon: '🛒',
    desc: 'Provides shopping intelligence — price context, brand preferences, deal detection.',
  },
  {
    name: 'AdvisorAgent',
    icon: '💡',
    desc: 'Your personal assistant for product comparisons and research questions.',
  },
  {
    name: 'SocialAgent',
    icon: '📡',
    desc: 'Tracks community trends and surfaces relevant discussions.',
  },
  {
    name: 'GuardianAgent',
    icon: '🛡️',
    desc: 'Audits privacy, flags suspicious patterns, and explains trust decisions.',
  },
];

export default function AgentsPage() {
  return (
    <section className="relative min-h-screen overflow-hidden">
      <div className="glow w-[500px] h-[500px] bg-[#7c3aed] top-[10%] right-[10%] absolute" />
      <div className="glow w-[300px] h-[300px] bg-[#a78bfa] bottom-[20%] left-[15%] absolute" />

      <div className="relative z-10 max-w-4xl mx-auto px-6 pt-28 pb-20">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-[#7c3aed]/10 border border-[#7c3aed]/20 rounded-full px-4 py-1.5 text-xs font-bold tracking-widest uppercase text-[#7c3aed] mb-6">
            🤖 AI Agents
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter mb-5">
            Six agents.
            <br />
            <span className="text-[#a78bfa]">One intelligence.</span>
          </h1>
          <p className="text-lg text-white/50 max-w-xl mx-auto leading-relaxed mb-8">
            Specialized AI agents that work together to personalize your browsing, shopping, and
            research experience. Currently built into the extension — standalone agent API coming
            soon.
          </p>
          <div className="inline-flex items-center gap-2 bg-white/[0.06] border border-white/[0.12] rounded-full px-5 py-2.5 text-sm font-semibold text-white/60">
            Standalone API — Coming Soon
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {AGENTS.map((agent) => (
            <div
              key={agent.name}
              className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5 hover:bg-white/[0.05] transition-colors"
            >
              <div className="text-2xl mb-3">{agent.icon}</div>
              <h3 className="text-sm font-bold mb-1.5">{agent.name}</h3>
              <p className="text-xs text-white/45 leading-relaxed">{agent.desc}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <p className="text-white/40 text-sm mb-4">
            All six agents are available today inside the browser extension.
          </p>
          <Link
            href="/extension"
            className="bg-white text-[var(--ink)] px-6 py-3 rounded-xl font-bold text-sm hover:bg-white/90 transition-colors"
          >
            Try the Extension Now
          </Link>
        </div>
      </div>
    </section>
  );
}
