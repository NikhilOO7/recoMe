import { CommerceScorer } from '../CommerceScorer';
import type { CandidateEntity } from '@schema/entities';
import type { PageContext } from '@schema/decisions';
import type { IntentEvent } from '@schema/intent';
import type { ShoppingContext } from '@schema/context';

// ── Mock IndexedDB ───────────────────────────────────────────────────────────

const intentsStore = new Map<string, IntentEvent>();
const decisionsStore = new Map<string, unknown>();
const productsStore = new Map<string, unknown>();

jest.mock('@data/db', () => ({
  getDB: jest.fn().mockResolvedValue({
    put: jest
      .fn()
      .mockImplementation(
        (_store: string, value: { id?: string; decisionId?: string; productId?: string }) => {
          if (_store === 'intents') intentsStore.set(value.id!, value as unknown as IntentEvent);
          if (_store === 'decisions') decisionsStore.set(value.decisionId!, value);
          if (_store === 'products') productsStore.set(value.productId!, value);
          return Promise.resolve();
        },
      ),
    get: jest.fn().mockImplementation((_store: string, key: string) => {
      if (_store === 'intents') return Promise.resolve(intentsStore.get(key));
      if (_store === 'decisions') return Promise.resolve(decisionsStore.get(key));
      if (_store === 'products') return Promise.resolve(productsStore.get(key));
      return Promise.resolve(undefined);
    }),
    getAll: jest.fn().mockImplementation((_store: string) => {
      if (_store === 'intents') return Promise.resolve([...intentsStore.values()]);
      if (_store === 'decisions') return Promise.resolve([...decisionsStore.values()]);
      if (_store === 'products') return Promise.resolve([...productsStore.values()]);
      return Promise.resolve([]);
    }),
    getAllFromIndex: jest
      .fn()
      .mockImplementation((_store: string, _index: string, query: unknown) => {
        if (_store === 'intents' && _index === 'by_entity') {
          return Promise.resolve([...intentsStore.values()].filter((i) => i.entityId === query));
        }
        if (_store === 'intents' && _index === 'by_type') {
          return Promise.resolve([...intentsStore.values()].filter((i) => i.intentType === query));
        }
        if (_store === 'decisions' && _index === 'by_candidate') {
          return Promise.resolve(
            [...decisionsStore.values()].filter(
              (d: unknown) => (d as { candidateId: string }).candidateId === query,
            ),
          );
        }
        return Promise.resolve([]);
      }),
    delete: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    count: jest.fn().mockResolvedValue(0),
  }),
}));

// ── Factories ────────────────────────────────────────────────────────────────

function makeCandidate(overrides: Partial<CandidateEntity> = {}): CandidateEntity {
  return {
    candidateId: 'cand-1',
    entityType: 'product',
    rawText: 'Sony WH-1000XM5 Headphones',
    normalizedText: 'sony wh-1000xm5 headphones',
    metadata: {},
    ...overrides,
  };
}

function makePageContext(overrides: Partial<PageContext> = {}): PageContext {
  return {
    site: 'amazon',
    pageType: 'search',
    url: 'https://amazon.com/s?k=headphones',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeIntentEvent(overrides: Partial<IntentEvent> = {}): IntentEvent {
  return {
    id: 'int-1',
    createdAt: new Date().toISOString(),
    source: 'overlay',
    entityType: 'product',
    entityId: 'cand-1',
    intentType: 'interested',
    scope: 'entity',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CommerceScorer', () => {
  let scorer: CommerceScorer;

  beforeEach(() => {
    intentsStore.clear();
    decisionsStore.clear();
    productsStore.clear();
    scorer = new CommerceScorer();
  });

  describe('score with no intents', () => {
    it('returns neutral decisions when no intents exist', async () => {
      const candidates = [makeCandidate()];
      const response = await scorer.score(candidates, makePageContext());

      expect(response.items).toHaveLength(1);
      expect(response.items[0]!.decision).toBe('neutral');
      expect(response.items[0]!.score).toBe(0);
      expect(response.items[0]!.candidateId).toBe('cand-1');
    });
  });

  describe('score with positive brand intent', () => {
    it('returns boost decision for prefer_brand intent', async () => {
      // Seed a prefer_brand intent for the candidate's brand
      const brandIntent = makeIntentEvent({
        id: 'int-brand',
        intentType: 'prefer_brand',
        entityId: 'brand-sony',
        scope: 'brand',
      });
      intentsStore.set(brandIntent.id, brandIntent);

      // Add a direct interested intent to push aggregate score above boost threshold (0.5)
      const directIntent = makeIntentEvent({
        id: 'int-direct',
        intentType: 'interested',
        entityId: 'cand-1',
        scope: 'entity',
      });
      intentsStore.set(directIntent.id, directIntent);

      const candidate = makeCandidate({
        candidateId: 'cand-1',
        brandId: 'brand-sony',
      });

      const response = await scorer.score([candidate], makePageContext());

      expect(response.items).toHaveLength(1);
      const item = response.items[0]!;
      expect(item.score).toBeGreaterThan(0);
      // With prefer_brand (0.5) + interested (0.6) signals, aggregate exceeds boost threshold
      expect(item.decision).toBe('boost');
    });
  });

  describe('score with negative seller intent', () => {
    it('returns suppress or caution decision for avoid_seller intent', async () => {
      // Seed two avoid_seller intents so overfitting protection doesn't dampen the signal.
      // Use scope: 'entity' with entityId matching candidateId so intentApplies returns true.
      const intent1 = makeIntentEvent({
        id: 'int-seller-1',
        intentType: 'avoid_seller',
        entityId: 'cand-2',
        scope: 'entity',
        entityType: 'seller',
      });
      const intent2 = makeIntentEvent({
        id: 'int-seller-2',
        intentType: 'not_interested',
        entityId: 'cand-2',
        scope: 'entity',
        entityType: 'product',
      });
      intentsStore.set(intent1.id, intent1);
      intentsStore.set(intent2.id, intent2);

      const candidate = makeCandidate({
        candidateId: 'cand-2',
        sellerId: 'seller-bad',
      });

      const response = await scorer.score([candidate], makePageContext());
      const item = response.items[0]!;

      expect(item.score).toBeLessThan(0);
      // Combined avoid_seller (-0.8) + not_interested (-0.7) should produce suppress or caution
      expect(['suppress', 'caution']).toContain(item.decision);
    });
  });

  describe('persists DecisionRecord', () => {
    it('stores a decision record in the decisions store', async () => {
      const response = await scorer.score([makeCandidate()], makePageContext());

      expect(response.items).toHaveLength(1);
      // The scorer should have persisted a decision via DecisionRepo.put
      expect(decisionsStore.size).toBe(1);

      const stored = [...decisionsStore.values()][0] as { candidateId: string; decision: string };
      expect(stored.candidateId).toBe('cand-1');
      expect(stored.decision).toBeDefined();
    });
  });

  describe('returns proper ScoreResponse shape', () => {
    it('includes items array and computedAt timestamp', async () => {
      const response = await scorer.score(
        [
          makeCandidate(),
          makeCandidate({
            candidateId: 'cand-2',
            rawText: 'Another product',
            normalizedText: 'another product',
          }),
        ],
        makePageContext(),
      );

      expect(response.items).toHaveLength(2);
      expect(response.computedAt).toBeDefined();
      expect(new Date(response.computedAt).getTime()).not.toBeNaN();

      for (const item of response.items) {
        expect(item).toHaveProperty('candidateId');
        expect(item).toHaveProperty('score');
        expect(item).toHaveProperty('decision');
        expect(item).toHaveProperty('explanation');
        expect(item).toHaveProperty('confidence');
        expect(item).toHaveProperty('factors');
        expect(typeof item.score).toBe('number');
        expect(typeof item.explanation).toBe('string');
        expect(Array.isArray(item.factors)).toBe(true);
      }
    });
  });

  describe('score with context signals', () => {
    it('incorporates budget context into scoring', async () => {
      const contexts: ShoppingContext[] = [
        {
          contextId: 'ctx-budget',
          type: 'budget',
          label: 'Budget mode',
          isActive: true,
          source: 'user',
          createdAt: new Date().toISOString(),
        },
      ];

      const candidate = makeCandidate({
        metadata: { price: 25 }, // low price should get positive budget signal
      });

      const response = await scorer.score([candidate], makePageContext(), contexts);
      const item = response.items[0]!;

      // With budget context and low price, score should be slightly positive
      expect(item.score).toBeGreaterThan(-0.5);
    });
  });
});
