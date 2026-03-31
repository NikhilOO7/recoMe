import { BaseAdapter } from './BaseAdapter';
import { extractTextContent } from '@shared/utils';
import { heuristicTitle, heuristicCreator, heuristicUrl } from './MetadataHeuristics';
import type { ContentMetadata } from '@shared/types';

export class IndeedAdapter extends BaseAdapter {
  constructor() {
    super({
      platform: 'indeed',
      cardSelector: [
        // Search result job cards
        'div.job_seen_beacon',
        'div.jobsearch-ResultsList div.result',
        'li.css-5lfssm',
        'div[data-jk]',
        // Job card containers
        'td.resultContent',
        'div.slider_container .slider_item',
        // Mosaic tiles
        'a.jcs-JobTitle',
        // Company review cards
        'div[data-tn-component="organicJob"]',
      ].join(', '),
      feedSelector: [
        '#mosaic-provider-jobcards',
        '#resultsCol',
        '#mosaic-jobResults',
        'div.jobsearch-ResultsList',
        'main[role="main"]',
        '#main-content',
      ].join(', '),
    });
  }

  protected override isUserInitiatedSearch(): boolean {
    return location.pathname.startsWith('/jobs') || !!new URLSearchParams(location.search).get('q');
  }

  extractMetadata(element: Element): ContentMetadata | null {
    try {
      // Job title
      const titleEl =
        element.querySelector('h2.jobTitle a') ??
        element.querySelector('h2.jobTitle span') ??
        element.querySelector('a.jcs-JobTitle') ??
        element.querySelector('[data-testid="jobTitle"]') ??
        element.querySelector('.jobTitle');
      let title = titleEl ? extractTextContent(titleEl).trim() : '';
      if (!title) title = heuristicTitle(element) ?? '';
      if (!title) return null;

      // Company name
      const companyEl =
        element.querySelector('[data-testid="company-name"]') ??
        element.querySelector('span.companyName') ??
        element.querySelector('.company_location .companyName') ??
        element.querySelector('span[data-testid="company-name"]');
      let creator = companyEl ? extractTextContent(companyEl).trim() || undefined : undefined;
      if (!creator) creator = heuristicCreator(element) ?? undefined;

      // Job location
      const locationEl =
        element.querySelector('[data-testid="text-location"]') ??
        element.querySelector('div.companyLocation') ??
        element.querySelector('.company_location .companyLocation');
      const jobLocation = locationEl ? extractTextContent(locationEl).trim() : '';

      // Salary snippet
      const salaryEl =
        element.querySelector('.salary-snippet-container') ??
        element.querySelector('[data-testid="attribute_snippet_testid"]') ??
        element.querySelector('.estimated-salary');
      const salary = salaryEl ? extractTextContent(salaryEl).trim() : '';

      // Job link and ID
      const linkEl = element.querySelector(
        'a[href*="/viewjob"], a[href*="/rc/clk"], a.jcs-JobTitle',
      ) as HTMLAnchorElement | null;
      let href = linkEl?.href ?? '';
      if (!href) href = heuristicUrl(element) ?? location.href;
      const jobKey =
        element.getAttribute('data-jk') ??
        href.match(/jk=([a-f0-9]+)/)?.[1] ??
        this.computeContentHash(element);

      // Detect sponsored listings
      const isAd =
        !!element.querySelector('.sponsoredJob') ||
        !!element.querySelector('[data-testid="sponsoredJob"]') ||
        Array.from(element.querySelectorAll('span')).some(
          (s) => s.textContent?.trim() === 'Sponsored' || s.textContent?.trim() === 'Promoted',
        );

      return {
        id: jobKey,
        platform: 'indeed',
        type: isAd ? 'ad' : 'job',
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
    } catch {
      return null;
    }
  }
}
