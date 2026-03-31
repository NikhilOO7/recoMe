import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import { heuristicTitle, heuristicCreator, heuristicUrl } from './MetadataHeuristics';
import type { ContentMetadata } from '@shared/types';

type LinkedInPageType = 'feed' | 'jobs' | 'search' | 'profile' | 'unknown';

export class LinkedInAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'linkedin',
      cardSelector: [
        // Main feed posts
        'div.feed-shared-update-v2',
        'div[data-urn^="urn:li:activity"]',
        // Suggested posts / "People also viewed"
        'li.feed-shared-update-v2',
        // Job cards
        'li.jobs-search-results__list-item',
        'div.job-card-container',
        'li.scaffold-layout__list-item',
        // Search results
        'li.reusable-search__result-container',
        // News / articles sidebar
        'li.news-module__story-link',
        // People suggestions
        'li.feed-shared-pymk__member-item',
        'li[class*="pymk"]',
      ].join(', '),
      feedSelector: [
        'div.scaffold-finite-scroll__content',
        'main.scaffold-layout__main',
        'div.feed-shared-update-v2__content',
        'div[role="main"]',
        'main[role="main"]',
        '#main',
      ].join(', '),
    });
  }

  detectPageType(): LinkedInPageType {
    const path = location.pathname;
    if (path === '/feed' || path === '/') return 'feed';
    if (path.startsWith('/jobs')) return 'jobs';
    if (path.startsWith('/search')) return 'search';
    if (path.startsWith('/in/')) return 'profile';
    return 'unknown';
  }

  protected override isUserInitiatedSearch(): boolean {
    return location.pathname.startsWith('/search');
  }

  extractMetadata(element: Element): ContentMetadata | null {
    try {
      const pageType = this.detectPageType();

      if (pageType === 'jobs') return this.extractJobMetadata(element);

      // Feed posts, search results, articles
      return this.extractPostMetadata(element);
    } catch {
      return null;
    }
  }

  private extractPostMetadata(element: Element): ContentMetadata | null {
    // Author / creator
    const authorEl =
      element.querySelector('.feed-shared-actor__name span[aria-hidden="true"]') ??
      element.querySelector('.feed-shared-actor__name') ??
      element.querySelector('.update-components-actor__name span[aria-hidden="true"]') ??
      element.querySelector('.update-components-actor__name') ??
      element.querySelector('span.feed-shared-actor__title');
    let creator = authorEl ? extractTextContent(authorEl).split('\n')[0]?.trim() : undefined;
    if (!creator) creator = heuristicCreator(element) ?? undefined;

    // Post text
    const textEl =
      element.querySelector('.feed-shared-update-v2__description') ??
      element.querySelector('.feed-shared-text') ??
      element.querySelector('.update-components-text') ??
      element.querySelector('span[dir="ltr"]');
    const text = textEl ? extractTextContent(textEl) : '';

    // Title: use first 140 chars of text, or fall back to heuristics
    let title = text.slice(0, 140);
    if (!title) title = heuristicTitle(element) ?? '';
    if (!title && creator) title = `Post by ${creator}`;
    if (!title) return null;

    // Link / ID
    const linkEl = element.querySelector(
      'a[href*="/feed/update/"], a[href*="/posts/"]',
    ) as HTMLAnchorElement | null;
    let href = linkEl?.href ?? '';
    if (!href) href = heuristicUrl(element) ?? location.href;

    const urnMatch =
      element.getAttribute('data-urn')?.match(/urn:li:activity:(\d+)/) ??
      href.match(/activity[:-](\d+)/);
    const id = urnMatch?.[1] ?? this.computeContentHash(element);

    // Detect promoted/sponsored content
    const isAd =
      (!!element.querySelector('.feed-shared-actor__sub-description') &&
        (element
          .querySelector('.feed-shared-actor__sub-description')
          ?.textContent?.includes('Promoted') ??
          false)) ||
      Array.from(element.querySelectorAll('span')).some(
        (s) => s.textContent?.trim() === 'Promoted' || s.textContent?.trim() === 'Sponsored',
      );

    // Extract hashtags
    const hashtags = [...text.matchAll(/#(\w+)/g)].map((m) => m[1]!.toLowerCase());

    // Extract topics from description context
    const descEl = element.querySelector(
      '.feed-shared-actor__description, .update-components-actor__description',
    );
    const description = descEl ? extractTextContent(descEl) : '';

    return {
      id,
      platform: 'linkedin',
      type: isAd ? 'ad' : 'post',
      title,
      creator,
      topics: hashtags,
      entities: creator ? [creator] : [],
      url: href,
      raw_metadata: {
        full_text: text.slice(0, 500),
        description,
      },
    };
  }

  private extractJobMetadata(element: Element): ContentMetadata | null {
    // Job title
    const titleEl =
      element.querySelector('.job-card-list__title') ??
      element.querySelector('.job-card-container__link') ??
      element.querySelector('a.job-card-list__title--link') ??
      element.querySelector('strong');
    let title = titleEl ? extractTextContent(titleEl).trim() : '';
    if (!title) title = heuristicTitle(element) ?? '';
    if (!title) return null;

    // Company name
    const companyEl =
      element.querySelector('.job-card-container__primary-description') ??
      element.querySelector('.artdeco-entity-lockup__subtitle') ??
      element.querySelector('.job-card-container__company-name');
    const creator = companyEl ? extractTextContent(companyEl).trim() || undefined : undefined;

    // Job link
    const linkEl = element.querySelector('a[href*="/jobs/view/"]') as HTMLAnchorElement | null;
    let href = linkEl?.href ?? '';
    if (!href) href = heuristicUrl(element) ?? location.href;
    const jobIdMatch = href.match(/\/jobs\/view\/(\d+)/);
    const id = jobIdMatch?.[1] ?? this.computeContentHash(element);

    // Location / metadata
    const locationEl = element.querySelector(
      '.job-card-container__metadata-item, .artdeco-entity-lockup__caption',
    );
    const jobLocation = locationEl ? extractTextContent(locationEl).trim() : '';

    // Detect promoted job listings
    const isAd = Array.from(element.querySelectorAll('span')).some(
      (s) => s.textContent?.trim() === 'Promoted' || s.textContent?.trim() === 'Sponsored',
    );

    return {
      id,
      platform: 'linkedin',
      type: isAd ? 'ad' : 'article',
      title,
      creator,
      topics: ['jobs'],
      entities: creator ? [creator] : [],
      url: href,
      raw_metadata: {
        job_location: jobLocation,
      },
    };
  }
}
