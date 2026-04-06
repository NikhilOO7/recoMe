import { createLogger } from '@shared/Logger';
import { checkPageEligibility } from './PageEligibility';
import type { Platform } from '@shared/types';
import type { BaseAdapter } from './adapters/BaseAdapter';

const log = createLogger('Observer');

export function detectPlatform(): Platform {
  const host = location.hostname.replace(/^www\./, '');

  if (host.includes('youtube.com')) return 'youtube';
  // Amazon international domains + Fresh, Pantry, Prime Now subdomains
  if (
    /amazon\.(com|co\.\w+|ca|de|fr|it|es|in|com\.br|com\.mx|com\.au|nl|pl|se|sg|sa|ae|eg|com\.tr|co\.za)/.test(
      host,
    ) ||
    host.includes('fresh.amazon') ||
    host.includes('pantry.amazon') ||
    host.includes('primenow.amazon')
  )
    return 'amazon';
  if (host.includes('twitter.com') || host.includes('x.com')) return 'twitter';
  if (host.includes('facebook.com')) return 'facebook';
  if (host.includes('instagram.com')) return 'instagram';
  if (host.includes('reddit.com')) return 'reddit';
  // eBay international domains
  if (/ebay\.(com|co\.\w+|de|fr|it|es|ca|com\.au|at|ch|ie|com\.sg|com\.my|ph|pl|nl|be)/.test(host))
    return 'ebay';
  if (host.includes('walmart.com')) return 'walmart';
  if (host.includes('linkedin.com')) return 'linkedin';
  if (host.includes('tiktok.com')) return 'tiktok';
  if (host.includes('indeed.com')) return 'indeed';
  if (host.includes('glassdoor.com')) return 'glassdoor';
  if (host.includes('udemy.com')) return 'udemy';
  if (host.includes('coursera.org')) return 'coursera';
  if (host.includes('edx.org')) return 'edx';
  return 'unknown';
}

/**
 * Waits for DOM ready, starts the adapter, then watches for SPA navigations.
 * Only re-inits when the pathname actually changes (ignores query-string-only changes
 * like Amazon filter updates).
 *
 * Re-checks page eligibility on each SPA navigation so the adapter is destroyed
 * if the user navigates to a login, CAPTCHA, or other ineligible page within
 * the same SPA session.
 */
/**
 * Build a route signature that captures meaningful URL changes per platform.
 * Commerce sites include search terms (changing search = new page).
 * Video sites include video ID. Most sites use pathname + hash.
 */
function getRouteSignature(): string {
  const platform = detectPlatform();
  const params = new URLSearchParams(location.search);

  // YouTube: video ID is in ?v= param, not pathname
  if (platform === 'youtube') {
    const v = params.get('v') ?? '';
    const list = params.get('list') ?? '';
    return `${location.pathname}?v=${v}&list=${list}${location.hash}`;
  }

  // Amazon: search keyword `k=` and category `i=` define the results page
  if (platform === 'amazon') {
    const k = params.get('k') ?? '';
    const i = params.get('i') ?? '';
    return `${location.pathname}?k=${k}&i=${i}${location.hash}`;
  }

  // eBay: search keyword `_nkw=` defines results
  if (platform === 'ebay') {
    const nkw = params.get('_nkw') ?? '';
    return `${location.pathname}?_nkw=${nkw}${location.hash}`;
  }

  // Walmart: search `q=` param
  if (platform === 'walmart') {
    const q = params.get('q') ?? '';
    return `${location.pathname}?q=${q}${location.hash}`;
  }

  // For most sites, pathname + hash is sufficient (ignore query-only filter changes)
  return `${location.pathname}${location.hash}`;
}

export async function initAdapter(adapter: BaseAdapter, onRouteChange?: () => void): Promise<void> {
  if (document.readyState === 'loading') {
    await new Promise<void>((resolve) =>
      document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }),
    );
  }

  // Wait for feed readiness — check for content elements rather than a fixed delay
  await waitForFeedReady(adapter);

  adapter.init();
  log.info(`Adapter started on ${location.hostname}`);

  // Track the last route signature — re-init on real page changes
  let lastRoute = getRouteSignature();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let adapterSuppressed = false;

  const onNavigate = (): void => {
    const newRoute = getRouteSignature();
    if (newRoute === lastRoute) return;
    lastRoute = newRoute;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      // Re-check eligibility on every SPA navigation.
      const eligibility = checkPageEligibility();

      if (!eligibility.eligible) {
        log.info(
          `Page became ineligible after navigation to ${newRoute}: ${eligibility.reason} — destroying adapter`,
        );
        adapter.destroy();
        adapterSuppressed = true;
        return;
      }

      if (adapterSuppressed) {
        log.info(`Page eligible again after navigation to ${newRoute} — re-initing adapter`);
        adapterSuppressed = false;
      } else {
        adapter.destroy();
      }

      adapter.init();
      log.info(`Adapter re-init after navigation to ${newRoute}`);
      onRouteChange?.();
    }, 800);
  };

  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = (...args) => {
    origPush(...args);
    onNavigate();
  };
  history.replaceState = (...args) => {
    origReplace(...args);
    onNavigate();
  };
  window.addEventListener('popstate', onNavigate);
  // Hash-only navigation (anchor links, SPA routers)
  window.addEventListener('hashchange', onNavigate);
}

/** Wait up to 2s for the page to have content, falling back to 800ms minimum */
async function waitForFeedReady(adapter: BaseAdapter): Promise<void> {
  const minWait = 400;
  const maxWait = 2000;
  const checkInterval = 200;

  await new Promise((r) => setTimeout(r, minWait));

  const sel = adapter.getCardSelector();
  if (!sel || document.querySelectorAll(sel).length > 0) return;

  // Poll briefly for content to appear
  let waited = minWait;
  while (waited < maxWait) {
    await new Promise((r) => setTimeout(r, checkInterval));
    waited += checkInterval;
    if (document.querySelectorAll(sel).length > 0) return;
  }
}
