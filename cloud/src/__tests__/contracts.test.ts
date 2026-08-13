import { describe, expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-test-secret-test-secret!!';

// ── Wire-contract fixtures (see contracts/README.md) ────────────────────────
// Each test generates a response through REAL server code and compares it to
// the committed fixture the extension also type-checks against. To change a
// contract intentionally: UPDATE_CONTRACTS=1 npx vitest run src/__tests__/contracts.test.ts

// Auth is not part of these contracts — stub it to a fixed user.
vi.mock('../middleware/authMiddleware.js', () => ({
  authMiddleware: async (c: { set: (k: string, v: string) => void }, next: () => Promise<void>) => {
    c.set('userId', 'contract-user');
    c.set('tier', 'FREE');
    await next();
  },
}));

// Prisma: fixed subscription rows so the agents-list mapping is deterministic.
vi.mock('../db.js', () => ({
  prisma: {
    agentSubscription: {
      findMany: async () => [
        {
          agent: 'recall',
          enabled: true,
          pausedAt: null,
          pausedReason: null,
          lastRunAt: new Date('2026-08-13T08:00:00Z'),
          lastEmittedAt: new Date('2026-08-12T09:00:00Z'),
        },
        {
          agent: 'concierge',
          enabled: false,
          pausedAt: new Date('2026-08-01T00:00:00Z'),
          pausedReason: 'user',
          lastRunAt: null,
          lastEmittedAt: null,
        },
      ],
    },
  },
}));

import { CardScorer } from '../intelligence/CardScorer.js';
import { DecisionAgent } from '../agents/decision/DecisionAgent.js';
import { bootAgents } from '../agents/index.js';
import { createAgentRoutes } from '../agents/AgentController.js';
import { setIntelligence, type IntelligenceService } from '../intelligence/IntelligenceService.js';

const CONTRACTS_DIR = join(__dirname, '..', '..', '..', 'contracts');
const UPDATE = process.env.UPDATE_CONTRACTS === '1';

function assertContract(name: string, actual: unknown): void {
  const file = join(CONTRACTS_DIR, `${name}.json`);
  const json = JSON.stringify(actual, null, 2) + '\n';
  if (UPDATE) {
    writeFileSync(file, json);
    return;
  }
  const expected = JSON.parse(readFileSync(file, 'utf8'));
  expect(actual).toEqual(expected);
}

const INTENTS = [
  { topicName: 'standing desks', strength: 0.85 },
  { topicName: 'espresso', strength: 0.4 },
];

describe('wire contracts', () => {
  it('score-cards: CardScorer response shape', async () => {
    const scores = await new CardScorer({}).score({
      intents: INTENTS,
      cards: [
        { id: 'B0RELEVANT', title: 'UPLIFT standing desks v2', brand: 'Uplift' },
        { id: 'B0NEUTRAL', title: 'Garden hose reel' },
        { id: 'B0FILTERED', title: 'Miracle standing desks guaranteed cure' },
      ],
    });
    assertContract('score-cards', { scores });
  });

  it('decision-stream-meta: the __meta__ envelope OverlayChat parses', async () => {
    setIntelligence({
      graph: { getTopIntents: async () => INTENTS },
    } as unknown as IntelligenceService);

    const chunks: string[] = [];
    const agent = new DecisionAgent(null); // deterministic mode
    for await (const chunk of agent.runStream({
      userId: 'contract-user',
      trigger: 'on_demand',
      now: new Date('2026-08-13T12:00:00Z'),
      event: { topicHint: 'standing desks', userQuery: 'contract check' },
    } as never)) {
      chunks.push(chunk);
    }
    const metaChunk = chunks.find((c) => c.includes('__meta__:'))!;
    const meta = JSON.parse(metaChunk.slice(metaChunk.indexOf('__meta__:') + 9));
    assertContract('decision-stream-meta', meta);
  });

  it('agents-list: GET /intelligence/agents via the real route', async () => {
    bootAgents();
    const app = createAgentRoutes();
    const res = await app.request('/agents');
    expect(res.status).toBe(200);
    assertContract('agents-list', await res.json());
  });
});
