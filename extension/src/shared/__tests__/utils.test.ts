import { buildTopicKey, normalizeTopicKey, parseTopicKey, dedupe, generateId } from '../utils';

describe('normalizeTopicKey', () => {
  it('should lowercase and replace spaces with underscores', () => {
    expect(normalizeTopicKey('Machine Learning')).toBe('machine_learning');
  });

  it('should trim whitespace', () => {
    expect(normalizeTopicKey('  crypto  ')).toBe('crypto');
  });

  it('should collapse multiple spaces', () => {
    expect(normalizeTopicKey('deep   learning')).toBe('deep_learning');
  });
});

describe('buildTopicKey', () => {
  it('should build blocked prefix', () => {
    expect(buildTopicKey('blocked', 'Crypto')).toBe('blocked:crypto');
  });

  it('should build interested prefix', () => {
    expect(buildTopicKey('interested', 'AI')).toBe('interested:ai');
  });

  it('should build searched prefix', () => {
    expect(buildTopicKey('searched', 'Best Laptops')).toBe('searched:best_laptops');
  });

  it('should build one_time prefix', () => {
    expect(buildTopicKey('one_time', 'Spam')).toBe('one_time:spam');
  });

  it('should build working prefix', () => {
    expect(buildTopicKey('working', 'Research Topic')).toBe('working:research_topic');
  });
});

describe('parseTopicKey', () => {
  it('should split prefix and topic', () => {
    expect(parseTopicKey('blocked:crypto')).toEqual({ prefix: 'blocked', topic: 'crypto' });
  });

  it('should handle topics with colons', () => {
    expect(parseTopicKey('interested:url:http')).toEqual({
      prefix: 'interested',
      topic: 'url:http',
    });
  });

  it('should handle keys without prefix', () => {
    expect(parseTopicKey('notopic')).toEqual({ prefix: '', topic: 'notopic' });
  });
});

describe('dedupe', () => {
  it('should remove duplicates', () => {
    expect(dedupe(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('should preserve order', () => {
    expect(dedupe(['c', 'b', 'a'])).toEqual(['c', 'b', 'a']);
  });
});

describe('generateId', () => {
  it('should return unique strings', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});
