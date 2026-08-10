import { PlatformSurface, type CardCandidate } from '../PlatformSurface';
import type { Platform } from '@shared/types';

/**
 * Walmart search/browse tiles. DOM contract (mirrored in the fixture tests —
 * update BOTH when Walmart redesigns):
 *   - tile root:  div[data-item-id]
 *   - title:      [data-automation-id="product-title"] (fallback: /ip/ link text)
 *   - url:        a[href*="/ip/"]
 *   - sponsored:  any [data-automation-id*="sponsored"] marker inside the tile
 */
export class WalmartSurface extends PlatformSurface {
  readonly platform: Platform = 'walmart';

  isScoreablePage(): boolean {
    return (
      location.pathname.startsWith('/search') ||
      location.pathname.startsWith('/browse') ||
      location.pathname.startsWith('/shop') ||
      location.pathname.startsWith('/cp/')
    );
  }

  cardSelector(): string {
    return 'div[data-item-id]';
  }

  extract(el: HTMLElement): CardCandidate | null {
    // Sponsored tiles are ads, not the user's results — never score them.
    if (el.querySelector('[data-automation-id*="sponsored" i]')) return null;

    const link = el.querySelector('a[href*="/ip/"]') as HTMLAnchorElement | null;
    const title =
      el.querySelector('[data-automation-id="product-title"]')?.textContent?.trim() ||
      link?.textContent?.trim();
    if (!title) return null;

    return {
      id: this.cardId(el, 0),
      element: el,
      title,
      ...(link?.href ? { url: link.href } : {}),
    };
  }

  override cardId(el: HTMLElement, fallbackIndex: number): string {
    const itemId = el.getAttribute('data-item-id');
    if (itemId) {
      const id = `wm_${itemId}`;
      el.setAttribute('data-recome-id', id);
      return id;
    }
    return super.cardId(el, fallbackIndex);
  }
}
