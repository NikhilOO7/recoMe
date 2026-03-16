import { RuleBasedExtractor } from '../RuleBasedExtractor';

describe('RuleBasedExtractor', () => {
  let extractor: RuleBasedExtractor;

  beforeEach(() => {
    extractor = new RuleBasedExtractor();
  });

  describe('extractTopics', () => {
    it('"crypto bitcoin" includes crypto topic', () => {
      const topics = extractor.extractTopics('crypto bitcoin');
      // normalizeTopicKey lowercases and replaces spaces with _
      expect(topics).toContain('crypto');
      expect(topics).toContain('bitcoin');
    });

    it('"React hooks tutorial" includes tech topic', () => {
      const topics = extractor.extractTopics('React hooks tutorial');
      expect(topics).toContain('react');
    });

    it('returns empty array when no matches', () => {
      const topics = extractor.extractTopics('the quick brown fox jumps over the lazy dog');
      expect(topics).toEqual([]);
    });

    it('"#machinelearning" extracts hashtag as topic', () => {
      const topics = extractor.extractTopics('#machinelearning');
      expect(topics).toContain('machinelearning');
    });

    it('extracts multiple topics from mixed text', () => {
      const topics = extractor.extractTopics(
        'I love investing in stocks and also enjoy Netflix series',
      );
      expect(topics).toContain('stocks');
      expect(topics).toContain('investing');
      expect(topics).toContain('netflix');
    });
  });

  describe('extractEntities', () => {
    it('"@username" extracts mention', () => {
      const entities = extractor.extractEntities('Check out @username for great content');
      expect(entities).toContain('username');
    });

    it('extracts multiple mentions', () => {
      const entities = extractor.extractEntities('@alice and @bob.smith are collaborating');
      expect(entities).toContain('alice');
      expect(entities).toContain('bob.smith');
    });

    it('returns empty array when no mentions', () => {
      const entities = extractor.extractEntities('no mentions here');
      expect(entities).toEqual([]);
    });
  });

  describe('isSponsored', () => {
    it('"sponsored post" returns true', () => {
      expect(extractor.isSponsored('This is a sponsored post')).toBe(true);
    });

    it('"regular content" returns false', () => {
      expect(extractor.isSponsored('regular content about coding')).toBe(false);
    });

    it('detects promoted content', () => {
      expect(extractor.isSponsored('promoted tweet about shoes')).toBe(true);
    });

    it('detects #ad hashtag', () => {
      expect(extractor.isSponsored('Great product #ad')).toBe(true);
    });

    it('detects advertisement keyword', () => {
      expect(extractor.isSponsored('This is an advertisement')).toBe(true);
    });

    it('is case insensitive', () => {
      expect(extractor.isSponsored('SPONSORED by BrandX')).toBe(true);
    });
  });
});
