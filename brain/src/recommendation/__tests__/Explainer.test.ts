import { Explainer } from '../Explainer';
import type { ScoringFactor, ContentAction } from '@shared/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFactor(overrides: Partial<ScoringFactor> = {}): ScoringFactor {
  return {
    name: 'pattern_match',
    score: 0.5,
    weight: 7,
    explanation: 'Interest pattern: "react"',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Explainer', () => {
  let explainer: Explainer;

  beforeEach(() => {
    explainer = new Explainer();
  });

  describe('buildExplanation for "hide" action', () => {
    it('includes "Hidden:" prefix and the top factor explanation', () => {
      const factors: ScoringFactor[] = [
        makeFactor({ name: 'direct_block', score: -1, weight: 10, explanation: 'Blocked: crypto' }),
        makeFactor({
          name: 'pattern_match',
          score: -0.3,
          weight: 7,
          explanation: 'Block pattern: crypto',
        }),
      ];

      const result = explainer.buildExplanation('hide', -1, factors, 'Crypto Guide');

      expect(result.explanation).toContain('Hidden:');
      expect(result.hide_reason).toBeDefined();
      expect(result.hide_reason).toContain('Blocked: crypto');
      expect(result.boost_reason).toBeUndefined();
    });

    it('uses the highest-impact factor for the explanation text', () => {
      const factors: ScoringFactor[] = [
        makeFactor({
          name: 'direct_block',
          score: -1,
          weight: 10,
          explanation: 'Direct block match',
        }),
        makeFactor({
          name: 'context_fit',
          score: -0.1,
          weight: 3,
          explanation: 'Context mismatch',
        }),
      ];

      const result = explainer.buildExplanation('hide', -1, factors, 'Spam Content');

      // direct_block has |score * weight| = 10, context_fit has 0.3
      // So explanation should use direct_block's explanation
      expect(result.explanation).toContain('Direct block match');
    });
  });

  describe('buildExplanation for "boost" action', () => {
    it('includes "Boosted:" prefix and positive explanation', () => {
      const factors: ScoringFactor[] = [
        makeFactor({
          name: 'pattern_match',
          score: 0.8,
          weight: 7,
          explanation: 'Interest pattern: "react"',
        }),
        makeFactor({
          name: 'context_fit',
          score: 0.3,
          weight: 3,
          explanation: 'youtube fits learning',
        }),
      ];

      const result = explainer.buildExplanation('boost', 0.7, factors, 'React Hooks Tutorial');

      expect(result.explanation).toContain('Boosted:');
      expect(result.boost_reason).toBeDefined();
      expect(result.boost_reason).toContain('Interest pattern');
      expect(result.hide_reason).toBeUndefined();
    });
  });

  describe('buildExplanation for "show" action', () => {
    it('returns "Showing normally" explanation', () => {
      const factors: ScoringFactor[] = [
        makeFactor({
          name: 'context_fit',
          score: 0.1,
          weight: 3,
          explanation: 'youtube fits entertainment',
        }),
        makeFactor({
          name: 'recency',
          score: 0.2,
          weight: 1,
          explanation: 'Content is 2 day(s) old',
        }),
      ];

      const result = explainer.buildExplanation('show', 0.15, factors, 'Random Video');

      expect(result.explanation).toContain('Showing normally');
      expect(result.explanation).toContain('0.15');
      expect(result.hide_reason).toBeUndefined();
      expect(result.boost_reason).toBeUndefined();
    });
  });

  describe('buildExplanation for "suppress" action', () => {
    it('includes "Reduced:" prefix', () => {
      const factors: ScoringFactor[] = [
        makeFactor({
          name: 'pattern_match',
          score: -0.6,
          weight: 7,
          explanation: 'Block pattern: "spam"',
        }),
      ];

      const result = explainer.buildExplanation('suppress', -0.4, factors, 'Spam Content');

      expect(result.explanation).toContain('Reduced:');
      expect(result.explanation).toContain('Block pattern');
    });
  });

  describe('uses top contributing factor for explanation text', () => {
    it('selects factor with highest |score * weight| product', () => {
      const factors: ScoringFactor[] = [
        makeFactor({ name: 'recency', score: 0.5, weight: 1, explanation: 'Fresh content' }), // impact = 0.5
        makeFactor({
          name: 'pattern_match',
          score: 0.3,
          weight: 7,
          explanation: 'Interest: react',
        }), // impact = 2.1
        makeFactor({ name: 'context_fit', score: 0.3, weight: 3, explanation: 'Good context fit' }), // impact = 0.9
      ];

      const result = explainer.buildExplanation('boost', 0.6, factors, 'React Tutorial');

      // pattern_match has the highest impact (2.1), so it should be in the explanation
      expect(result.explanation).toContain('Interest: react');
    });
  });

  describe('returns proper structure', () => {
    it('always includes explanation string', () => {
      const factors: ScoringFactor[] = [
        makeFactor({ name: 'direct_block', score: -1, weight: 10, explanation: 'Blocked topic' }),
      ];

      const result = explainer.buildExplanation('hide', -1, factors, 'Content');

      expect(typeof result.explanation).toBe('string');
      expect(result.explanation.length).toBeGreaterThan(0);
    });

    it('returns hide_reason only for hide action', () => {
      const factors = [makeFactor({ score: -1, weight: 10, explanation: 'Blocked' })];

      const hideResult = explainer.buildExplanation('hide', -1, factors, 'X');
      const showResult = explainer.buildExplanation('show', 0, factors, 'X');
      const boostResult = explainer.buildExplanation('boost', 0.7, factors, 'X');

      expect(hideResult.hide_reason).toBeDefined();
      expect(showResult.hide_reason).toBeUndefined();
      expect(boostResult.hide_reason).toBeUndefined();
    });

    it('returns boost_reason only for boost action', () => {
      const factors = [makeFactor({ score: 0.8, weight: 7, explanation: 'Interest match' })];

      const boostResult = explainer.buildExplanation('boost', 0.7, factors, 'X');
      const showResult = explainer.buildExplanation('show', 0.2, factors, 'X');
      const hideResult = explainer.buildExplanation('hide', -1, factors, 'X');

      expect(boostResult.boost_reason).toBeDefined();
      expect(showResult.boost_reason).toBeUndefined();
      expect(hideResult.boost_reason).toBeUndefined();
    });
  });
});
