import { PlatformSurface, type CardCandidate } from '../PlatformSurface';
import type { Platform } from '@shared/types';

const PDP_OR_SEARCH = /^\/s(\?|$)|^\/(dp|gp\/product)\//;

export class AmazonSearchSurface extends PlatformSurface {
  readonly platform: Platform = 'amazon';

  isScoreablePage(): boolean {
    return /^\/s(\?|$)/.test(location.pathname) || PDP_OR_SEARCH.test(location.pathname);
  }

  cardSelector(): string {
    return 'div.s-result-item[data-asin]:not([data-asin=""])';
  }

  override cardId(el: HTMLElement): string {
    const asin = el.getAttribute('data-asin');
    if (asin) {
      el.setAttribute('data-recome-id', asin);
      return asin;
    }
    return super.cardId(el, 0);
  }

  extract(el: HTMLElement): CardCandidate | null {
    // Skip sponsored placements — they're not driven by user signals.
    if (el.querySelector('[data-component-type="sp-sponsored-result"]')) return null;
    if (el.textContent?.toLowerCase().includes('sponsored')) {
      // Heuristic: if "sponsored" appears in the badge row, skip
      const badge = el.querySelector('.puis-sponsored-label-text, .a-color-secondary');
      if (badge?.textContent?.toLowerCase().includes('sponsored')) return null;
    }

    const titleEl = el.querySelector(
      'h2 a span, h2 span, .a-text-normal, [data-cy="title-recipe"] span',
    );
    const title = titleEl?.textContent?.trim();
    if (!title) return null;

    const linkEl = el.querySelector(
      'h2 a, a.s-line-clamp-2, a.a-link-normal',
    ) as HTMLAnchorElement | null;
    const url = linkEl?.href;

    const brandEl = el.querySelector('.s-line-clamp-1 + .a-row .a-size-base-plus');
    const brand = brandEl?.textContent?.trim();

    return {
      id: this.cardId(el),
      element: el,
      title,
      ...(brand ? { brand } : {}),
      ...(url ? { url } : {}),
    };
  }
}
