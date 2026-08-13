/**
 * Wire-contract check (see contracts/README.md): the SAME fixtures the cloud
 * test regenerates from real handlers are assigned to the client types here.
 * If the server response shape changes, the cloud test fails; if the client
 * types drift from the fixtures, ts-jest fails THIS file's compilation.
 * Both shipped shape-drift bugs (invented AgentInfo.subscription, flat
 * CardScore fields) would have died in CI under this harness.
 */
import agentsList from '../../../../contracts/agents-list.json';
import scoreCards from '../../../../contracts/score-cards.json';
import decisionMeta from '../../../../contracts/decision-stream-meta.json';
import type { AgentInfo, CardScore } from '../CloudClient';

describe('wire contracts (client side)', () => {
  test('agents-list fixture satisfies AgentInfo[]', () => {
    // Compile-time: this assignment IS the contract.
    const agents: AgentInfo[] = agentsList.agents;
    expect(agents.length).toBeGreaterThanOrEqual(6);
    for (const a of agents) {
      expect(typeof a.name).toBe('string');
      expect(typeof a.enabled).toBe('boolean');
      expect(typeof a.paused).toBe('boolean');
    }
    // The bug this harness exists for: no nested subscription object.
    expect('subscription' in agents[0]!).toBe(false);
  });

  test('score-cards fixture satisfies CardScore[]', () => {
    // JSON imports widen literal unions to string — narrow verdict at
    // runtime; every other field stays compile-time enforced.
    const scores: CardScore[] = scoreCards.scores.map((s) => {
      expect(['relevant', 'neutral', 'caution', 'filtered']).toContain(s.verdict);
      return { ...s, verdict: s.verdict as CardScore['verdict'] };
    });
    expect(scores.length).toBeGreaterThan(0);
    for (const s of scores) {
      expect(Array.isArray(s.matchedTopics)).toBe(true);
    }
  });

  test('decision-stream-meta fixture matches what OverlayChat parses', () => {
    // OverlayChat reads: sources[] (kind/id/label/url?), actionUrl, llm flag.
    expect(Array.isArray(decisionMeta.sources)).toBe(true);
    for (const s of decisionMeta.sources) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.kind).toBe('string');
    }
    expect(typeof decisionMeta.llm).toBe('boolean');
    expect('actionUrl' in decisionMeta).toBe(true);
    expect(typeof decisionMeta.dedupeKey).toBe('string');
  });
});
