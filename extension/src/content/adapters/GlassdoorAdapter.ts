import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import { heuristicTitle, heuristicCreator, heuristicUrl } from './MetadataHeuristics';
import type { ContentMetadata } from '@shared/types';

export class GlassdoorAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'glassdoor',
      cardSelector: [
        // Job listing cards
        'li.JobsList_jobListItem__wjTHv',
        'li[data-test="jobListing"]',
        'li.react-job-listing',
        // Job card containers
        'div.JobCard_jobCardContainer__arQci',
        'div[data-test="job-card"]',
        // Search result items
        'div.job-search-key-1',
        'article[data-brandviews]',
        // Company cards in explore
        'div[data-test="employer-card"]',
      ].join(', '),
      feedSelector: [
        'ul.JobsList_jobsList__lqjXs',
        'div[data-test="search-results"]',
        'div.JobsList_wrapper__EyUF6',
        'main[role="main"]',
        '#MainCol',
        '#SearchResults',
      ].join(', '),
    });
  }

  protected override isUserInitiatedSearch(): boolean {
    return location.pathname.includes('/Job/') || location.pathname.includes('/job-listing/');
  }

  extractMetadata(element: Element): ContentMetadata | null {
    try {
      // Job title
      const titleEl =
        element.querySelector('a[data-test="job-link"]') ??
        element.querySelector('.JobCard_jobTitle__GLyJ1') ??
        element.querySelector('.job-title') ??
        element.querySelector('a.jobLink');
      let title = titleEl ? extractTextContent(titleEl).trim() : '';
      if (!title) title = heuristicTitle(element) ?? '';
      if (!title) return null;

      // Company name
      const companyEl =
        element.querySelector('[data-test="emp-name"]') ??
        element.querySelector('.EmployerProfile_compactEmployerName__9MGcV') ??
        element.querySelector('.employer-name') ??
        element.querySelector('span[class*="EmployerName"]');
      let creator = companyEl ? extractTextContent(companyEl).trim() || undefined : undefined;
      if (!creator) creator = heuristicCreator(element) ?? undefined;

      // Location
      const locationEl =
        element.querySelector('[data-test="emp-location"]') ??
        element.querySelector('.JobCard_location__Ds5HD') ??
        element.querySelector('.location');
      const jobLocation = locationEl ? extractTextContent(locationEl).trim() : '';

      // Salary estimate
      const salaryEl =
        element.querySelector('[data-test="detailSalary"]') ??
        element.querySelector('.JobCard_salaryEstimate__QpMTi') ??
        element.querySelector('.salary-estimate');
      const salary = salaryEl ? extractTextContent(salaryEl).trim() : '';

      // Rating
      const ratingEl =
        element.querySelector('[data-test="rating"]') ?? element.querySelector('.rating');
      const rating = ratingEl?.textContent?.trim() ?? '';

      // Job link and ID
      const linkEl = element.querySelector(
        'a[href*="/job-listing/"], a[href*="/partner/"], a[data-test="job-link"]',
      ) as HTMLAnchorElement | null;
      let href = linkEl?.href ?? '';
      if (!href) href = heuristicUrl(element) ?? location.href;
      const jobIdMatch =
        href.match(/jobListingId=(\d+)/) ?? href.match(/\/job-listing\/[^/]+-(\d+)/);
      const id = jobIdMatch?.[1] ?? this.computeContentHash(element);

      // Detect sponsored listings
      const isAd =
        !!element.querySelector('[data-test="sponsored"]') ||
        Array.from(element.querySelectorAll('span')).some(
          (s) => s.textContent?.trim() === 'Sponsored' || s.textContent?.trim() === 'Featured',
        );

      return {
        id,
        platform: 'glassdoor',
        type: isAd ? 'ad' : 'job',
        title,
        creator,
        topics: ['jobs'],
        entities: creator ? [creator] : [],
        url: href,
        raw_metadata: {
          job_location: jobLocation,
          ...(salary ? { salary } : {}),
          ...(rating ? { rating } : {}),
        },
      };
    } catch {
      return null;
    }
  }
}
