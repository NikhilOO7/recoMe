/**
 * @jest-environment jsdom
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const FIXTURES_DIR = resolve(__dirname, '../__fixtures__');

function loadFixture(name: string): Document {
  const html = readFileSync(resolve(FIXTURES_DIR, name), 'utf-8');
  document.body.innerHTML = html;
  return document;
}

// Selector definitions matching each adapter's constructor config
const ADAPTERS: Record<
  string,
  {
    fixture: string;
    cardSelectors: string[];
    feedSelectors: string[];
    expectedCardCount: number;
  }
> = {
  Amazon: {
    fixture: 'amazon-search-card.html',
    cardSelectors: [
      '[data-component-type="s-search-result"]',
      '.s-result-item[data-asin]:not(.AdHolder)',
    ],
    feedSelectors: ['[data-component-type="s-search-results"]', '.s-main-slot'],
    expectedCardCount: 1,
  },
  YouTube: {
    fixture: 'youtube-home-card.html',
    cardSelectors: ['ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer'],
    feedSelectors: ['ytd-browse', 'ytd-two-column-browse-results-renderer'],
    expectedCardCount: 1,
  },
  Twitter: {
    fixture: 'twitter-tweet.html',
    cardSelectors: ['article[data-testid="tweet"]', 'div[data-testid="trend"]'],
    feedSelectors: ['[data-testid="primaryColumn"]', 'main[role="main"]'],
    expectedCardCount: 1,
  },
  eBay: {
    fixture: 'ebay-search-item.html',
    cardSelectors: ['.s-item:not(.s-item--placeholder)'],
    feedSelectors: ['.srp-results', '#ResultSetItems', '.srp-river-main'],
    expectedCardCount: 1,
  },
  Walmart: {
    fixture: 'walmart-search-item.html',
    cardSelectors: ['[data-automation-id="product-container"]', '[data-item-id]'],
    feedSelectors: [
      '[data-automation-id="search-result-set"]',
      'section[aria-label*="Search Results"]',
    ],
    expectedCardCount: 1,
  },
  Instagram: {
    fixture: 'instagram-feed-post.html',
    cardSelectors: ['article'],
    feedSelectors: ['main[role="main"]', 'main'],
    expectedCardCount: 1,
  },
  Facebook: {
    fixture: 'facebook-feed-unit.html',
    cardSelectors: ['div[data-pagelet^="FeedUnit"]', 'div[role="article"][aria-label]'],
    feedSelectors: ['[role="feed"]', '[role="main"]'],
    expectedCardCount: 1,
  },
};

describe('Adapter selector validation', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  for (const [platform, config] of Object.entries(ADAPTERS)) {
    describe(platform, () => {
      it('card selectors match at least one element in fixture', () => {
        loadFixture(config.fixture);
        const combined = config.cardSelectors.join(', ');
        const matches = document.querySelectorAll(combined);
        expect(matches.length).toBeGreaterThanOrEqual(config.expectedCardCount);
      });

      it('feed selectors match at least one container in fixture', () => {
        loadFixture(config.fixture);
        const combined = config.feedSelectors.join(', ');
        const matches = document.querySelectorAll(combined);
        expect(matches.length).toBeGreaterThanOrEqual(1);
      });

      it('each card selector individually matches something or is a valid selector', () => {
        loadFixture(config.fixture);
        let anyMatched = false;
        for (const selector of config.cardSelectors) {
          // Should not throw (valid CSS selector)
          const result = document.querySelectorAll(selector);
          if (result.length > 0) anyMatched = true;
        }
        // At least one of the card selectors should match
        expect(anyMatched).toBe(true);
      });
    });
  }
});

describe('Fixture files exist and are valid HTML', () => {
  for (const [platform, config] of Object.entries(ADAPTERS)) {
    it(`${platform} fixture is loadable`, () => {
      expect(() => loadFixture(config.fixture)).not.toThrow();
      expect(document.body.innerHTML.length).toBeGreaterThan(0);
    });
  }
});
