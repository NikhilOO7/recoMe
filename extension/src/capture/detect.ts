import type { Platform } from '@shared/types';

interface Match {
  platform: Platform;
  test: (host: string) => boolean;
}

const MATCHERS: Match[] = [
  { platform: 'youtube', test: (h) => h.endsWith('youtube.com') },
  { platform: 'amazon', test: (h) => /(^|\.)amazon\.[a-z.]+$/.test(h) || h === 'fresh.amazon.com' },
  { platform: 'reddit', test: (h) => h.endsWith('reddit.com') },
  {
    platform: 'twitter',
    test: (h) =>
      h === 'twitter.com' || h === 'x.com' || h.endsWith('.twitter.com') || h.endsWith('.x.com'),
  },
  { platform: 'facebook', test: (h) => h.endsWith('facebook.com') },
  { platform: 'instagram', test: (h) => h.endsWith('instagram.com') },
  { platform: 'ebay', test: (h) => /(^|\.)ebay\.[a-z.]+$/.test(h) },
  { platform: 'walmart', test: (h) => h.endsWith('walmart.com') },
  { platform: 'linkedin', test: (h) => h.endsWith('linkedin.com') },
  { platform: 'tiktok', test: (h) => h.endsWith('tiktok.com') },
  { platform: 'indeed', test: (h) => h.endsWith('indeed.com') },
  { platform: 'glassdoor', test: (h) => /(^|\.)glassdoor\.[a-z.]+$/.test(h) },
  { platform: 'udemy', test: (h) => h.endsWith('udemy.com') },
  { platform: 'coursera', test: (h) => h.endsWith('coursera.org') },
  { platform: 'edx', test: (h) => h.endsWith('edx.org') },
];

export function detectPlatform(host: string = location.hostname): Platform {
  const clean = host.replace(/^www\./, '');
  for (const m of MATCHERS) if (m.test(clean)) return m.platform;
  return 'generic';
}
