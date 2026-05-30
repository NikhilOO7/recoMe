import { PolicyEngine } from '../PolicyEngine';
import type { IntentEvent } from '@schema/intent';
import type { ShoppingContext } from '@schema/context';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeIntent(overrides: Partial<IntentEvent> = {}): IntentEvent {
  return {
    id: 'intent-1',
    createdAt: new Date().toISOString(),
    source: 'overlay',
    entityType: 'product',
    entityId: 'entity-1',
    intentType: 'interested',
    scope: 'entity',
    ...overrides,
  };
}

function makeContext(overrides: Partial<ShoppingContext> = {}): ShoppingContext {
  return {
    contextId: 'ctx-1',
    type: 'budget',
    label: 'Budget mode',
    isActive: true,
    source: 'user',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PolicyEngine', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  // ── evaluateIntents ──────────────────────────────────────────────────────

  describe('evaluateIntents', () => {
    it('returns empty signals for empty intents array', () => {
      const signals = engine.evaluateIntents([], 'entity-1');
      expect(signals).toEqual([]);
    });

    it('returns a positive score for "interested" intent', () => {
      const intents = [makeIntent({ intentType: 'interested', scope: 'entity', entityId: 'e1' })];
      const signals = engine.evaluateIntents(intents, 'e1');

      expect(signals).toHaveLength(1);
      expect(signals[0]!.score).toBeGreaterThan(0);
      expect(signals[0]!.source).toBe('intent:interested');
    });

    it('returns a negative score for "not_interested" intent', () => {
      const intents = [
        makeIntent({ intentType: 'not_interested', scope: 'entity', entityId: 'e1' }),
      ];
      const signals = engine.evaluateIntents(intents, 'e1');

      expect(signals).toHaveLength(1);
      expect(signals[0]!.score).toBeLessThan(0);
      expect(signals[0]!.source).toBe('intent:not_interested');
    });

    it('reduces intent score for older intents via time decay', () => {
      const freshIntent = makeIntent({
        intentType: 'interested',
        scope: 'entity',
        entityId: 'e1',
        createdAt: new Date().toISOString(),
      });
      const oldIntent = makeIntent({
        id: 'intent-old',
        intentType: 'interested',
        scope: 'entity',
        entityId: 'e1',
        createdAt: daysAgo(30),
      });

      const freshSignals = engine.evaluateIntents([freshIntent], 'e1');
      const oldSignals = engine.evaluateIntents([oldIntent], 'e1');

      expect(freshSignals).toHaveLength(1);
      expect(oldSignals).toHaveLength(1);
      // Older intent should have a smaller absolute score due to decay
      expect(Math.abs(oldSignals[0]!.score)).toBeLessThan(Math.abs(freshSignals[0]!.score));
    });

    it('skips expired intents', () => {
      const expired = makeIntent({
        intentType: 'interested',
        scope: 'entity',
        entityId: 'e1',
        expiresAt: daysAgo(1), // expired yesterday
      });
      const signals = engine.evaluateIntents([expired], 'e1');
      expect(signals).toHaveLength(0);
    });

    it('skips intents older than MAX_INTENT_AGE_DAYS (90)', () => {
      const ancient = makeIntent({
        intentType: 'interested',
        scope: 'entity',
        entityId: 'e1',
        createdAt: daysAgo(100),
      });
      const signals = engine.evaluateIntents([ancient], 'e1');
      expect(signals).toHaveLength(0);
    });

    it('skips intents that do not apply to the candidate', () => {
      const intent = makeIntent({
        intentType: 'interested',
        scope: 'entity',
        entityId: 'other-entity',
      });
      const signals = engine.evaluateIntents([intent], 'e1');
      expect(signals).toHaveLength(0);
    });

    it('applies session-scoped intents to any candidate', () => {
      const intent = makeIntent({
        intentType: 'not_interested',
        scope: 'session',
        entityId: 'whatever',
      });
      const signals = engine.evaluateIntents([intent], 'any-entity');
      expect(signals).toHaveLength(1);
      expect(signals[0]!.score).toBeLessThan(0);
    });

    it('applies brand-scoped intent when candidateBrandId matches', () => {
      const intent = makeIntent({
        intentType: 'prefer_brand',
        scope: 'brand',
        entityId: 'brand-nike',
      });
      const signals = engine.evaluateIntents([intent], 'product-1', 'brand-nike');
      expect(signals).toHaveLength(1);
      expect(signals[0]!.score).toBeGreaterThan(0);
    });
  });

  // ── evaluateContexts ─────────────────────────────────────────────────────

  describe('evaluateContexts', () => {
    it('returns positive signal for budget mode with low price', () => {
      const contexts = [makeContext({ type: 'budget', isActive: true })];
      const signals = engine.evaluateContexts(contexts, 30);

      expect(signals).toHaveLength(1);
      expect(signals[0]!.source).toBe('context:budget');
      expect(signals[0]!.score).toBe(0.3); // price < 50
    });

    it('returns negative signal for budget mode with high price', () => {
      const contexts = [makeContext({ type: 'budget', isActive: true })];
      const signals = engine.evaluateContexts(contexts, 150);

      expect(signals).toHaveLength(1);
      expect(signals[0]!.score).toBe(-0.2); // price >= 100
    });

    it('skips inactive contexts', () => {
      const contexts = [makeContext({ type: 'budget', isActive: false })];
      const signals = engine.evaluateContexts(contexts, 30);
      expect(signals).toHaveLength(0);
    });

    it('skips expired contexts', () => {
      const contexts = [makeContext({ type: 'budget', isActive: true, expiresAt: daysAgo(1) })];
      const signals = engine.evaluateContexts(contexts, 30);
      expect(signals).toHaveLength(0);
    });

    it('returns research mode signal', () => {
      const contexts = [makeContext({ type: 'research', isActive: true })];
      const signals = engine.evaluateContexts(contexts);

      expect(signals).toHaveLength(1);
      expect(signals[0]!.source).toBe('context:research');
      expect(signals[0]!.score).toBe(0.2);
    });

    it('returns quality mode positive signal for high-rated item', () => {
      const contexts = [makeContext({ type: 'quality', isActive: true })];
      const signals = engine.evaluateContexts(contexts, undefined, 4.5);

      expect(signals).toHaveLength(1);
      expect(signals[0]!.source).toBe('context:quality');
      expect(signals[0]!.score).toBe(0.4);
    });
  });

  // ── applyOverfitProtection ───────────────────────────────────────────────

  describe('applyOverfitProtection', () => {
    it('dampens a single weak signal', () => {
      const signals = [
        { source: 'intent:researching', score: 0.2, confidence: 1.0, explanation: 'Researching' },
      ];
      const result = engine.applyOverfitProtection(signals);

      expect(result).toHaveLength(1);
      expect(result[0]!.score).toBe(0.1); // 0.2 * 0.5
      expect(result[0]!.confidence).toBe(0.5); // 1.0 * 0.5
      expect(result[0]!.explanation).toContain('dampened');
    });

    it('does not dampen a single strong signal', () => {
      const signals = [
        {
          source: 'intent:not_interested',
          score: -0.7,
          confidence: 1.0,
          explanation: 'Not interested',
        },
      ];
      const result = engine.applyOverfitProtection(signals);

      // |score| >= 0.5 so no dampening
      expect(result[0]!.score).toBe(-0.7);
    });

    it('does not dampen when multiple signals exist', () => {
      const signals = [
        { source: 'intent:interested', score: 0.3, confidence: 1.0, explanation: 'Interested' },
        { source: 'intent:researching', score: 0.2, confidence: 0.8, explanation: 'Researching' },
      ];
      const result = engine.applyOverfitProtection(signals);

      expect(result).toHaveLength(2);
      expect(result[0]!.score).toBe(0.3); // unchanged
    });
  });
});
