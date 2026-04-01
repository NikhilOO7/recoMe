import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import { heuristicTitle, heuristicCreator, heuristicUrl } from './MetadataHeuristics';
import type { ContentMetadata } from '@shared/types';

/**
 * LinkedInAdapter — dedicated adapter covering feed, jobs, search,
 * company pages, groups, notifications, and articles.
 *
 * Sprint 1 (P1.1): Promoted from generic fallback reliance to a fully
 * deterministic adapter with explicit page-type selectors and metadata
 * extraction for each LinkedIn surface.
 */

type LinkedInPageType =
  | 'feed'
  | 'jobs'
  | 'search'
  | 'company'
  | 'groups'
  | 'notifications'
  | 'article'
  | 'profile'
  | 'unknown';

export class LinkedInAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'linkedin',
      cardSelector: [
        // ── Main feed posts ─────────────────────────────────────────────
        'div.feed-shared-update-v2',
        'div[data-urn^="urn:li:activity"]',
        'li.feed-shared-update-v2',
        // Newer feed card wrappers (2025+ redesign)
        'div[data-id^="urn:li:activity"]',
        'div[data-urn^="urn:li:ugcPost"]',

        // ── Job cards ───────────────────────────────────────────────────
        'li.jobs-search-results__list-item',
        'div.job-card-container',
        'li.scaffold-layout__list-item',
        // Job collections / recommendations
        'div.jobs-unified-top-card',
        'li.job-card-container--clickable',
        'div[data-job-id]',
        // "Jobs you might be interested in" shelf
        'li.ember-view.occludable-update',

        // ── Search results ──────────────────────────────────────────────
        'li.reusable-search__result-container',
        'div.search-result__wrapper',
        // Search entity results (people, companies, posts)
        'li[data-chameleon-result-urn]',

        // ── Company pages ───────────────────────────────────────────────
        // Company feed posts on /company/<name>/posts
        'div.org-update-card',
        'div[data-urn^="urn:li:activity"].org-social-detail',
        // Company "People also viewed" sidebar
        'li.org-people-profile-card',
        'li.org-grid__content-card',
        // Company jobs section
        'li.org-jobs-job-card',

        // ── Groups ──────────────────────────────────────────────────────
        'div.groups-entity',
        'div.groups-post',
        // Group feed posts share the same update structure as main feed
        'div.feed-shared-update-v2[data-urn*="group"]',
        // Group discover cards
        'li.groups-discover-entity',

        // ── Notifications ───────────────────────────────────────────────
        'div.nt-card',
        'article.nt-card',
        'div[data-urn^="urn:li:notification"]',

        // ── Articles / Newsletters ──────────────────────────────────────
        'div.reader-article-content',
        'article.article-card',
        'li.article-card',

        // ── News / sidebar items ────────────────────────────────────────
        'li.news-module__story-link',
        'li.news-module__headline',

        // ── People suggestions / PYMK ───────────────────────────────────
        'li.feed-shared-pymk__member-item',
        'li[class*="pymk"]',
        'div.discover-entity-card',

        // ── Learning / course recommendations ───────────────────────────
        'li.learning-top-course-card',
        'div.learning-course-card',
      ].join(', '),
      feedSelector: [
        'div.scaffold-finite-scroll__content',
        'main.scaffold-layout__main',
        'div.feed-shared-update-v2__content',
        // Job listings container
        'div.jobs-search-results-list',
        'ul.scaffold-layout__list-container',
        // Company page content
        'div.org-grid__content',
        'section.org-page-details-module',
        // Groups container
        'div.groups-container',
        // Notifications panel
        'div.nt-card-list',
        // Search results
        'div.search-results-container',
        // Generic fallbacks
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
    if (path.startsWith('/company/') || path.startsWith('/school/')) return 'company';
    if (path.startsWith('/groups/')) return 'groups';
    if (path.startsWith('/notifications')) return 'notifications';
    if (path.startsWith('/pulse/') || path.startsWith('/newsletters/')) return 'article';
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
      if (pageType === 'company') return this.extractCompanyMetadata(element);
      if (pageType === 'notifications') return this.extractNotificationMetadata(element);

      // Feed posts, search results, articles, groups
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
      element.querySelector('span.feed-shared-actor__title') ??
      // Groups and company posts may use different selectors
      element.querySelector('.groups-post__author-name') ??
      element.querySelector('.org-update-card__author');
    let creator = authorEl ? extractTextContent(authorEl).split('\n')[0]?.trim() : undefined;
    if (!creator) creator = heuristicCreator(element) ?? undefined;

    // Post text
    const textEl =
      element.querySelector('.feed-shared-update-v2__description') ??
      element.querySelector('.feed-shared-text') ??
      element.querySelector('.update-components-text') ??
      element.querySelector('.groups-post__text') ??
      element.querySelector('span[dir="ltr"]');
    const text = textEl ? extractTextContent(textEl) : '';

    // Title: use first 140 chars of text, or fall back to heuristics
    let title = text.slice(0, 140);
    if (!title) title = heuristicTitle(element) ?? '';
    if (!title && creator) title = `Post by ${creator}`;
    if (!title) return null;

    // Link / ID
    const linkEl = element.querySelector(
      'a[href*="/feed/update/"], a[href*="/posts/"], a[href*="/pulse/"]',
    ) as HTMLAnchorElement | null;
    let href = linkEl?.href ?? '';
    if (!href) href = heuristicUrl(element) ?? location.href;

    const urnMatch =
      element.getAttribute('data-urn')?.match(/urn:li:(?:activity|ugcPost):(\d+)/) ??
      element.getAttribute('data-id')?.match(/urn:li:(?:activity|ugcPost):(\d+)/) ??
      href.match(/activity[:-](\d+)/);
    const id = urnMatch?.[1] ?? this.computeContentHash(element);

    // Detect promoted/sponsored content
    const isAd =
      (!!element.querySelector('.feed-shared-actor__sub-description') &&
        (element
          .querySelector('.feed-shared-actor__sub-description')
          ?.textContent?.includes('Promoted') ??
          false)) ||
      !!element.querySelector('[data-ad-banner]') ||
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

    // Engagement metrics (likes, comments) for ranking context
    const socialCountEl = element.querySelector(
      '.social-details-social-counts, .feed-shared-social-counts',
    );
    const socialText = socialCountEl ? extractTextContent(socialCountEl).trim() : '';

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
        ...(socialText ? { engagement: socialText } : {}),
      },
    };
  }

  private extractJobMetadata(element: Element): ContentMetadata | null {
    // Job title
    const titleEl =
      element.querySelector('.job-card-list__title') ??
      element.querySelector('.job-card-container__link') ??
      element.querySelector('a.job-card-list__title--link') ??
      element.querySelector('.jobs-unified-top-card__job-title') ??
      element.querySelector('h2.job-card-container__link') ??
      element.querySelector('strong');
    let title = titleEl ? extractTextContent(titleEl).trim() : '';
    if (!title) title = heuristicTitle(element) ?? '';
    if (!title) return null;

    // Company name
    const companyEl =
      element.querySelector('.job-card-container__primary-description') ??
      element.querySelector('.artdeco-entity-lockup__subtitle') ??
      element.querySelector('.job-card-container__company-name') ??
      element.querySelector('.jobs-unified-top-card__company-name');
    const creator = companyEl ? extractTextContent(companyEl).trim() || undefined : undefined;

    // Job link
    const linkEl = element.querySelector('a[href*="/jobs/view/"]') as HTMLAnchorElement | null;
    let href = linkEl?.href ?? '';
    if (!href) href = heuristicUrl(element) ?? location.href;
    const jobIdMatch =
      href.match(/\/jobs\/view\/(\d+)/) ?? element.getAttribute('data-job-id')?.match(/(\d+)/);
    const id = jobIdMatch?.[1] ?? this.computeContentHash(element);

    // Location / metadata
    const locationEl = element.querySelector(
      '.job-card-container__metadata-item, .artdeco-entity-lockup__caption, ' +
        '.jobs-unified-top-card__bullet',
    );
    const jobLocation = locationEl ? extractTextContent(locationEl).trim() : '';

    // Salary info if available
    const salaryEl = element.querySelector(
      '.job-card-container__salary-info, .salary-main-rail__header',
    );
    const salary = salaryEl ? extractTextContent(salaryEl).trim() : '';

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
        ...(salary ? { salary } : {}),
      },
    };
  }

  private extractCompanyMetadata(element: Element): ContentMetadata | null {
    // Company page posts use standard update structure
    const isUpdate =
      element.matches('div.org-update-card') || element.matches('div[data-urn^="urn:li:activity"]');
    if (isUpdate) return this.extractPostMetadata(element);

    // Company "People also viewed" or employee cards
    const nameEl =
      element.querySelector('.org-people-profile-card__profile-title') ??
      element.querySelector('.artdeco-entity-lockup__title') ??
      element.querySelector('a[href^="/in/"]');
    let title = nameEl ? extractTextContent(nameEl).trim() : '';
    if (!title) title = heuristicTitle(element) ?? '';
    if (!title) return null;

    const linkEl = element.querySelector(
      'a[href^="/in/"], a[href^="/company/"]',
    ) as HTMLAnchorElement | null;
    const href = linkEl?.href ?? heuristicUrl(element) ?? location.href;

    const subtitleEl = element.querySelector(
      '.artdeco-entity-lockup__subtitle, .org-people-profile-card__subtitle',
    );
    const subtitle = subtitleEl ? extractTextContent(subtitleEl).trim() : '';

    return {
      id: this.computeContentHash(element),
      platform: 'linkedin',
      type: 'post',
      title,
      creator: subtitle || undefined,
      topics: [],
      entities: title ? [title] : [],
      url: href,
    };
  }

  private extractNotificationMetadata(element: Element): ContentMetadata | null {
    const textEl =
      element.querySelector('.nt-card__text') ??
      element.querySelector('.nt-card__headline') ??
      element.querySelector('p') ??
      element.querySelector('span');
    const text = textEl ? extractTextContent(textEl).trim() : '';
    if (!text || text.length < 10) return null;

    const linkEl = element.querySelector('a') as HTMLAnchorElement | null;
    const href = linkEl?.href ?? location.href;

    const urnMatch = element.getAttribute('data-urn')?.match(/urn:li:notification:(\d+)/) ?? null;
    const id = urnMatch?.[1] ?? this.computeContentHash(element);

    return {
      id,
      platform: 'linkedin',
      type: 'post',
      title: text.slice(0, 140),
      topics: [],
      entities: [],
      url: href,
    };
  }
}
