/**
 * @jest-environment jsdom
 */

import { buildPathPattern } from '../PathPatternCache';

describe('buildPathPattern', () => {
  describe('YouTube', () => {
    it('maps root to home', () => {
      expect(buildPathPattern(new URL('https://www.youtube.com/'))).toBe('home');
    });

    it('maps /watch to watch', () => {
      expect(buildPathPattern(new URL('https://www.youtube.com/watch?v=abc123'))).toBe('watch');
    });

    it('maps /shorts/* to shorts', () => {
      expect(buildPathPattern(new URL('https://www.youtube.com/shorts/abc123'))).toBe('shorts');
    });

    it('maps /results to search', () => {
      expect(buildPathPattern(new URL('https://www.youtube.com/results?search_query=test'))).toBe(
        'search',
      );
    });

    it('maps /@channel to channel', () => {
      expect(buildPathPattern(new URL('https://www.youtube.com/@MrBeast'))).toBe('channel');
    });

    it('maps /channel/id to channel', () => {
      expect(buildPathPattern(new URL('https://www.youtube.com/channel/UC123'))).toBe('channel');
    });

    it('maps /feed/subscriptions to subscriptions', () => {
      expect(buildPathPattern(new URL('https://www.youtube.com/feed/subscriptions'))).toBe(
        'subscriptions',
      );
    });

    it('maps /playlist to playlist', () => {
      expect(buildPathPattern(new URL('https://www.youtube.com/playlist?list=PLabc'))).toBe(
        'playlist',
      );
    });

    it('maps unknown youtube paths to home', () => {
      expect(buildPathPattern(new URL('https://www.youtube.com/premium'))).toBe('home');
    });
  });

  describe('Amazon', () => {
    it('maps /s/ to search', () => {
      expect(buildPathPattern(new URL('https://www.amazon.com/s/ref=abc?k=headphones'))).toBe(
        'search',
      );
    });

    it('maps /dp/* to product', () => {
      expect(buildPathPattern(new URL('https://www.amazon.com/dp/B09V3KXJPB'))).toBe('product');
    });

    it('maps /gp/* to product', () => {
      expect(buildPathPattern(new URL('https://www.amazon.com/gp/product/B09V3KXJPB'))).toBe(
        'product',
      );
    });

    it('maps /deals to deals', () => {
      expect(buildPathPattern(new URL('https://www.amazon.com/deals'))).toBe('deals');
    });

    it('maps /b/ to browse', () => {
      expect(buildPathPattern(new URL('https://www.amazon.com/b/ref=abc?node=123'))).toBe('browse');
    });

    it('maps root to home', () => {
      expect(buildPathPattern(new URL('https://www.amazon.com/'))).toBe('home');
    });
  });

  describe('Twitter / X', () => {
    it('maps /home to home', () => {
      expect(buildPathPattern(new URL('https://twitter.com/home'))).toBe('home');
    });

    it('maps /search to search', () => {
      expect(buildPathPattern(new URL('https://x.com/search?q=test'))).toBe('search');
    });

    it('maps /explore to explore', () => {
      expect(buildPathPattern(new URL('https://x.com/explore'))).toBe('explore');
    });

    it('maps status URLs to status', () => {
      expect(buildPathPattern(new URL('https://x.com/user/status/1234567890'))).toBe('status');
    });
  });

  describe('Facebook', () => {
    it('maps /watch to watch', () => {
      expect(buildPathPattern(new URL('https://www.facebook.com/watch'))).toBe('watch');
    });

    it('maps /marketplace to marketplace', () => {
      expect(buildPathPattern(new URL('https://www.facebook.com/marketplace'))).toBe('marketplace');
    });

    it('maps /groups/* to groups', () => {
      expect(buildPathPattern(new URL('https://www.facebook.com/groups/123'))).toBe('groups');
    });
  });

  describe('Instagram', () => {
    it('maps /explore to explore', () => {
      expect(buildPathPattern(new URL('https://www.instagram.com/explore/'))).toBe('explore');
    });

    it('maps /reels to reels', () => {
      expect(buildPathPattern(new URL('https://www.instagram.com/reels/'))).toBe('reels');
    });

    it('maps /p/* to post', () => {
      expect(buildPathPattern(new URL('https://www.instagram.com/p/CxYz123/'))).toBe('post');
    });
  });

  describe('eBay', () => {
    it('maps /sch/* to search', () => {
      expect(buildPathPattern(new URL('https://www.ebay.com/sch/i.html?_nkw=laptop'))).toBe(
        'search',
      );
    });

    it('maps /itm/* to item', () => {
      expect(buildPathPattern(new URL('https://www.ebay.com/itm/123456'))).toBe('item');
    });
  });

  describe('Walmart', () => {
    it('maps /search to search', () => {
      expect(buildPathPattern(new URL('https://www.walmart.com/search?q=tv'))).toBe('search');
    });

    it('maps /ip/* to product', () => {
      expect(buildPathPattern(new URL('https://www.walmart.com/ip/12345'))).toBe('product');
    });
  });

  describe('Unknown sites', () => {
    it('uses first path segment for unknown domains', () => {
      expect(buildPathPattern(new URL('https://example.com/blog/post-1'))).toBe('blog');
    });

    it('maps root to home for unknown domains', () => {
      expect(buildPathPattern(new URL('https://example.com/'))).toBe('home');
    });

    it('maps numeric first segments to home', () => {
      expect(buildPathPattern(new URL('https://example.com/12345/page'))).toBe('home');
    });

    it('maps very long first segments to home', () => {
      const longSegment = 'a'.repeat(31);
      expect(buildPathPattern(new URL(`https://example.com/${longSegment}`))).toBe('home');
    });

    it('lowercases path segments', () => {
      expect(buildPathPattern(new URL('https://example.com/Products/item-1'))).toBe('products');
    });
  });
});
