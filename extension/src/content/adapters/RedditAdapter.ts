import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import { heuristicTitle, heuristicUrl } from './MetadataHeuristics';
import type { ContentMetadata } from '@shared/types';

/**
 * RedditAdapter — captures research signals from Reddit discussions.
 *
 * Thesis purpose: Reddit threads contain product research, comparisons,
 * and opinions that feed into the cross-platform research trail shown
 * on Amazon product pages.
 *
 * Covers: home feed, subreddit feeds, search results, post detail pages,
 * and comment threads on both new and old Reddit.
 */

type RedditPageType = 'home' | 'subreddit' | 'post' | 'search' | 'user' | 'unknown';

export class RedditAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'reddit',
      cardSelector: [
        // ── New Reddit (shreddit web components) ─────────────────────
        'shreddit-post',
        'article[data-testid="post-container"]',
        'div[data-testid="post-container"]',

        // ── New Reddit (React-based feed) ────────────────────────────
        'div[data-click-id="body"]',
        'div[data-adclicklocation="title"]',
        'div.Post',

        // ── Old Reddit ───────────────────────────────────────────────
        'div.thing[data-fullname]',
        'div.link[data-fullname]',

        // ── Search results ───────────────────────────────────────────
        'div[data-testid="search-result-link"]',
        'faceplate-tracker[source="search"]',

        // ── Comment threads (research signals in replies) ────────────
        'div[data-testid="comment"]',
        'shreddit-comment',
        'div.comment[data-fullname]',

        // ── Cross-post / embedded post ───────────────────────────────
        'div[data-testid="crosspost-container"]',
      ].join(', '),
      feedSelector: [
        // New Reddit
        'shreddit-feed',
        'div[data-testid="posts-list"]',
        'div[data-testid="post-list"]',
        'div.rpBJOHq2PR60pnwJlUyP0', // Reddit's main feed container (obfuscated but stable)

        // Old Reddit
        '#siteTable',
        'div.sitetable',
        'div.commentarea',

        // Search
        'div[data-testid="search-results"]',

        // Generic fallbacks
        'main',
        '#main-content',
        '[role="main"]',
      ].join(', '),
    });
  }

  private detectPageType(): RedditPageType {
    const path = location.pathname;
    if (
      path === '/' ||
      path === '/best/' ||
      path === '/hot/' ||
      path === '/new/' ||
      path === '/top/'
    )
      return 'home';
    if (path.startsWith('/r/') && path.includes('/comments/')) return 'post';
    if (path.startsWith('/r/')) return 'subreddit';
    if (path.startsWith('/search')) return 'search';
    if (path.startsWith('/user/') || path.startsWith('/u/')) return 'user';
    return 'unknown';
  }

  protected override isUserInitiatedSearch(): boolean {
    return location.pathname.startsWith('/search');
  }

  extractMetadata(element: Element): ContentMetadata | null {
    try {
      // Detect if this is a comment vs a post
      const isComment = element.matches(
        'div[data-testid="comment"], shreddit-comment, div.comment[data-fullname]',
      );

      if (isComment) {
        return this.extractCommentMetadata(element);
      }
      return this.extractPostMetadata(element);
    } catch {
      return null;
    }
  }

  private extractPostMetadata(element: Element): ContentMetadata | null {
    // ── Title extraction ──────────────────────────────────────────────
    const titleEl =
      element.querySelector('a[data-click-id="body"]') ??
      element.querySelector('h3') ??
      element.querySelector('h1') ??
      element.querySelector('[slot="title"]') ??
      element.querySelector('a.title') ?? // Old Reddit
      element.querySelector('p.title a'); // Old Reddit
    let title = titleEl ? extractTextContent(titleEl).trim() : '';
    if (!title) title = heuristicTitle(element) ?? '';
    if (!title || title.length < 5) return null;

    // ── Subreddit ─────────────────────────────────────────────────────
    const subredditEl =
      element.querySelector('a[data-click-id="subreddit"]') ??
      element.querySelector('a[href^="/r/"]') ??
      element.querySelector('faceplate-tracker[source="subreddit"]');
    const subreddit = subredditEl
      ? extractTextContent(subredditEl).trim().replace(/^r\//, '')
      : undefined;

    // ── Author ────────────────────────────────────────────────────────
    const authorEl =
      element.querySelector('a[data-click-id="user"]') ??
      element.querySelector('a[href^="/user/"]') ??
      element.querySelector('a[href^="/u/"]') ??
      element.querySelector('a.author'); // Old Reddit
    const author = authorEl ? extractTextContent(authorEl).trim().replace(/^u\//, '') : undefined;

    // ── Post URL ──────────────────────────────────────────────────────
    const linkEl =
      (element.querySelector('a[data-click-id="body"]') as HTMLAnchorElement) ??
      (element.querySelector('a[href*="/comments/"]') as HTMLAnchorElement) ??
      (element.querySelector('a.bylink') as HTMLAnchorElement); // Old Reddit
    let href = linkEl?.href ?? '';
    if (!href) href = heuristicUrl(element) ?? '';

    // ── Post ID ───────────────────────────────────────────────────────
    const fullname = element.getAttribute('data-fullname') ?? '';
    const postId =
      fullname || href.match(/\/comments\/([a-z0-9]+)/)?.[1] || this.computeContentHash(element);

    // ── Flair / tags (useful for research categorization) ─────────────
    const flairEl =
      element.querySelector('[data-click-id="flair"]') ??
      element.querySelector('span.linkflairlabel') ?? // Old Reddit
      element.querySelector('faceplate-tracker[source="post_flair"]');
    const flair = flairEl ? extractTextContent(flairEl).trim() : undefined;

    // ── Score (engagement signal) ─────────────────────────────────────
    const scoreEl =
      element.querySelector('[data-click-id="score"]') ??
      element.querySelector('div.score') ??
      element.querySelector('.score.unvoted');
    const scoreText = scoreEl?.textContent?.trim();

    // ── Topics: extract from title keywords + subreddit + flair ────────
    const topics: string[] = [];
    if (subreddit) topics.push(subreddit);
    if (flair) topics.push(flair);

    // ── Ad detection ──────────────────────────────────────────────────
    const isAd =
      !!element.querySelector('[data-click-id="promoted"]') ||
      !!element.querySelector('.promoted') ||
      element.getAttribute('data-promoted') === 'true' ||
      !!element.closest('[data-adclicklocation]');

    return {
      id: postId,
      platform: 'reddit',
      type: isAd ? 'ad' : 'post',
      title,
      creator: author,
      topics,
      entities: subreddit ? [subreddit] : [],
      url: href,
      raw_metadata: {
        subreddit: subreddit ?? '',
        ...(flair ? { flair } : {}),
        ...(scoreText ? { score: scoreText } : {}),
        source: 'reddit',
      },
    };
  }

  private extractCommentMetadata(element: Element): ContentMetadata | null {
    // Comments are valuable research signals — opinions, recommendations, warnings
    const textEl =
      element.querySelector('div[data-testid="comment"] p') ??
      element.querySelector('[slot="comment"]') ??
      element.querySelector('div.md') ?? // Old Reddit
      element.querySelector('p');
    const text = textEl ? extractTextContent(textEl).trim() : '';
    if (!text || text.length < 20) return null; // Skip very short comments

    const authorEl =
      element.querySelector('a[href^="/user/"]') ??
      element.querySelector('a[href^="/u/"]') ??
      element.querySelector('a.author');
    const author = authorEl ? extractTextContent(authorEl).trim().replace(/^u\//, '') : undefined;

    const commentId =
      element.getAttribute('data-fullname') ??
      element.getAttribute('thingid') ??
      this.computeContentHash(element);

    // Extract subreddit from URL context
    const subredditMatch = location.pathname.match(/^\/r\/([^/]+)/);
    const subreddit = subredditMatch?.[1];

    return {
      id: commentId,
      platform: 'reddit',
      type: 'post', // Comments treated as research signals
      title: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      creator: author,
      topics: subreddit ? [subreddit] : [],
      entities: [],
      url: location.href,
      raw_metadata: {
        subreddit: subreddit ?? '',
        is_comment: 'true',
        source: 'reddit',
      },
    };
  }
}
