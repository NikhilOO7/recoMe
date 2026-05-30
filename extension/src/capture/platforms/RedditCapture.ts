import {
  PlatformCapture,
  type PageExtract,
  extractCategoriesAndBrands,
  pickText,
  tokenizeTitle,
} from '../PlatformCapture';
import type { Platform, SignalEntity, SignalTopic } from '@shared/types';

export class RedditCapture extends PlatformCapture {
  readonly platform: Platform = 'reddit';

  override pageKind(): string {
    if (location.pathname.includes('/comments/')) return 'post';
    if (location.pathname.startsWith('/r/')) return 'subreddit';
    return 'page';
  }

  extract(): PageExtract | null {
    const subMatch = location.pathname.match(/^\/r\/([^/]+)/);
    const subreddit = subMatch?.[1];

    const topics: SignalTopic[] = [];
    const entities: SignalEntity[] = [];
    let pageTitle = document.title;
    let pageKind = 'page';
    let contentId: string | undefined;

    if (subreddit) {
      const { topics: cats } = extractCategoriesAndBrands(subreddit, this.platform);
      if (cats.length > 0) {
        topics.push(...cats);
      } else {
        topics.push({ name: subreddit.toLowerCase() });
      }
      pageKind = 'subreddit';
    }

    if (location.pathname.includes('/comments/')) {
      pageKind = 'post';
      const postIdMatch = location.pathname.match(/\/comments\/([a-z0-9]+)/);
      contentId = postIdMatch?.[1];

      const postTitle = pickText(
        'shreddit-post h1',
        '[data-testid="post-container"] h1',
        'h1',
        'a.title',
      );
      if (postTitle) {
        pageTitle = postTitle;
        const cb = extractCategoriesAndBrands(postTitle, this.platform);
        for (const t of cb.topics) {
          if (!topics.some((x) => x.name === t.name)) topics.push(t);
        }
        entities.push(...cb.entities);
        for (const tok of tokenizeTitle(postTitle)) {
          if (!topics.some((x) => x.name === tok)) topics.push({ name: tok });
        }
      }
    }

    if (topics.length === 0 && entities.length === 0) return null;

    return { topics, entities, pageTitle, pageUrl: location.href, contentId, pageKind };
  }
}
