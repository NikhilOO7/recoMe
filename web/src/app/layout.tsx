import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider, THEME_INIT_SCRIPT } from '@/components/ThemeProvider';
import { LayoutSwitcher } from '@/components/LayoutSwitcher';
import { RegisterServiceWorker } from '@/components/RegisterServiceWorker';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Recome — Personal memory, as infrastructure',
  description:
    'Recome remembers what you research across YouTube, Reddit, Amazon, Substack and more — then surfaces it back to you, or to any product you build, as a typed personal interest graph powered by Neo4j, Qdrant, and active agents.',
  // PWA wiring — see web/public/manifest.webmanifest. Installable on
  // Android/iOS, ships with share-target so the OS share-sheet routes URLs
  // to /paste. See ADR-0003 §2.1.
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Recome',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
};

// Next 16 splits viewport/theme from metadata.
// The themeColor matches the dark default — ThemeProvider's inline
// script swaps data-theme on <html> before paint, so the browser
// chrome color and the body bg agree from the first frame.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
    { media: '(prefers-color-scheme: light)', color: '#f6f6f7' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* No-flash: set data-theme from localStorage BEFORE first paint.
            Prevents a dark→light flash for users who picked light. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <LayoutSwitcher>{children}</LayoutSwitcher>
        </ThemeProvider>
        {/* PWA installability — registers /sw.js once in the browser. */}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
