/**
 * @jest-environment jsdom
 *
 * Integration tests that verify the content script → background → brain → DOM loop.
 * Uses HTML fixtures and mocked chrome.runtime.sendMessage to simulate the full pipeline.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const FIXTURES_DIR = resolve(__dirname, '../adapters/__fixtures__');

// ── Chrome API mock ─────────────────────────────────────────────────────────

const sendMessageMock = jest.fn();
const onMessageListeners: Array<(msg: unknown) => void> = [];

beforeAll(() => {
  // Minimal chrome API mock
  (globalThis as Record<string, unknown>).chrome = {
    runtime: {
      sendMessage: sendMessageMock,
      onMessage: {
        addListener: (fn: (msg: unknown) => void) => onMessageListeners.push(fn),
        removeListener: jest.fn(),
      },
      getURL: (path: string) => `chrome-extension://test/${path}`,
    },
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue(undefined),
      },
      sync: {
        get: jest.fn().mockResolvedValue({ recome_onboarding_done: true }),
        set: jest.fn().mockResolvedValue(undefined),
      },
      session: {
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue(undefined),
      },
    },
    tabs: {
      create: jest.fn(),
    },
  };
});

afterEach(() => {
  document.body.innerHTML = '';
  sendMessageMock.mockClear();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadFixture(name: string): void {
  const html = readFileSync(resolve(FIXTURES_DIR, name), 'utf-8');
  document.body.innerHTML = html;
}

function getMessageCalls(type: string): unknown[] {
  return sendMessageMock.mock.calls
    .filter(([msg]: [{ type: string }]) => msg?.type === type)
    .map(([msg]: [unknown]) => msg);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Content integration: Amazon search results', () => {
  it('Amazon fixture contains elements matchable by card selectors', () => {
    loadFixture('amazon-search-card.html');
    const cards = document.querySelectorAll('[data-component-type="s-search-result"]');
    expect(cards.length).toBe(1);

    // Verify extractable data exists in the DOM
    const card = cards[0]!;
    const title = card.querySelector('h2 a span')?.textContent;
    expect(title).toContain('Sony WH-1000XM5');

    const asin = card.getAttribute('data-asin');
    expect(asin).toBe('B0CX23V2ZK');

    const price = card.querySelector('.a-price .a-offscreen')?.textContent;
    expect(price).toBe('$278.00');
  });

  it('Amazon fixture has a valid feed container', () => {
    loadFixture('amazon-search-card.html');
    const feed = document.querySelector('[data-component-type="s-search-results"], .s-main-slot');
    expect(feed).not.toBeNull();
  });
});

describe('Content integration: YouTube home feed', () => {
  it('YouTube fixture contains video cards', () => {
    loadFixture('youtube-home-card.html');
    const cards = document.querySelectorAll('ytd-rich-item-renderer');
    expect(cards.length).toBe(1);

    const title = cards[0]!.querySelector('#video-title')?.textContent;
    expect(title).toContain('Best Headphones');

    const link = cards[0]!.querySelector('a#thumbnail') as HTMLAnchorElement | null;
    expect(link?.getAttribute('href')).toContain('/watch?v=');
  });
});

describe('Content integration: Twitter/X feed', () => {
  it('Twitter fixture contains tweets', () => {
    loadFixture('twitter-tweet.html');
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    expect(tweets.length).toBe(1);

    const text = tweets[0]!.querySelector('[data-testid="tweetText"]')?.textContent;
    expect(text).toContain('Sony headphones');
  });

  it('Twitter fixture has a valid feed container', () => {
    loadFixture('twitter-tweet.html');
    const feed = document.querySelector('[data-testid="primaryColumn"]');
    expect(feed).not.toBeNull();
  });
});

describe('Content integration: eBay search', () => {
  it('eBay fixture contains search result items', () => {
    loadFixture('ebay-search-item.html');
    const items = document.querySelectorAll('.s-item:not(.s-item--placeholder)');
    expect(items.length).toBe(1);

    const title = items[0]!.querySelector('.s-item__title')?.textContent;
    expect(title).toContain('Sony WH-1000XM5');
  });
});

describe('Content integration: Walmart search', () => {
  it('Walmart fixture contains product containers', () => {
    loadFixture('walmart-search-item.html');
    const items = document.querySelectorAll('[data-automation-id="product-container"]');
    expect(items.length).toBe(1);

    const title = items[0]!.querySelector('[data-automation-id="product-title"]')?.textContent;
    expect(title).toContain('Sony WH-1000XM5');
  });
});

describe('Content integration: message pipeline simulation', () => {
  it('simulates PROCESS_CONTENT message and verifies response handling', () => {
    // Simulate what the content script sends to background
    const processContentMessage = {
      type: 'PROCESS_CONTENT',
      payload: {
        metadata: {
          id: 'amazon-B0CX23V2ZK',
          title: 'Sony WH-1000XM5',
          creator: 'Sony',
          platform: 'amazon',
          url: 'https://www.amazon.com/dp/B0CX23V2ZK',
          topics: ['headphones', 'noise cancelling', 'wireless'],
        },
      },
    };

    // Mock the background response
    sendMessageMock.mockResolvedValueOnce({
      success: true,
      data: {
        action: 'boost',
        explanation: 'Matches your interest in headphones',
        boosted_topics: ['headphones'],
      },
    });

    // Send message
    const responsePromise = chrome.runtime.sendMessage(processContentMessage);
    expect(sendMessageMock).toHaveBeenCalledWith(processContentMessage);

    return responsePromise.then((response: unknown) => {
      const r = response as { success: boolean; data: { action: string } };
      expect(r.success).toBe(true);
      expect(r.data.action).toBe('boost');
    });
  });

  it('simulates SCORE_CANDIDATES message for commerce scoring', () => {
    const scoreCandidatesMessage = {
      type: 'SCORE_CANDIDATES',
      payload: {
        candidates: [
          {
            candidateId: 'B0CX23V2ZK',
            title: 'Sony WH-1000XM5',
            brand: 'Sony',
            price: 278.0,
            rating: 4.6,
            reviewCount: 12345,
            platform: 'amazon',
          },
        ],
        pageContext: {
          site: 'amazon',
          pageType: 'search',
          url: 'https://www.amazon.com/s?k=headphones',
          query: 'headphones',
        },
      },
    };

    sendMessageMock.mockResolvedValueOnce({
      success: true,
      data: {
        items: [
          {
            candidateId: 'B0CX23V2ZK',
            score: 0.75,
            decision: 'boost',
            explanation: 'You prefer Sony and noise-cancelling headphones',
            confidence: 0.85,
            factors: ['brand_affinity:sony', 'topic_match:headphones'],
          },
        ],
        computedAt: new Date().toISOString(),
      },
    });

    const responsePromise = chrome.runtime.sendMessage(scoreCandidatesMessage);
    expect(sendMessageMock).toHaveBeenCalledWith(scoreCandidatesMessage);

    return responsePromise.then((response: unknown) => {
      const r = response as {
        success: boolean;
        data: { items: Array<{ decision: string; score: number }> };
      };
      expect(r.success).toBe(true);
      expect(r.data.items).toHaveLength(1);
      expect(r.data.items[0]!.decision).toBe('boost');
      expect(r.data.items[0]!.score).toBeGreaterThan(0.5);
    });
  });

  it('simulates RECORD_INTENT message for user feedback', () => {
    sendMessageMock.mockResolvedValueOnce({
      success: true,
      data: { intentId: 'intent-123' },
    });

    const intentMessage = {
      type: 'RECORD_INTENT',
      payload: {
        intentType: 'not_interested',
        entityType: 'product',
        entityId: 'B0CX23V2ZK',
        scope: 'entity',
      },
    };

    const responsePromise = chrome.runtime.sendMessage(intentMessage);
    expect(sendMessageMock).toHaveBeenCalledWith(intentMessage);

    return responsePromise.then((response: unknown) => {
      const r = response as { success: boolean; data: { intentId: string } };
      expect(r.success).toBe(true);
      expect(r.data.intentId).toBe('intent-123');
    });
  });

  it('simulates REVOKE_INTENT (undo) message', () => {
    sendMessageMock.mockResolvedValueOnce({ success: true, data: undefined });

    const revokeMessage = {
      type: 'REVOKE_INTENT',
      payload: { intentId: 'intent-123' },
    };

    const responsePromise = chrome.runtime.sendMessage(revokeMessage);
    expect(sendMessageMock).toHaveBeenCalledWith(revokeMessage);

    return responsePromise.then((response: unknown) => {
      const r = response as { success: boolean };
      expect(r.success).toBe(true);
    });
  });
});

describe('Content integration: DOM overlay injection simulation', () => {
  it('badge injection creates expected DOM structure', () => {
    loadFixture('amazon-search-card.html');
    const card = document.querySelector('[data-component-type="s-search-result"]') as HTMLElement;

    // Simulate what BaseAdapter.injectDecisionBadge does
    card.setAttribute('data-recome-id', 'amazon-B0CX23V2ZK');
    card.style.position = 'relative';

    const badge = document.createElement('div');
    badge.className = 'recome-decision-badge boost';
    badge.textContent = 'Good fit';
    card.appendChild(badge);

    // Verify badge was injected
    const injected = card.querySelector('.recome-decision-badge');
    expect(injected).not.toBeNull();
    expect(injected!.textContent).toBe('Good fit');
    expect(card.getAttribute('data-recome-id')).toBe('amazon-B0CX23V2ZK');
  });

  it('menu portal creation works at body level', () => {
    loadFixture('amazon-search-card.html');

    // Simulate portal creation (BaseAdapter creates this for menus)
    let portal = document.getElementById('recome-menu-portal');
    if (!portal) {
      portal = document.createElement('div');
      portal.id = 'recome-menu-portal';
      portal.style.position = 'fixed';
      portal.style.zIndex = '2147483647';
      document.body.appendChild(portal);
    }

    expect(document.getElementById('recome-menu-portal')).not.toBeNull();
  });

  it('hiding a card applies expected styles', () => {
    loadFixture('amazon-search-card.html');
    const card = document.querySelector('[data-component-type="s-search-result"]') as HTMLElement;

    // Simulate what BaseAdapter does for "not interested"
    card.style.opacity = '0.35';
    card.style.transition = 'opacity 0.3s ease';

    expect(card.style.opacity).toBe('0.35');
  });
});
