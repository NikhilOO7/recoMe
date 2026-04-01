import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import { heuristicTitle, heuristicCreator, heuristicUrl } from './MetadataHeuristics';
import type { ContentMetadata } from '@shared/types';

export class InstagramAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'instagram',
      cardSelector: [
        // Standard feed posts and reels (home + profile)
        'article',
        // Explore grid items (thumbnail links to posts/reels)
        'a[href*="/p/"]:has(img)',
        'a[href*="/reel/"]:has(img)',
        'a[href*="/reel/"]:has(video)',
        // Profile grid photos (3-column grid on profile page)
        'div._aagw a[href*="/p/"]',
        'div[style*="flex"] a[href*="/p/"]',
        // Reels page items
        'div[role="button"][tabindex="0"] video',
        // Story tray highlights on profile
        'div[role="menuitem"] canvas',

        // ── Explore page grid ─────────────────────────────────────────
        'main a[href*="/p/"]',
        'main a[href*="/reel/"]',
        // Explore tiles (3-col grid with mixed media)
        'div[style*="grid"] a[href*="/p/"]',
        'div[style*="grid"] a[href*="/reel/"]',

        // ── Reels tab (dedicated /reels/ page) ───────────────────────
        'div[role="presentation"] video',
        'section video[src]',

        // ── Stories tray on home page ─────────────────────────────────
        'div[role="listbox"] button[aria-label]',
        'div[role="list"] div[role="listitem"]',

        // ── Shop tab ──────────────────────────────────────────────────
        'a[href*="/shop/"] div[role="button"]',
        'main a[href*="/shop/product/"]',
        '[data-testid="shop-product-card"]',
      ].join(', '),
      feedSelector: [
        'main[role="main"]',
        'main',
        // Reels section
        'div[role="main"]',
        // Modal / overlay dialogs (for post modals)
        'div[role="dialog"]',
        // Explore grid container
        'section main',
        // Stories tray
        'div[role="listbox"]',
        'div[role="list"]',
        // Shop section
        'div[data-testid="shop-container"]',
        '#react-root',
      ].join(', '),
    });
  }

  /** Detect the current Instagram page mode */
  private detectPageMode():
    | 'feed'
    | 'explore'
    | 'reels'
    | 'stories'
    | 'shop'
    | 'profile'
    | 'unknown' {
    const path = location.pathname;
    if (path === '/' || path === '/home') return 'feed';
    if (path.startsWith('/explore')) return 'explore';
    if (path.startsWith('/reels') || path.startsWith('/reel/')) return 'reels';
    if (path.startsWith('/stories')) return 'stories';
    if (path.startsWith('/shop')) return 'shop';
    // Profile pages: single-segment like /@username or /username
    if (/^\/[^/]+\/?$/.test(path) && !path.startsWith('/direct')) return 'profile';
    return 'unknown';
  }

  extractMetadata(element: Element): ContentMetadata | null {
    try {
      // Normalize: walk up to find the article or dialog container, or use the element itself
      const card =
        element.closest('article') ??
        element.closest('[role="dialog"]') ??
        element.closest('[role="presentation"]') ??
        element;

      // For profile grid items (bare <a> tags), extract directly from the link
      const isGridLink =
        element.tagName === 'A' && element.matches('a[href*="/p/"], a[href*="/reel/"]');

      // Creator username — first profile link in the post header
      let creator: string | undefined;
      if (isGridLink) {
        // On a profile page, the creator is the page owner — extract from URL or header
        const pathMatch = location.pathname.match(/^\/([^/]+)\/?$/);
        creator = pathMatch?.[1] || undefined;
      } else {
        const creatorEl =
          card.querySelector('header a[role="link"]') ??
          card.querySelector('header a[href^="/"]') ??
          card.querySelector('a[href^="/"][role="link"]');
        creator = creatorEl?.textContent?.trim() || undefined;
      }
      if (!creator) creator = heuristicCreator(card) ?? undefined;

      // Caption text — Instagram uses dir="auto" for user-generated text
      const captionEl =
        card.querySelector('span[dir="auto"]') ??
        card.querySelector('h1[dir="auto"]') ??
        card.querySelector('div[dir="auto"]');
      let captionText = '';
      if (captionEl) {
        captionText = extractTextContent(captionEl);
      }

      // Fall back to image alt text which often contains description
      if (!captionText) {
        const imgEl = card.querySelector('img[alt]:not([alt=""])') as HTMLImageElement | null;
        captionText = imgEl?.alt ?? '';
      }

      // For Reels: try aria-label
      if (!captionText) {
        captionText = card.getAttribute('aria-label') ?? '';
      }

      const caption = captionText.slice(0, 200).trim();
      let title = caption || (creator ? `Post by @${creator}` : '');
      if (!title)
        title = heuristicTitle(card) ?? (creator ? `Post by @${creator}` : 'Instagram post');

      // Stable ID from the post/reel link
      const linkEl = card.querySelector(
        'a[href*="/p/"], a[href*="/reel/"]',
      ) as HTMLAnchorElement | null;
      let href = linkEl?.href ?? '';
      if (!href) href = heuristicUrl(card) ?? '';
      const idMatch = href.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
      const id = idMatch?.[2] ?? this.computeContentHash(card);

      // Detect sponsored posts and branded/partnership content
      const allSpans = Array.from(card.querySelectorAll('span'));
      const isAd =
        allSpans.some(
          (s) =>
            s.textContent?.trim() === 'Sponsored' ||
            s.textContent?.trim() === 'Paid partnership' ||
            s.textContent?.trim() === 'Branded content',
        ) ||
        !!card.querySelector('a[href*="/ads/"]') ||
        !!card.querySelector('[aria-label*="Sponsored"]') ||
        !!card.querySelector('[aria-label*="Paid partnership"]');

      // Extract hashtags as topics
      const hashtags = [...captionText.matchAll(/#(\w+)/g)].map((m) => m[1]!.toLowerCase());

      // Page-mode-aware type detection
      const pageMode = this.detectPageMode();
      type ContentType = 'ad' | 'post' | 'video' | 'product';
      let contentType: ContentType = isAd ? 'ad' : href.includes('/reel/') ? 'video' : 'post';
      if (pageMode === 'reels' || pageMode === 'stories') contentType = isAd ? 'ad' : 'video';
      else if (pageMode === 'shop') contentType = isAd ? 'ad' : 'product';

      // Media type detection for richer metadata
      const hasVideo =
        !!card.querySelector('video') ||
        !!card.querySelector('[aria-label*="Video"]') ||
        !!card.querySelector('[aria-label*="Reel"]');
      const hasMultipleImages = (card.querySelectorAll('li[style*="translateX"]') ?? []).length > 1;

      // Like count if visible (for engagement context)
      const likeEl = card.querySelector('section span, button[type="button"] span');
      const likeText = likeEl?.textContent?.match(/^[\d,.]+ likes?$/i)?.[0] ?? '';

      return {
        id,
        platform: 'instagram',
        type: contentType,
        title,
        creator,
        topics: hashtags,
        entities: creator ? [creator] : [],
        url: href || location.href,
        raw_metadata: {
          ...(pageMode !== 'feed' ? { pageMode } : {}),
          ...(hasVideo ? { has_video: true } : {}),
          ...(hasMultipleImages ? { is_carousel: true } : {}),
          ...(likeText ? { likes: likeText } : {}),
        },
      };
    } catch {
      return null;
    }
  }
}
