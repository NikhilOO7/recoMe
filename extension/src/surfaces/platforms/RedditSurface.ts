import { PlatformSurface, type CardCandidate } from '../PlatformSurface';
import type { Platform } from '@shared/types';

export class RedditSurface extends PlatformSurface {
  readonly platform: Platform = 'reddit';

  isScoreablePage(): boolean {
    // Home, subreddit, search — anywhere with a feed of posts.
    if (location.pathname.includes('/comments/')) return false; // single post detail
    return true;
  }

  cardSelector(): string {
    return 'shreddit-post, article[data-testid="post-container"], div[data-test-id="post-content"]';
  }

  override cardId(el: HTMLElement, fallbackIndex = 0): string {
    const id = el.getAttribute('id') || el.getAttribute('data-fullname');
    if (id) {
      el.setAttribute('data-recome-id', id);
      return id;
    }
    return super.cardId(el, fallbackIndex);
  }

  extract(el: HTMLElement): CardCandidate | null {
    const titleEl = el.querySelector(
      'h1[id^="post-title"], h3, a[slot="title"], h1.post-title, a[data-click-id="body"] h3',
    );
    const title = titleEl?.textContent?.trim();
    if (!title) return null;

    const linkEl = el.querySelector(
      'a[slot="full-post-link"], a[data-click-id="body"]',
    ) as HTMLAnchorElement | null;
    const url = linkEl?.href;

    const subEl = el.querySelector('a[href^="/r/"]');
    const sub = subEl?.textContent?.trim();

    return {
      id: this.cardId(el),
      element: el,
      title,
      ...(sub ? { brand: sub } : {}),
      ...(url ? { url } : {}),
    };
  }
}
