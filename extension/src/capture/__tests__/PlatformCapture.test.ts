/**
 * @jest-environment jsdom
 */
import { extractCategoriesAndBrands, tokenizeTitle } from '../PlatformCapture';

describe('tokenizeTitle', () => {
  test('drops noise, brands, and model numbers', () => {
    const out = tokenizeTitle('Best Sony WH-1000XM5 review — should you buy in 2026?');
    expect(out).not.toContain('best');
    expect(out).not.toContain('sony');
    expect(out).not.toContain('wh');
    expect(out).not.toContain('1000xm5');
    expect(out).not.toContain('review');
  });

  test('respects the max cap', () => {
    const long = 'cat dog horse cow pig sheep goat duck chicken rabbit lizard turtle';
    const out = tokenizeTitle(long, 3);
    expect(out.length).toBeLessThanOrEqual(3);
  });

  test('returns empty array for noise-only titles', () => {
    expect(tokenizeTitle('the best video for you with this guide').length).toBe(0);
  });
});

describe('extractCategoriesAndBrands', () => {
  test('matches a known brand as a brand entity', () => {
    const { entities } = extractCategoriesAndBrands('Apple AirPods unboxing', 'youtube');
    expect(entities.find((e) => e.name === 'Apple' && e.kind === 'brand')).toBeDefined();
  });

  test('matches a category pattern as a topic', () => {
    const { topics } = extractCategoriesAndBrands('Brand X over-ear review', 'youtube');
    expect(topics.find((t) => t.name === 'headphones')).toBeDefined();
  });

  test('product-line model numbers map to the right category', () => {
    const { topics } = extractCategoriesAndBrands('WH-1000XM5 in-depth review', 'amazon');
    expect(topics.find((t) => t.name === 'headphones')).toBeDefined();
  });

  test('no matches returns empty topics + entities', () => {
    const out = extractCategoriesAndBrands('a quiet day at the park', 'generic');
    expect(out.topics).toHaveLength(0);
    expect(out.entities).toHaveLength(0);
  });
});
