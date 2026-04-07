import Link from 'next/link';

const CWS_URL = 'https://chromewebstore.google.com/detail/recome/fgpjboodmfnjbpdmbapjjjbfkflhbkcf';

export function Footer() {
  return (
    <footer className="py-10 border-t border-white/[0.08]">
      <div className="max-w-5xl mx-auto px-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          {/* Brand */}
          <div>
            <Link href="/" className="text-base font-bold tracking-tight">
              Reco<span className="text-[#5eead4]">Me</span>
            </Link>
            <p className="text-[11px] text-white/25 mt-1">Your research, connected.</p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs text-white/30">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/20 mb-0.5">
                Product
              </span>
              <Link href="/extension" className="hover:text-white/60 transition-colors">
                Extension
              </Link>
              <Link href="/agents" className="hover:text-white/60 transition-colors">
                Agents
              </Link>
              <Link href="/sdk" className="hover:text-white/60 transition-colors">
                SDK
              </Link>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/20 mb-0.5">
                Account
              </span>
              <Link href="/login" className="hover:text-white/60 transition-colors">
                Sign in
              </Link>
              <Link href="/signup" className="hover:text-white/60 transition-colors">
                Create account
              </Link>
              <Link href="/dashboard" className="hover:text-white/60 transition-colors">
                Dashboard
              </Link>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/20 mb-0.5">
                Legal
              </span>
              <Link href="/privacy" className="hover:text-white/60 transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-white/60 transition-colors">
                Terms
              </Link>
              <a
                href={CWS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white/60 transition-colors"
              >
                Chrome Web Store
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-white/[0.05] text-[11px] text-white/20 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>&copy; {new Date().getFullYear()} RecoMe. All rights reserved.</span>
          <span>Made with privacy in mind.</span>
        </div>
      </div>
    </footer>
  );
}
