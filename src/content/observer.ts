import { createLogger } from '@shared/Logger';
import type { Platform } from '@shared/types';
import type { BaseAdapter } from './adapters/BaseAdapter';

const log = createLogger('Observer');

export function detectPlatform(): Platform {
  const host = location.hostname.replace(/^www\./, '');

  if (host.includes('youtube.com')) return 'youtube';
  if (host.includes('amazon.com') || host.includes('amazon.co')) return 'amazon';
  if (host.includes('twitter.com') || host.includes('x.com')) return 'twitter';
  if (host.includes('facebook.com')) return 'facebook';
  if (host.includes('instagram.com')) return 'instagram';
  if (host.includes('ebay.com')) return 'ebay';
  if (host.includes('walmart.com')) return 'walmart';
  return 'unknown';
}

/**
 * Waits for DOM ready, starts the adapter, then watches for SPA navigations.
 * Only re-inits when the pathname actually changes (ignores query-string-only changes
 * like Amazon filter updates).
 */
export async function initAdapter(adapter: BaseAdapter): Promise<void> {
  if (document.readyState === 'loading') {
    await new Promise<void>((resolve) =>
      document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }),
    );
  }

  // Give SPAs time to render their initial feed
  await new Promise((r) => setTimeout(r, 800));

  adapter.init();
  log.info(`Adapter started on ${location.hostname}`);

  // Track the last path we initialised for — only re-init on real page changes
  let lastPath = location.pathname;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const onNavigate = (): void => {
    const newPath = location.pathname;
    if (newPath === lastPath) return; // query-string-only change — skip
    lastPath = newPath;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      adapter.destroy();
      adapter.init();
      log.info(`Adapter re-init after navigation to ${newPath}`);
    }, 800);
  };

  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = (...args) => { origPush(...args); onNavigate(); };
  history.replaceState = (...args) => { origReplace(...args); onNavigate(); };
  window.addEventListener('popstate', onNavigate);
}