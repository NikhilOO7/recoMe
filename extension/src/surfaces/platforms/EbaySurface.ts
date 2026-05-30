import { PlatformSurface, type CardCandidate } from '../PlatformSurface';
import type { Platform } from '@shared/types';

export class EbaySurface extends PlatformSurface {
  readonly platform: Platform = 'ebay';

  isScoreablePage(): boolean {
    return location.pathname.startsWith('/sch') || location.pathname.startsWith('/b/');
  }

  cardSelector(): string {
    return 'li.s-item, div.s-card';
  }

  extract(el: HTMLElement): CardCandidate | null {
    const titleEl = el.querySelector('.s-item__title, .s-card__title');
    const title = titleEl?.textContent?.trim();
    if (!title || /^Shop on eBay$/i.test(title)) return null;

    const linkEl = el.querySelector('a.s-item__link, a.s-card__link') as HTMLAnchorElement | null;
    const url = linkEl?.href;

    return {
      id: this.cardId(el, 0),
      element: el,
      title,
      ...(url ? { url } : {}),
    };
  }
}
