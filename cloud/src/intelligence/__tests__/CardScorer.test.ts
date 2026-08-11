import { describe, expect, it } from 'vitest';
import { CardScorer } from '../CardScorer.js';

const INTENTS = [
  { topicName: 'standing desks', strength: 0.85 },
  { topicName: 'espresso', strength: 0.4 },
];

function score(cards: Array<{ id: string; title: string; brand?: string }>) {
  // Deterministic mode only (no llm opts) — the path prod runs today.
  return new CardScorer({}).score({ cards, intents: INTENTS });
}

describe('CardScorer deterministic stage', () => {
  it('returns matchedTopics for the feedback actions, strongest first', async () => {
    const [s] = await score([
      { id: 'a', title: 'Uplift v2 standing desks review — espresso break included' },
    ]);
    expect(s!.matchedTopics).toEqual(['standing desks', 'espresso']);
    expect(s!.verdict).toBe('relevant');
  });

  it('returns an empty matchedTopics for unmatched cards', async () => {
    const [s] = await score([{ id: 'b', title: 'Garden hose reel' }]);
    expect(s!.matchedTopics).toEqual([]);
    expect(s!.verdict).toBe('neutral');
  });

  it('never matches topics inside words ("men" vs "replacement development")', async () => {
    const scorer = new CardScorer({});
    const [s] = await scorer.score({
      cards: [{ id: 'w', title: 'Saber replacement midway through development' }],
      intents: [
        { topicName: 'men', strength: 0.9 },
        { topicName: 'development', strength: 0.5 },
      ],
    });
    // 'men' is <4 chars → ignored entirely; 'development' matches as a word.
    expect(s!.matchedTopics).toEqual(['development']);
  });

  it('matches whole words and phrases, not substrings', async () => {
    const scorer = new CardScorer({});
    const [a, b] = await scorer.score({
      cards: [
        { id: 'a', title: 'A great desk for offices' },
        { id: 'b', title: 'Desktop tower PC' },
      ],
      intents: [{ topicName: 'desk', strength: 0.8 }],
    });
    expect(a!.matchedTopics).toEqual(['desk']);
    expect(b!.matchedTopics).toEqual([]); // "desktop" must not match "desk"
  });

  it('claim-filter reason no longer credits an agent that never ran', async () => {
    const [s] = await score([{ id: 'c', title: 'Miracle standing desks — guaranteed cure!' }]);
    expect(s!.verdict).toBe('filtered');
    expect(s!.reason).not.toContain('Guardian');
    expect(s!.reason.toLowerCase()).toContain('claim');
  });
});
