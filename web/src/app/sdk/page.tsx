import Link from 'next/link';

// Developer page for the live /v1 API. Content law: describe what is
// deployed — no fictional SDK packages, no invented latency numbers.
// Quotas mirror cloud/src/iaas/usageTracker.ts PLAN_QUOTAS.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://recome-api.fly.dev';

const CAPABILITIES = [
  {
    title: 'Signals in, structure out',
    desc: 'POST your users’ behavioral signals; read back weighted research trails and intents. Cold start solved with one integration.',
  },
  {
    title: 'Per-signal validation',
    desc: 'Batches are validated item by item. One malformed record is rejected with its reason — the other 99 still land, and you’re only billed for what was accepted.',
  },
  {
    title: 'Tenant isolation by construction',
    desc: 'Your users’ graphs are built only from signals your app sends. Namespaced identifiers make cross-tenant reads impossible, not just forbidden.',
  },
  {
    title: 'Metered and predictable',
    desc: 'Monthly quotas per plan, burst limits per minute, a usage endpoint, and 429s that tell you exactly when the window resets.',
  },
  {
    title: 'GDPR delete, one call',
    desc: 'DELETE /v1/users/:id removes a user’s graph, vectors, and audit trail together. Idempotent, verified by test.',
  },
  {
    title: 'OpenAPI, not screenshots',
    desc: 'The full spec ships from the API itself — Swagger UI at /v1/docs, machine-readable spec at /v1/openapi.json.',
  },
];

const PLANS = [
  { name: 'FREE', signals: '1K', queries: '10K', note: 'Kick the tires' },
  { name: 'STARTER', signals: '100K', queries: '1M', note: 'First integration' },
  { name: 'PRO', signals: '1M', queries: '10M', note: 'In production' },
  { name: 'ENTERPRISE', signals: 'Custom', queries: 'Custom', note: 'Talk to us' },
];

export default function SDKPage() {
  return (
    <section className="relative overflow-hidden">
      <div className="glow w-[500px] h-[500px] bg-[#fbbf24] top-[5%] left-[10%] absolute" />
      <div className="glow w-[400px] h-[400px] bg-[#5eead4] bottom-[10%] right-[10%] absolute" />

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-40 pb-24">
        <div className="max-w-3xl mb-16">
          <div className="inline-flex items-center gap-2 border border-[var(--accent-border)] bg-[var(--accent-soft)] rounded-full px-3.5 py-1.5 mb-7">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] pulse-dot" />
            <span className="eyebrow text-[var(--accent)]">Developers · /v1 · Live</span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-[-0.03em] leading-[1.05] mb-6 text-balance">
            The interest graph, <span className="grad">as an API.</span>
          </h1>
          <p className="text-lg text-[var(--muted)] leading-relaxed mb-8">
            Every app rebuilds personalization from zero. Instead: send your users&rsquo; signals to{' '}
            <span className="font-mono text-[15px] text-[var(--accent)]">/v1</span>, read back a
            structured, weighted picture of what each of them actually cares about. Plain REST — an
            official TypeScript SDK is planned, but you don&rsquo;t need it to ship today.
          </p>
          <div className="flex gap-3.5 flex-wrap">
            <Link href="/developer" className="btn btn-primary">
              Issue an API key
            </Link>
            <a
              href={`${API_URL}/v1/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
            >
              Open the API docs
            </a>
          </div>
        </div>

        {/* Quickstart */}
        <div className="card overflow-hidden mb-16">
          <div className="px-4 py-3 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center gap-3 font-mono text-[12px] text-[var(--muted-2)]">
            <span className="w-2 h-2 rounded-full bg-[var(--success)] pulse-dot" />
            <span>Quickstart — two calls to your first trail</span>
          </div>
          <pre className="p-5 font-mono text-[12.5px] leading-[1.75] overflow-x-auto text-[var(--ink-2)]">
            <span className="text-[var(--muted-2)]">{`# 1. Ingest a signal for one of YOUR users (id is yours, opaque to us)`}</span>
            {`\ncurl -X POST ${API_URL}/v1/signals \\\n  -H `}
            <span className="text-[var(--accent)]">{`"Authorization: Bearer rk_live_…"`}</span>
            {` \\\n  -H `}
            <span className="text-[var(--accent)]">{`"X-User-Id: user_42"`}</span>
            {` \\\n  -d `}
            <span className="text-[var(--accent)]">{`'{"signals":[{"kind":"view","pageUrl":"https://youtube.com/watch?v=…","platform":"youtube","topics":[{"name":"standing desks"}]}]}'`}</span>
            {`\n`}
            <span className="text-[var(--muted-2)]">{`# → 200 { ok, accepted: 1, results: [...], rejected: [], retryable: [] }`}</span>
            {`\n\n`}
            <span className="text-[var(--muted-2)]">{`# 2. Read back the user's research trails`}</span>
            {`\ncurl ${API_URL}/v1/users/user_42/trails \\\n  -H `}
            <span className="text-[var(--accent)]">{`"Authorization: Bearer rk_live_…"`}</span>
            {` -H `}
            <span className="text-[var(--accent)]">{`"X-User-Id: user_42"`}</span>
            {`\n`}
            <span className="text-[var(--muted-2)]">{`# → 200 { trails: [{ topic, platforms, signalCount, strength, … }] }`}</span>
          </pre>
        </div>

        {/* Capabilities */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
          {CAPABILITIES.map((c) => (
            <div key={c.title} className="card card-hover p-6 transition-colors">
              <h3 className="text-[15px] font-bold mb-2 text-[var(--ink)]">{c.title}</h3>
              <p className="text-[13.5px] text-[var(--muted)] leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>

        {/* Plans */}
        <div className="mb-16">
          <p className="eyebrow text-[var(--accent)] mb-3">Plans &amp; quotas</p>
          <h2 className="section-title mb-8">Start free. Pay when it works.</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--surface-2)] text-left">
                  <th className="px-5 py-3 font-mono text-[11px] uppercase tracking-wider text-[var(--muted-2)] font-medium">
                    Plan
                  </th>
                  <th className="px-5 py-3 font-mono text-[11px] uppercase tracking-wider text-[var(--muted-2)] font-medium">
                    Signals / mo
                  </th>
                  <th className="px-5 py-3 font-mono text-[11px] uppercase tracking-wider text-[var(--muted-2)] font-medium">
                    Queries / mo
                  </th>
                  <th className="px-5 py-3 font-mono text-[11px] uppercase tracking-wider text-[var(--muted-2)] font-medium">
                    For
                  </th>
                </tr>
              </thead>
              <tbody>
                {PLANS.map((p) => (
                  <tr key={p.name} className="border-t border-[var(--border)]">
                    <td className="px-5 py-3.5 font-mono text-[13px] font-bold text-[var(--accent)]">
                      {p.name}
                    </td>
                    <td className="px-5 py-3.5 text-[var(--ink-2)] tabular-nums">{p.signals}</td>
                    <td className="px-5 py-3.5 text-[var(--ink-2)] tabular-nums">{p.queries}</td>
                    <td className="px-5 py-3.5 text-[var(--muted)]">{p.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-[var(--muted-2)] mt-3">
            Over quota returns a 429 with <span className="font-mono">resetsAt</span> — your
            integration never guesses.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center">
          <p className="text-[var(--muted)] text-sm mb-5">
            Keys are issued from the developer dashboard — shown once, hashed at rest, revocable.
          </p>
          <div className="flex gap-3.5 justify-center flex-wrap">
            <Link href="/developer" className="btn btn-primary">
              Open the developer dashboard
            </Link>
            <a
              href={`${API_URL}/v1/openapi.json`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-quiet"
            >
              openapi.json
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
