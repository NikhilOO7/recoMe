import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 pt-24 pb-16">
      <Link
        href="/dashboard"
        className="text-xs text-white/30 hover:text-white/50 mb-6 inline-block"
      >
        ← Back to Dashboard
      </Link>

      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-white/40 mb-10">Last updated: April 2026</p>

      <div className="flex flex-col gap-8 text-sm text-white/60 leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-white mb-3">Our Promise</h2>
          <p>
            RecoMe is built on one principle:{' '}
            <strong className="text-white">your data belongs to you</strong>. We do not sell, share,
            or monetize your browsing data. Period.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-3">What stays on your device</h2>
          <ul className="list-disc list-inside space-y-2 text-white/50">
            <li>Your interest graph (topics, preferences, weights)</li>
            <li>Browsing signals (dwell time, clicks, scrolls)</li>
            <li>Research trail (cross-platform topic connections)</li>
            <li>AI scoring decisions and factor breakdowns</li>
            <li>All memory entries and pattern data</li>
          </ul>
          <p className="mt-3">
            This data is stored in your browser&apos;s local IndexedDB and chrome.storage. It never
            leaves your device unless you explicitly enable cloud sync.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-3">What we store on our servers</h2>
          <ul className="list-disc list-inside space-y-2 text-white/50">
            <li>Account information (email, display name) — required for account creation</li>
            <li>Authentication tokens — for secure login sessions</li>
            <li>
              Cloud sync data — <strong className="text-white">end-to-end encrypted</strong>, our
              servers cannot read it
            </li>
            <li>Taste Twin profiles — only if you opt in, anonymized and bucketed</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-3">AI Provider Keys</h2>
          <p>
            If you configure an AI provider (Anthropic, OpenAI, or Google), your API key is stored
            <strong className="text-white"> encrypted at rest</strong> on your device using
            AES-256-GCM. When AI features are used, page text is sent directly from your browser to
            your chosen provider — RecoMe servers never see it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-3">Your Controls</h2>
          <ul className="list-disc list-inside space-y-2 text-white/50">
            <li>
              <strong className="text-white">Export</strong> — download all your data as JSON at any
              time
            </li>
            <li>
              <strong className="text-white">Delete</strong> — one-click clear all local data from
              the extension
            </li>
            <li>
              <strong className="text-white">Delete Account</strong> — removes all server-side data
              permanently
            </li>
            <li>
              <strong className="text-white">Cloud sync toggle</strong> — disable at any time; data
              stays local
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-3">Analytics & Tracking</h2>
          <p>
            RecoMe does not use any third-party analytics, tracking pixels, or telemetry services.
            We do not track which pages you visit, what you click, or how long you browse. The
            extension makes zero server calls for content scoring — everything happens locally.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-3">Contact</h2>
          <p>
            Questions about privacy? Email us at{' '}
            <a href="mailto:nikhil.bindal@outlook.com" className="text-[#5eead4] hover:underline">
              nikhil.bindal@outlook.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
