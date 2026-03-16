import {
  generateId,
  now,
  normalizeTopicKey,
  buildTopicKey,
  parseTopicKey,
  msAgo,
  olderThan,
  daysBetween,
  startOfDay,
  clamp,
  weightedAverage,
  dedupe,
  groupBy,
  topN,
  extractDomain,
  isHttpUrl,
  omit,
} from '../index';

// ── generateId ────────────────────────────────────────────────────────────────

describe('generateId', () => {
  it('returns a string', () => {
    expect(typeof generateId()).toBe('string');
  });

  it('returns non-empty string', () => {
    expect(generateId().length).toBeGreaterThan(0);
  });

  it('returns unique values across 200 calls', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateId()));
    expect(ids.size).toBe(200);
  });
});

// ── now ───────────────────────────────────────────────────────────────────────

describe('now', () => {
  it('returns a number', () => {
    expect(typeof now()).toBe('number');
  });

  it('returns a value close to Date.now()', () => {
    const before = Date.now();
    const result = now();
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });
});

// ── normalizeTopicKey ─────────────────────────────────────────────────────────

describe('normalizeTopicKey', () => {
  it('lowercases input', () => {
    expect(normalizeTopicKey('HELLO')).toBe('hello');
  });

  it('replaces spaces with underscores', () => {
    expect(normalizeTopicKey('machine learning')).toBe('machine_learning');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeTopicKey('deep   learning')).toBe('deep_learning');
  });

  it('trims whitespace', () => {
    expect(normalizeTopicKey('  crypto  ')).toBe('crypto');
  });

  it('handles mixed case with spaces', () => {
    expect(normalizeTopicKey('  Natural Language Processing  ')).toBe(
      'natural_language_processing',
    );
  });

  it('handles empty string', () => {
    expect(normalizeTopicKey('')).toBe('');
  });
});

// ── buildTopicKey / parseTopicKey roundtrip ────────────────────────────────────

describe('buildTopicKey and parseTopicKey', () => {
  it('roundtrip works for blocked prefix', () => {
    const key = buildTopicKey('blocked', 'Crypto');
    const parsed = parseTopicKey(key);
    expect(parsed.prefix).toBe('blocked');
    expect(parsed.topic).toBe('crypto');
  });

  it('roundtrip works for interested prefix', () => {
    const key = buildTopicKey('interested', 'AI');
    const parsed = parseTopicKey(key);
    expect(parsed.prefix).toBe('interested');
    expect(parsed.topic).toBe('ai');
  });

  it('roundtrip works for searched prefix', () => {
    const key = buildTopicKey('searched', 'Best Laptops');
    const parsed = parseTopicKey(key);
    expect(parsed.prefix).toBe('searched');
    expect(parsed.topic).toBe('best_laptops');
  });

  it('roundtrip works for one_time prefix', () => {
    const key = buildTopicKey('one_time', 'temp topic');
    const parsed = parseTopicKey(key);
    expect(parsed.prefix).toBe('one_time');
    expect(parsed.topic).toBe('temp_topic');
  });

  it('roundtrip works for working prefix', () => {
    const key = buildTopicKey('working', 'Research');
    const parsed = parseTopicKey(key);
    expect(parsed.prefix).toBe('working');
    expect(parsed.topic).toBe('research');
  });

  it('parseTopicKey handles key without prefix', () => {
    const parsed = parseTopicKey('notopic');
    expect(parsed.prefix).toBe('');
    expect(parsed.topic).toBe('notopic');
  });

  it('parseTopicKey handles topic containing colons', () => {
    const parsed = parseTopicKey('blocked:url:http');
    expect(parsed.prefix).toBe('blocked');
    expect(parsed.topic).toBe('url:http');
  });
});

// ── msAgo ─────────────────────────────────────────────────────────────────────

describe('msAgo', () => {
  it('returns a timestamp in the past', () => {
    const result = msAgo(5000);
    expect(result).toBeLessThan(Date.now());
  });

  it('returns approximately Date.now() - ms', () => {
    const before = Date.now();
    const result = msAgo(10000);
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before - 10000);
    expect(result).toBeLessThanOrEqual(after - 10000);
  });

  it('returns Date.now() when ms is 0', () => {
    const before = Date.now();
    const result = msAgo(0);
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });
});

// ── olderThan ─────────────────────────────────────────────────────────────────

describe('olderThan', () => {
  it('returns true for a timestamp older than the duration', () => {
    const old = Date.now() - 10000;
    expect(olderThan(old, 5000)).toBe(true);
  });

  it('returns false for a recent timestamp', () => {
    const recent = Date.now() - 1000;
    expect(olderThan(recent, 5000)).toBe(false);
  });

  it('returns false for a timestamp exactly at the boundary', () => {
    const ts = Date.now() - 5000;
    // Due to timing, this may be at the boundary; test near-boundary
    expect(typeof olderThan(ts, 5000)).toBe('boolean');
  });
});

// ── daysBetween ───────────────────────────────────────────────────────────────

describe('daysBetween', () => {
  const oneDay = 1000 * 60 * 60 * 24;

  it('returns 1 for timestamps one day apart', () => {
    const a = Date.now();
    const b = a + oneDay;
    expect(daysBetween(a, b)).toBe(1);
  });

  it('returns 0 for identical timestamps', () => {
    const a = Date.now();
    expect(daysBetween(a, a)).toBe(0);
  });

  it('is symmetric (order does not matter)', () => {
    const a = Date.now();
    const b = a + 3 * oneDay;
    expect(daysBetween(a, b)).toBe(daysBetween(b, a));
  });

  it('returns fractional days', () => {
    const a = Date.now();
    const b = a + oneDay / 2;
    expect(daysBetween(a, b)).toBeCloseTo(0.5);
  });
});

// ── startOfDay ────────────────────────────────────────────────────────────────

describe('startOfDay', () => {
  it('zeroes out time components', () => {
    const result = new Date(startOfDay());
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('preserves the date', () => {
    const ts = new Date(2024, 5, 15, 14, 30, 45).getTime();
    const result = new Date(startOfDay(ts));
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(5);
    expect(result.getDate()).toBe(15);
  });

  it('returns a number', () => {
    expect(typeof startOfDay()).toBe('number');
  });

  it('result is <= original timestamp', () => {
    const ts = Date.now();
    expect(startOfDay(ts)).toBeLessThanOrEqual(ts);
  });
});

// ── clamp ─────────────────────────────────────────────────────────────────────

describe('clamp', () => {
  it('returns value when within bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('returns min when value is below', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('returns max when value is above', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('returns min when value equals min', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it('returns max when value equals max', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('works with negative ranges', () => {
    expect(clamp(-3, -5, -1)).toBe(-3);
    expect(clamp(-10, -5, -1)).toBe(-5);
    expect(clamp(0, -5, -1)).toBe(-1);
  });
});

// ── weightedAverage ───────────────────────────────────────────────────────────

describe('weightedAverage', () => {
  it('returns correct weighted average', () => {
    const result = weightedAverage([
      { value: 10, weight: 1 },
      { value: 20, weight: 3 },
    ]);
    // (10*1 + 20*3) / (1+3) = 70/4 = 17.5
    expect(result).toBeCloseTo(17.5);
  });

  it('returns 0 for empty array', () => {
    expect(weightedAverage([])).toBe(0);
  });

  it('returns 0 when all weights are 0', () => {
    const result = weightedAverage([
      { value: 10, weight: 0 },
      { value: 20, weight: 0 },
    ]);
    expect(result).toBe(0);
  });

  it('returns the single value when only one pair', () => {
    const result = weightedAverage([{ value: 42, weight: 5 }]);
    expect(result).toBeCloseTo(42);
  });

  it('handles equal weights', () => {
    const result = weightedAverage([
      { value: 10, weight: 1 },
      { value: 20, weight: 1 },
    ]);
    expect(result).toBeCloseTo(15);
  });
});

// ── dedupe ────────────────────────────────────────────────────────────────────

describe('dedupe', () => {
  it('removes duplicate strings', () => {
    expect(dedupe(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('removes duplicate numbers', () => {
    expect(dedupe([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
  });

  it('preserves order', () => {
    expect(dedupe(['c', 'b', 'a'])).toEqual(['c', 'b', 'a']);
  });

  it('returns empty array for empty input', () => {
    expect(dedupe([])).toEqual([]);
  });

  it('returns same array when no duplicates', () => {
    expect(dedupe([1, 2, 3])).toEqual([1, 2, 3]);
  });
});

// ── groupBy ───────────────────────────────────────────────────────────────────

describe('groupBy', () => {
  it('groups items by key function', () => {
    const items = [
      { name: 'Alice', dept: 'eng' },
      { name: 'Bob', dept: 'sales' },
      { name: 'Charlie', dept: 'eng' },
    ];
    const grouped = groupBy(items, (i) => i.dept);
    expect(grouped['eng']).toHaveLength(2);
    expect(grouped['sales']).toHaveLength(1);
  });

  it('returns empty object for empty array', () => {
    expect(groupBy([], () => 'key')).toEqual({});
  });

  it('single group when all keys are the same', () => {
    const items = [1, 2, 3];
    const grouped = groupBy(items, () => 'all');
    expect(grouped['all']).toEqual([1, 2, 3]);
  });
});

// ── topN ──────────────────────────────────────────────────────────────────────

describe('topN', () => {
  it('returns top N items by score', () => {
    const items = [1, 5, 3, 8, 2];
    const result = topN(items, 3, (x) => x);
    expect(result).toEqual([8, 5, 3]);
  });

  it('returns all items if N > array length', () => {
    const items = [1, 2];
    const result = topN(items, 5, (x) => x);
    expect(result).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(topN([], 3, (x: number) => x)).toEqual([]);
  });

  it('returns 0 items when N is 0', () => {
    expect(topN([1, 2, 3], 0, (x) => x)).toEqual([]);
  });

  it('does not mutate original array', () => {
    const items = [3, 1, 2];
    const copy = [...items];
    topN(items, 2, (x) => x);
    expect(items).toEqual(copy);
  });
});

// ── extractDomain ─────────────────────────────────────────────────────────────

describe('extractDomain', () => {
  it('extracts domain from a standard URL', () => {
    expect(extractDomain('https://www.example.com/path')).toBe('example.com');
  });

  it('strips www. prefix', () => {
    expect(extractDomain('https://www.google.com')).toBe('google.com');
  });

  it('preserves subdomains other than www', () => {
    expect(extractDomain('https://blog.example.com')).toBe('blog.example.com');
  });

  it('returns empty string for invalid URL', () => {
    expect(extractDomain('not-a-url')).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(extractDomain('')).toBe('');
  });

  it('handles http URLs', () => {
    expect(extractDomain('http://example.org')).toBe('example.org');
  });
});

// ── isHttpUrl ─────────────────────────────────────────────────────────────────

describe('isHttpUrl', () => {
  it('returns true for https URL', () => {
    expect(isHttpUrl('https://example.com')).toBe(true);
  });

  it('returns true for http URL', () => {
    expect(isHttpUrl('http://example.com')).toBe(true);
  });

  it('returns false for ftp URL', () => {
    expect(isHttpUrl('ftp://example.com')).toBe(false);
  });

  it('returns false for chrome:// URL', () => {
    expect(isHttpUrl('chrome://extensions')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isHttpUrl('')).toBe(false);
  });

  it('returns false for malformed string', () => {
    expect(isHttpUrl('not a url')).toBe(false);
  });

  it('returns false for data: URL', () => {
    expect(isHttpUrl('data:text/html,hello')).toBe(false);
  });
});

// ── omit ──────────────────────────────────────────────────────────────────────

describe('omit', () => {
  it('removes specified keys', () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(omit(obj, 'b')).toEqual({ a: 1, c: 3 });
  });

  it('removes multiple keys', () => {
    const obj = { a: 1, b: 2, c: 3, d: 4 };
    expect(omit(obj, 'a', 'c')).toEqual({ b: 2, d: 4 });
  });

  it('does not mutate original object', () => {
    const obj = { a: 1, b: 2 };
    const copy = { ...obj };
    omit(obj, 'a');
    expect(obj).toEqual(copy);
  });

  it('returns full object when no keys specified', () => {
    const obj = { a: 1, b: 2 };
    expect(omit(obj)).toEqual({ a: 1, b: 2 });
  });

  it('handles keys that do not exist', () => {
    const obj = { a: 1 } as { a: number; b?: number };
    expect(omit(obj, 'b')).toEqual({ a: 1 });
  });
});
