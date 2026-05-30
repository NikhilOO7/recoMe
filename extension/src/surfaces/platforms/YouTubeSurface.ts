import { PlatformSurface, type CardCandidate } from '../PlatformSurface';
import type { Platform } from '@shared/types';

export class YouTubeSurface extends PlatformSurface {
  readonly platform: Platform = 'youtube';

  isScoreablePage(): boolean {
    // Home, subscriptions, search, channel — anywhere with a grid of videos.
    const p = location.pathname;
    return (
      p === '/' ||
      p.startsWith('/feed') ||
      p.startsWith('/results') ||
      p.startsWith('/channel/') ||
      p.startsWith('/@')
    );
  }

  cardSelector(): string {
    return 'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer';
  }

  override cardId(el: HTMLElement, fallbackIndex = 0): string {
    const link = el.querySelector('a#video-title-link, a#thumbnail') as HTMLAnchorElement | null;
    if (link) {
      const v = new URL(link.href, location.origin).searchParams.get('v');
      if (v) {
        el.setAttribute('data-recome-id', `yt_${v}`);
        return `yt_${v}`;
      }
    }
    return super.cardId(el, fallbackIndex);
  }

  extract(el: HTMLElement): CardCandidate | null {
    const titleEl = el.querySelector('#video-title, yt-formatted-string#video-title');
    const title = titleEl?.textContent?.trim();
    if (!title) return null;

    const linkEl = el.querySelector('a#video-title-link, a#thumbnail') as HTMLAnchorElement | null;
    const url = linkEl?.href;

    const channelEl = el.querySelector('ytd-channel-name a, #channel-name a');
    const channel = channelEl?.textContent?.trim();

    return {
      id: this.cardId(el),
      element: el,
      title,
      ...(channel ? { brand: channel } : {}),
      ...(url ? { url } : {}),
    };
  }
}
