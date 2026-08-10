import { PlatformSurface, type CardCandidate } from '../PlatformSurface';
import type { Platform } from '@shared/types';

/**
 * Coursera search/browse cards. DOM contract (mirrored in the fixture tests):
 *   - card root:  [data-testid="product-card-cds"] (fallback: li[class*="cds-"] with an h3)
 *   - title:      h3
 *   - partner:    [class*="partner" i] → CardCandidate.brand (drives the
 *                 scorer's brand matching, e.g. "DeepLearning.AI")
 *   - url:        a[href*="/learn/"|/specializations/|/professional-certificates/]
 */
export class CourseraSurface extends PlatformSurface {
  readonly platform: Platform = 'coursera';

  isScoreablePage(): boolean {
    return (
      location.pathname.startsWith('/search') ||
      location.pathname.startsWith('/browse') ||
      location.pathname.startsWith('/courses')
    );
  }

  cardSelector(): string {
    return '[data-testid="product-card-cds"]';
  }

  extract(el: HTMLElement): CardCandidate | null {
    const title = el.querySelector('h3')?.textContent?.trim();
    if (!title) return null;

    const partner = el.querySelector('[class*="partner" i]')?.textContent?.trim();
    const link = el.querySelector(
      'a[href*="/learn/"], a[href*="/specializations/"], a[href*="/professional-certificates/"]',
    ) as HTMLAnchorElement | null;

    return {
      id: this.cardId(el, 0),
      element: el,
      title,
      ...(partner ? { brand: partner } : {}),
      ...(link?.href ? { url: link.href } : {}),
    };
  }
}
