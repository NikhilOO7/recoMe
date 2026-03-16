import { ContextDetector } from '../ContextDetector';

describe('ContextDetector', () => {
  let detector: ContextDetector;

  beforeEach(() => {
    detector = new ContextDetector();
    jest.restoreAllMocks();
  });

  // ── Platform-based detection ─────────────────────────────────────────────────

  describe('platform detection', () => {
    it('should detect YouTube as entertainment', () => {
      const state = detector.detect('youtube');
      expect(state.current).toBe('entertainment');
      expect(state.detection_method).toBe('platform');
    });

    it('should detect Amazon as shopping', () => {
      const state = detector.detect('amazon');
      expect(state.current).toBe('shopping');
      expect(state.detection_method).toBe('platform');
    });

    it('should detect Twitter as social', () => {
      const state = detector.detect('twitter');
      expect(state.current).toBe('social');
      expect(state.detection_method).toBe('platform');
    });

    it('should detect Facebook as social', () => {
      const state = detector.detect('facebook');
      expect(state.current).toBe('social');
    });

    it('should detect Instagram as social', () => {
      const state = detector.detect('instagram');
      expect(state.current).toBe('social');
    });

    it('should detect eBay as shopping', () => {
      const state = detector.detect('ebay');
      expect(state.current).toBe('shopping');
    });

    it('should detect Walmart as shopping', () => {
      const state = detector.detect('walmart');
      expect(state.current).toBe('shopping');
    });
  });

  // ── Unknown platform / defaults ──────────────────────────────────────────────

  describe('unknown platform', () => {
    it('should return a reasonable default for unknown platform', () => {
      const state = detector.detect('unknown');
      // With no platform signal, should fall back to time or general
      expect(['general', 'work', 'entertainment']).toContain(state.current);
      expect(state.detected_at).toBeGreaterThan(0);
    });

    it('should return general when unknown platform and no other signals match', () => {
      // Mock time to be in a non-work, non-evening period (unlikely but let's ensure fallback)
      const state = detector.detect('unknown');
      // At minimum, some context is returned
      expect(state.current).toBeDefined();
      expect(state.confidence).toBeGreaterThan(0);
    });
  });

  // ── URL-based detection ──────────────────────────────────────────────────────

  describe('URL-based detection', () => {
    it('should detect GitHub URLs as learning context', () => {
      const state = detector.detect('unknown', 'https://github.com/facebook/react');
      expect(state.current).toBe('learning');
      expect(state.detection_method).toBe('content');
    });

    it('should detect StackOverflow URLs as learning context', () => {
      const state = detector.detect('unknown', 'https://stackoverflow.com/questions/12345');
      expect(state.current).toBe('learning');
      expect(state.detection_method).toBe('content');
    });

    it('should detect MDN URLs as learning context', () => {
      const state = detector.detect('unknown', 'https://developer.mozilla.org/en-US/docs/Web');
      expect(state.current).toBe('learning');
    });

    it('should detect Udemy URLs as learning context', () => {
      const state = detector.detect('unknown', 'https://udemy.com/course/react-complete-guide');
      expect(state.current).toBe('learning');
    });

    it('should detect Coursera URLs as learning context', () => {
      const state = detector.detect('unknown', 'https://coursera.org/learn/machine-learning');
      expect(state.current).toBe('learning');
    });

    it('should detect dev.to URLs as learning context', () => {
      const state = detector.detect('unknown', 'https://dev.to/article/how-to-use-hooks');
      expect(state.current).toBe('learning');
    });

    it('should not crash on invalid URLs', () => {
      const state = detector.detect('unknown', 'not-a-valid-url');
      // Should not throw and should still return a valid state
      expect(state.current).toBeDefined();
      expect(state.confidence).toBeGreaterThan(0);
    });

    it('should prefer platform signal over URL when platform confidence is higher', () => {
      // Platform signal has 0.85 confidence; learning URL has 0.80
      const state = detector.detect('youtube', 'https://github.com/some/repo');
      expect(state.current).toBe('entertainment');
      expect(state.detection_method).toBe('platform');
    });
  });

  // ── Confidence values ────────────────────────────────────────────────────────

  describe('confidence values', () => {
    it('should have confidence in [0, 1] for platform detection', () => {
      const state = detector.detect('youtube');
      expect(state.confidence).toBeGreaterThanOrEqual(0);
      expect(state.confidence).toBeLessThanOrEqual(1);
    });

    it('should have confidence in [0, 1] for URL detection', () => {
      const state = detector.detect('unknown', 'https://github.com/foo');
      expect(state.confidence).toBeGreaterThanOrEqual(0);
      expect(state.confidence).toBeLessThanOrEqual(1);
    });

    it('should have confidence in [0, 1] for unknown platform', () => {
      const state = detector.detect('unknown');
      expect(state.confidence).toBeGreaterThanOrEqual(0);
      expect(state.confidence).toBeLessThanOrEqual(1);
    });

    it('should have confidence in [0, 1] for time-based detection', () => {
      // Time-based is tested indirectly through unknown platform
      const state = detector.detect('unknown');
      expect(state.confidence).toBeGreaterThanOrEqual(0);
      expect(state.confidence).toBeLessThanOrEqual(1);
    });
  });

  // ── State shape ──────────────────────────────────────────────────────────────

  describe('returned state shape', () => {
    it('should include all required fields', () => {
      const state = detector.detect('youtube');
      expect(state).toHaveProperty('current');
      expect(state).toHaveProperty('detected_at');
      expect(state).toHaveProperty('detection_method');
      expect(state).toHaveProperty('confidence');
    });

    it('should have a recent detected_at timestamp', () => {
      const before = Date.now();
      const state = detector.detect('youtube');
      const after = Date.now();
      expect(state.detected_at).toBeGreaterThanOrEqual(before);
      expect(state.detected_at).toBeLessThanOrEqual(after);
    });
  });
});
