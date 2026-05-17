import { describe, it, expect } from 'vitest';
import { RecallAgent } from '../recall/RecallAgent.js';

// We test the scoring math directly without touching Neo4j. The actual
// query is exercised by the (skipped-without-deps) integration suite.

const now = new Date('2026-06-01T12:00:00Z');
const ago = (days: number) => now.getTime() - days * 86_400_000;

describe('RecallAgent.pickBest scoring', () => {
  const agent = new RecallAgent();

  it('picks the higher score when weights are equal', () => {
    // 14d (just past cutoff) vs 25d (closer to peak). The 25d candidate
    // should win because the score curve peaks at 21d.
    const { signal } = agent.pickBest(
      [
        {
          id: '14d',
          kind: 'view',
          ts: ago(14),
          weight: 1,
          pageUrl: null,
          pageTitle: null,
          platform: null,
        },
        {
          id: '25d',
          kind: 'view',
          ts: ago(25),
          weight: 1,
          pageUrl: null,
          pageTitle: null,
          platform: null,
        },
      ],
      now,
    );
    expect(signal.id).toBe('25d');
  });

  it('decays very old signals so they do not dominate by age alone', () => {
    // 21d at weight 1 (score ≈ 1.0) vs 200d at weight 5 (deep in the tail).
    // The 21d signal should still win — we don't want to surface 7-month-old
    // captures just because their raw weight was higher.
    const { signal } = agent.pickBest(
      [
        {
          id: '21d',
          kind: 'view',
          ts: ago(21),
          weight: 1,
          pageUrl: null,
          pageTitle: null,
          platform: null,
        },
        {
          id: '200d',
          kind: 'view',
          ts: ago(200),
          weight: 5,
          pageUrl: null,
          pageTitle: null,
          platform: null,
        },
      ],
      now,
    );
    expect(signal.id).toBe('21d');
  });

  it('respects weight when ages are comparable', () => {
    const { signal } = agent.pickBest(
      [
        {
          id: 'low',
          kind: 'view',
          ts: ago(21),
          weight: 1,
          pageUrl: null,
          pageTitle: null,
          platform: null,
        },
        {
          id: 'high',
          kind: 'view',
          ts: ago(21),
          weight: 3,
          pageUrl: null,
          pageTitle: null,
          platform: null,
        },
      ],
      now,
    );
    expect(signal.id).toBe('high');
  });

  it('returns a score the caller can threshold on', () => {
    const { score } = agent.pickBest(
      [
        {
          id: 'x',
          kind: 'view',
          ts: ago(21),
          weight: 1,
          pageUrl: null,
          pageTitle: null,
          platform: null,
        },
      ],
      now,
    );
    // At peak (21d) with weight 1, score should be ≈ 1.0 — well above the 0.4 threshold.
    expect(score).toBeGreaterThan(0.9);
  });
});

describe('RecallAgent.canRun', () => {
  const agent = new RecallAgent();

  it('rejects non-event triggers', async () => {
    expect(
      await agent.canRun({
        userId: 'u',
        trigger: 'scheduled',
        now,
        event: { signalId: 's', topicNormalizedName: 't' },
      }),
    ).toBe(false);
  });

  it('rejects event triggers missing required fields', async () => {
    expect(await agent.canRun({ userId: 'u', trigger: 'event', now })).toBe(false);
    expect(
      await agent.canRun({ userId: 'u', trigger: 'event', now, event: { signalId: 's' } }),
    ).toBe(false);
  });

  it('accepts a well-formed event', async () => {
    expect(
      await agent.canRun({
        userId: 'u',
        trigger: 'event',
        now,
        event: { signalId: 's', topicNormalizedName: 't', topicName: 'T', ts: ago(0) },
      }),
    ).toBe(true);
  });
});
