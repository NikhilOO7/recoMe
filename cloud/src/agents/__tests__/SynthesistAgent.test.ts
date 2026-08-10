import { describe, expect, it, vi } from 'vitest';
import { SynthesistAgent, isoWeekKey } from '../synthesist/SynthesistAgent.js';
import {
  setIntelligence,
  type IntelligenceService,
} from '../../intelligence/IntelligenceService.js';
import type { AgentContext } from '../types.js';

const NOW = new Date('2026-08-09T13:00:00Z'); // a Sunday
const NOW_MS = NOW.getTime();
const DAY = 86_400_000;

function trail(over: Record<string, unknown> = {}) {
  return {
    topicNormalizedName: 'standing-desks',
    topicDisplayName: 'Standing desks',
    firstSeenAt: NOW_MS - 30 * DAY,
    lastSeenAt: NOW_MS - 2 * DAY,
    platformsTouched: ['amazon', 'youtube'],
    hops: [],
    ...over,
  };
}

function stubTrails(trails: unknown[]): void {
  setIntelligence({
    trails: { listTrails: vi.fn(async () => trails) },
  } as unknown as IntelligenceService);
}

function ctx(trigger: AgentContext['trigger'] = 'scheduled'): AgentContext {
  return { userId: 'u1', trigger, now: NOW };
}

describe('SynthesistAgent', () => {
  it('skips when the user has no trails', async () => {
    stubTrails([]);
    const result = await new SynthesistAgent().run(ctx());
    expect(result).toMatchObject({ status: 'skipped', reason: 'no_trails_for_user' });
  });

  it('skips when nothing is fresh, active, or cooling (no weekly delta)', async () => {
    // Ancient trail: first seen long ago, last touched far outside the cooling window.
    stubTrails([trail({ firstSeenAt: NOW_MS - 200 * DAY, lastSeenAt: NOW_MS - 100 * DAY })]);
    const result = await new SynthesistAgent().run(ctx());
    expect(result).toMatchObject({ status: 'skipped', reason: 'no_weekly_delta' });
  });

  it('buckets fresh / active / cooling and cites every named topic', async () => {
    stubTrails([
      trail({
        topicNormalizedName: 'espresso-grinders',
        topicDisplayName: 'Espresso grinders',
        firstSeenAt: NOW_MS - 3 * DAY, // fresh (new this week)
        lastSeenAt: NOW_MS - 1 * DAY,
      }),
      trail({
        topicNormalizedName: 'standing-desks',
        topicDisplayName: 'Standing desks',
        firstSeenAt: NOW_MS - 30 * DAY,
        lastSeenAt: NOW_MS - 2 * DAY, // active (open thread)
      }),
      trail({
        topicNormalizedName: 'distributed-systems',
        topicDisplayName: 'Distributed systems',
        firstSeenAt: NOW_MS - 60 * DAY,
        lastSeenAt: NOW_MS - 21 * DAY, // cooling (2–5 weeks idle)
      }),
    ]);

    const result = await new SynthesistAgent().run(ctx());
    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') return;

    expect(result.emit.kind).toBe('weekly_summary');
    expect(result.emit.title).toContain('2 open threads');
    expect(result.emit.body).toContain('New this week: Espresso grinders');
    expect(result.emit.body).toContain('Still open: Standing desks');
    expect(result.emit.body).toContain('Cooling off: Distributed systems');
    expect(result.emit.sources.map((s) => s.id).sort()).toEqual([
      'distributed-systems',
      'espresso-grinders',
      'standing-desks',
    ]);
    expect(result.llmTokens).toBe(0);
    expect(result.costMicros).toBe(0);
  });

  it('dedupes per ISO week so a re-fired cron cannot double-send', async () => {
    stubTrails([trail()]);
    const result = await new SynthesistAgent().run(ctx());
    if (result.status !== 'succeeded') throw new Error('expected success');
    expect(result.emit.dedupeKey).toBe('synthesist:2026-W32');
  });

  it('runs on scheduled and on_demand, never on event triggers', async () => {
    const agent = new SynthesistAgent();
    expect(await agent.canRun(ctx('scheduled'))).toBe(true);
    expect(await agent.canRun(ctx('on_demand'))).toBe(true);
    expect(await agent.canRun(ctx('event'))).toBe(false);
  });
});

describe('isoWeekKey', () => {
  it('handles year boundaries per ISO-8601', () => {
    expect(isoWeekKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-W01');
    expect(isoWeekKey(new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53'); // Jan 1 2027 is a Friday → ISO week 53 of 2026
    expect(isoWeekKey(new Date('2026-12-28T00:00:00Z'))).toBe('2026-W53');
  });
});
