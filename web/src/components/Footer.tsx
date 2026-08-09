import Link from 'next/link';

// Public footer. Token-driven; links go to public pages plus the two
// account entry points. The Chrome Web Store link returns when the
// listing is actually live (store/STORE_LISTING.md checklist).
export function Footer() {
  return (
    <footer className="py-12 border-t border-[var(--border)]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-8">
          {/* Brand */}
          <div className="max-w-xs">
            <Link href="/" className="text-base font-bold tracking-tight text-[var(--ink)]">
              Reco<span className="text-[var(--accent)]">Me</span>
            </Link>
            <p className="text-[12px] text-[var(--muted-2)] mt-2 leading-relaxed">
              Personal attention infrastructure. The chat isn&rsquo;t the product — the interest
              graph is.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-x-12 gap-y-4 text-[13px]">
            <div className="flex flex-col gap-2">
              <span className="eyebrow !text-[10px] text-[var(--muted-2)]">Product</span>
              <Link
                href="/how-it-works"
                className="text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
              >
                How it works
              </Link>
              <Link
                href="/#agents"
                className="text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
              >
                Agents
              </Link>
              <Link
                href="/extension"
                className="text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
              >
                Extension
              </Link>
              <Link
                href="/sdk"
                className="text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
              >
                Developers · /v1
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              <span className="eyebrow !text-[10px] text-[var(--muted-2)]">Account</span>
              <Link
                href="/login"
                className="text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
              >
                Create account
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              <span className="eyebrow !text-[10px] text-[var(--muted-2)]">Legal</span>
              <Link
                href="/privacy"
                className="text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
              >
                Terms
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-[var(--border)] text-[12px] text-[var(--muted-2)] flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>&copy; {new Date().getFullYear()} RecoMe. All rights reserved.</span>
          <span>Every output cited. Recommend, never act. Delete everything, any time.</span>
        </div>
      </div>
    </footer>
  );
}
