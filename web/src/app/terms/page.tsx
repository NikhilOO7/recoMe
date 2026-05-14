import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 pt-24 pb-16">
      <Link
        href="/dashboard"
        className="text-xs text-white/30 hover:text-white/50 mb-6 inline-block"
      >
        ← Back to Dashboard
      </Link>

      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-sm text-white/40 mb-10">Last updated: April 2026</p>

      <div className="flex flex-col gap-8 text-sm text-white/60 leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-white mb-3">1. Acceptance</h2>
          <p>
            By using RecoMe (the browser extension, web app, or any associated services), you agree
            to these terms. If you don&apos;t agree, don&apos;t use the service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-3">2. What RecoMe Does</h2>
          <p>
            RecoMe is a browser extension and web service that helps you organize your research
            across platforms. It builds a local interest graph on your device and optionally syncs
            encrypted data to our servers for cross-device access.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-3">3. Your Data</h2>
          <p>
            You own your data. We don&apos;t sell it, share it with advertisers, or use it to build
            profiles for third parties. See our{' '}
            <Link href="/privacy" className="text-[#5eead4] hover:underline">
              Privacy Policy
            </Link>{' '}
            for full details on data handling.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-3">4. Accounts</h2>
          <p>
            Account creation is optional. The extension works without an account. If you create an
            account, you&apos;re responsible for keeping your credentials secure. You can delete
            your account at any time from Settings.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-3">5. Free Tier</h2>
          <p>
            The core extension functionality is free. We may introduce premium features in the
            future, but existing free features will remain free.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-3">6. Acceptable Use</h2>
          <p>
            Don&apos;t use RecoMe to scrape, automate, or interfere with third-party platforms
            beyond normal browsing. Don&apos;t attempt to reverse-engineer the extension or abuse
            the API.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-3">7. Limitation of Liability</h2>
          <p>
            RecoMe is provided as-is. We do our best to keep it working, but we can&apos;t guarantee
            uninterrupted service. We&apos;re not liable for decisions you make based on
            RecoMe&apos;s suggestions or insights.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-3">8. Changes</h2>
          <p>
            We may update these terms. Continued use after changes means you accept the new terms.
            We&apos;ll notify users of significant changes via the extension or email.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-3">Contact</h2>
          <p>
            Questions? Email{' '}
            <a href="mailto:nikhil.bindal@outlook.com" className="text-[#5eead4] hover:underline">
              nikhil.bindal@outlook.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
