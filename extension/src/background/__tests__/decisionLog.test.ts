import { appendDecision, getDecisionLog, clearDecisionLog } from '../decisionLog';
import type { ContentMetadata, RecommendationResult } from '@shared/types';

// ── Helpers ──────────────────────────────────────────────────────────────────────

function makeContent(overrides: Partial<ContentMetadata> = {}): ContentMetadata {
  return {
    id: 'content-1',
    title: 'Test Content',
    platform: 'youtube',
    topics: ['tech'],
    entities: [],
    url: 'https://example.com',
    ...overrides,
  } as ContentMetadata;
}

function makeResult(overrides: Partial<RecommendationResult> = {}): RecommendationResult {
  return {
    action: 'keep',
    score: 0.5,
    reasons: [],
    ...overrides,
  } as RecommendationResult;
}

// ── Tests ────────────────────────────────────────────────────────────────────────

describe('decisionLog', () => {
  beforeEach(() => {
    clearDecisionLog();
  });

  describe('appendDecision', () => {
    it('adds a decision entry to the log', () => {
      appendDecision(makeContent(), makeResult());

      const log = getDecisionLog();
      expect(log).toHaveLength(1);
      expect(log[0]!.content.id).toBe('content-1');
      expect(log[0]!.result.action).toBe('keep');
    });

    it('adds entries in reverse chronological order (newest first)', () => {
      appendDecision(makeContent({ id: 'first' }), makeResult());
      appendDecision(makeContent({ id: 'second' }), makeResult());

      const log = getDecisionLog();
      expect(log).toHaveLength(2);
      expect(log[0]!.content.id).toBe('second');
      expect(log[1]!.content.id).toBe('first');
    });

    it('generates unique id and timestamp for each entry', () => {
      appendDecision(makeContent(), makeResult());
      appendDecision(makeContent(), makeResult());

      const log = getDecisionLog();
      expect(log[0]!.id).not.toBe(log[1]!.id);
      expect(typeof log[0]!.timestamp).toBe('number');
    });

    it('caps entries at MAX_ENTRIES (150)', () => {
      for (let i = 0; i < 160; i++) {
        appendDecision(makeContent({ id: `c-${i}` }), makeResult());
      }

      const log = getDecisionLog();
      expect(log).toHaveLength(150);
      // Most recent should be the last added
      expect(log[0]!.content.id).toBe('c-159');
    });
  });

  describe('getDecisionLog', () => {
    it('returns empty array when no decisions logged', () => {
      expect(getDecisionLog()).toEqual([]);
    });

    it('returns a copy (not a reference to internal array)', () => {
      appendDecision(makeContent(), makeResult());

      const log1 = getDecisionLog();
      const log2 = getDecisionLog();
      expect(log1).not.toBe(log2);
      expect(log1).toEqual(log2);
    });
  });

  describe('clearDecisionLog', () => {
    it('removes all entries', () => {
      appendDecision(makeContent(), makeResult());
      appendDecision(makeContent(), makeResult());
      expect(getDecisionLog()).toHaveLength(2);

      clearDecisionLog();
      expect(getDecisionLog()).toHaveLength(0);
    });

    it('is safe to call when already empty', () => {
      clearDecisionLog();
      expect(getDecisionLog()).toEqual([]);
    });
  });
});
