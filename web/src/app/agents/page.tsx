import Link from 'next/link';

const CWS_URL = 'https://chromewebstore.google.com/detail/recome/fgpjboodmfnjbpdmbapjjjbfkflhbkcf';

const AGENTS = [
  {
    name: 'FilterAgent',
    icon: '🔍',
    color: '#6366f1',
    desc: 'Controls feed quality by learning what you want to see less of. Dims low-relevance content without removing it.',
    capabilities: ['Topic filtering', 'Content scoring', 'Feed curation', 'Noise reduction'],
  },
  {
    name: 'ScoutAgent',
    icon: '🔭',
    color: '#0891b2',
    desc: 'Discovers opportunities like events, courses, deals, and articles relevant to your interests.',
    capabilities: ['Opportunity detection', 'Course discovery', 'Deal alerts', 'Article matching'],
  },
  {
    name: 'ShopperAgent',
    icon: '🛒',
    color: '#059669',
    desc: 'Provides shopping intelligence — price context, brand preferences, deal detection, and purchase intent tracking.',
    capabilities: ['Price tracking', 'Brand preference', 'Deal scoring', 'Comparison assist'],
  },
  {
    name: 'AdvisorAgent',
    icon: '💡',
    color: '#8b5cf6',
    desc: 'Your personal assistant for product comparisons, research questions, and watchlist management.',
    capabilities: ['Product comparison', 'Research Q&A', 'Watchlist', 'Decision support'],
  },
  {
    name: 'SocialAgent',
    icon: '📡',
    color: '#ec4899',
    desc: 'Tracks community trends and surfaces relevant discussions, threads, and opinions across platforms.',
    capabilities: ['Trend detection', 'Thread matching', 'Opinion mining', 'Community signals'],
  },
  {
    name: 'GuardianAgent',
    icon: '🛡️',
    color: '#f59e0b',
    desc: 'Audits privacy, flags suspicious patterns, explains trust decisions, and monitors data flow transparency.',
    capabilities: ['Privacy audit', 'Trust scoring', 'Data flow visibility', 'Safety alerts'],
  },
];

export default function AgentsPage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="glow w-[500px] h-[500px] bg-[#7c3aed] top-[10%] right-[10%] absolute" />
        <div className="glow w-[300px] h-[300px] bg-[#a78bfa] bottom-[20%] left-[15%] absolute" />

        <div className="relative z-10 max-w-5xl mx-auto px-6 pt-28 pb-20">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-[#7c3aed]/10 border border-[#7c3aed]/20 rounded-full px-4 py-1.5 text-xs font-bold tracking-widest uppercase text-[#7c3aed] mb-6">
              <span className="w-2 h-2 rounded-full bg-[#7c3aed]" />
              AI Agents
            </div>
            <h1 className="text-4xl sm:text-6xl font-black tracking-[-3px] mb-5">
              Six agents.
              <br />
              <span className="text-[#a78bfa]">One intelligence.</span>
            </h1>
            <p className="text-lg text-white/50 max-w-xl mx-auto leading-relaxed mb-4">
              Specialized AI agents that work together to personalize your browsing, shopping, and
              research experience. Each agent has a distinct job — together they form a personal
              intelligence layer.
            </p>
            <p className="text-sm text-white/30 max-w-md mx-auto mb-8">
              All six agents are available today inside the browser extension. Standalone API coming
              in 2026.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <a
                href={CWS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white text-[var(--ink)] px-6 py-3 rounded-xl font-bold text-sm hover:opacity-[0.88] transition-opacity"
              >
                Try Agents in the Extension
              </a>
              <div className="flex items-center gap-2 bg-white/[0.06] border border-white/[0.12] rounded-full px-5 py-2.5 text-sm font-semibold text-white/60">
                Standalone API — Coming Soon
              </div>
            </div>
          </div>

          {/* Agent cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
            {AGENTS.map((agent) => (
              <div
                key={agent.name}
                className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 hover:bg-white/[0.05] transition-colors"
                style={{ borderLeftColor: agent.color, borderLeftWidth: 3 }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-xl mb-4 border"
                  style={{ background: `${agent.color}15`, borderColor: `${agent.color}30` }}
                >
                  {agent.icon}
                </div>
                <h3 className="text-base font-bold mb-2">{agent.name}</h3>
                <p className="text-[13px] text-white/[0.48] leading-relaxed mb-4">{agent.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {agent.capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="text-[10px] px-2 py-0.5 rounded-full border font-medium"
                      style={{
                        background: `${agent.color}10`,
                        borderColor: `${agent.color}25`,
                        color: `${agent.color}cc`,
                      }}
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* How agents work together */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8 text-center">
            <h3 className="text-xl font-bold mb-3">How They Work Together</h3>
            <p className="text-sm text-white/[0.48] leading-relaxed max-w-2xl mx-auto mb-6">
              When you browse a page, the Brain orchestrator sends the content to all relevant
              agents in parallel. Each agent scores and analyzes from its specialty. Results are
              merged, ranked by the OpportunityRanker, and surfaced as a unified insight — with
              clear attribution showing which agent contributed what.
            </p>
            <div className="flex justify-center gap-2 flex-wrap">
              {AGENTS.map((a) => (
                <span key={a.name} className="text-lg" title={a.name}>
                  {a.icon}
                </span>
              ))}
              <span className="text-white/30 mx-2">→</span>
              <span className="text-sm font-bold text-[#5eead4] self-center">Unified Insight</span>
            </div>
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
            <Link href="/sdk" className="hover:text-white/60">
              SDK
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}
