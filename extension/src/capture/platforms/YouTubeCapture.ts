import {
  PlatformCapture,
  type PageExtract,
  extractCategoriesAndBrands,
  pickText,
  tokenizeTitle,
} from '../PlatformCapture';
import type { Platform } from '@shared/types';

export class YouTubeCapture extends PlatformCapture {
  readonly platform: Platform = 'youtube';

  override pageKind(): string {
    if (location.pathname.startsWith('/watch')) return 'watch';
    if (location.pathname.startsWith('/results')) return 'search';
    if (location.pathname.startsWith('/channel/') || location.pathname.startsWith('/@'))
      return 'channel';
    return 'page';
  }

  extract(): PageExtract | null {
    if (!location.pathname.startsWith('/watch')) return null;

    const title =
      pickText(
        'h1.ytd-watch-metadata yt-formatted-string',
        'h1.ytd-video-primary-info-renderer yt-formatted-string',
        '#title h1 yt-formatted-string',
        'h1.style-scope.ytd-watch-metadata',
      ) || document.title.replace(' - YouTube', '').trim();
    if (!title) return null;

    const channel = pickText('ytd-channel-name yt-formatted-string a', '#channel-name a');

    const { topics, entities } = extractCategoriesAndBrands(title, this.platform);
    for (const tok of tokenizeTitle(title)) {
      if (!topics.some((t) => t.name === tok)) topics.push({ name: tok });
    }
    if (channel) entities.push({ name: channel, kind: 'creator', platform: this.platform });

    return {
      topics,
      entities,
      pageTitle: title,
      pageUrl: location.href,
      contentId: new URLSearchParams(location.search).get('v') ?? undefined,
      pageKind: 'watch',
    };
  }
}
