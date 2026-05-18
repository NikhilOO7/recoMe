import { describe, it, expect, beforeEach } from 'vitest';
import { ConciergeAgent } from '../concierge/ConciergeAgent.js';
import {
  StubPriceFetcher,
  setPriceFetcher,
  type PriceFetcher,
  type PriceQuote,
} from '../concierge/PriceFetcher.js';
import { compareOffers, findAlternatives, priceCheck } from '../concierge/tools.js';
import type { Platform } from '../../graph/types.js';
import type { AgentContext } from '../types.js';

/**
 * Concierge unit tests — no Neo4j, no DB. The fetcher seam is injected so
 * we get deterministic prices.
 */

const NOW = new Date('2026-06-01T12:00:00Z');

function ctxFor(over: Partial<AgentContext> = {}): AgentContext {
  return {
    userId: 'u1',
    trigger: 'event',
    now: NOW,
    event: {
      signalId: 'sig-1',
      topicNormalizedName: 'standing-desks',
      topicName: 'Standing desks',
      ts: NOW.getTime(),
      platform: 'amazon',
      entityNames: ['Uplift V2 standing desk'],
      pageUrl: 'https://www.amazon.com/dp/B0XYZ',
    },
    ...over,
  };
}

/** A controllable fetcher: returns whatever quote map we hand it. */
class FixtureFetcher implements PriceFetcher {
  readonly name = 'fixture';
  readonly supports = ['amazon', 'walmart', 'ebay'] as ReadonlyArray<Platform>;
  constructor(private readonly quotes: Partial<Record<Platform, PriceQuote | null>>) {}
  async priceCheck(_entity: string, retailer: Platform): Promise<PriceQuote | null> {
    return this.quotes[retailer] ?? null;
  }
}

function quote(over: Partial<PriceQuote>): PriceQuote {
  return {
    retailer: 'amazon',
    url: 'https://www.amazon.com/dp/X',
    currency: 'USD',
    amountCents: 80000,
    referenceCents: 100000,
    inStock: true,
    shippingDays: 3,
    capturedAt: NOW.getTime(),
    source: 'stub',
    ...over,
  };
}

describe('StubPriceFetcher', () => {
  it('returns deterministic, in-stock quotes with referenceCents ≥ amountCents+1', async () => {
    const f = new StubPriceFetcher();
    const a = await f.priceCheck('uplift-v2', 'amazon');
    const b = await f.priceCheck('uplift-v2', 'amazon');
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.amountCents).toBe(b!.amountCents); // 15-min cache hit
    expect(a!.referenceCents!).toBeGreaterThan(a!.amountCents);
    expect(a!.currency).toBe('USD');
    expect(a!.source).toBe('stub');
  });

  it('refuses unsupported retailers', async () => {
    const f = new StubPriceFetcher();
    expect(await f.priceCheck('x', 'youtube' as Platform)).toBeNull();
  });
});

describe('tools', () => {
  beforeEach(() => {
    setPriceFetcher(new StubPriceFetcher());
  });

  it('priceCheck reports retailers that returned null as missing', async () => {
    const fetcher = new FixtureFetcher({
      amazon: quote({ retailer: 'amazon', amountCents: 50000 }),
      walmart: null,
      ebay: quote({ retailer: 'ebay', amountCents: 55000 }),
    });
    const result = await priceCheck('x', ['amazon', 'walmart', 'ebay'], fetcher);
    expect(result.quotes).toHaveLength(2);
    expect(result.missing).toEqual(['walmart']);
  });

  it('compareOffers picks the cheapest in-stock and computes spread', async () => {
    const fetcher = new FixtureFetcher({
      amazon: quote({ retailer: 'amazon', amountCents: 80000 }),
      walmart: quote({ retailer: 'walmart', amountCents: 58900, url: 'https://walmart.com/x' }),
      ebay: quote({ retailer: 'ebay', amountCents: 73000 }),
    });
    const r = await compareOffers('uplift-v2', fetcher);
    expect(r.cheapest?.retailer).toBe('walmart');
    expect(r.cheapest?.amountCents).toBe(58900);
    expect(r.spreadCents).toBe(80000 - 58900);
  });

  it('compareOffers ignores out-of-stock quotes', async () => {
    const fetcher = new FixtureFetcher({
      amazon: quote({ amountCents: 30000, inStock: false }),
      walmart: quote({ retailer: 'walmart', amountCents: 60000, inStock: true }),
    });
    const r = await compareOffers('x', fetcher);
    expect(r.cheapest?.retailer).toBe('walmart');
  });

  it('findAlternatives only returns offers strictly cheaper than the threshold', async () => {
    const fetcher = new FixtureFetcher({
      amazon: quote({ retailer: 'amazon', amountCents: 40000 }),
      walmart: quote({ retailer: 'walmart', amountCents: 65000 }),
      ebay: quote({ retailer: 'ebay', amountCents: 90000 }),
    });
    // priceCheck inside findAlternatives is called per related-entity-key; the
    // fixture returns the same quote map for any key, so the cheapest comes
    // from 'amazon' at $400.
    const alts = await findAlternatives(
      'uplift-v2',
      ['branch-duo', 'fully-jarvis'],
      50000,
      fetcher,
    );
    expect(alts).toHaveLength(2);
    expect(alts[0]!.savingsCents).toBe(10000);
    expect(alts.every((a) => a.quote.amountCents < 50000)).toBe(true);
  });
});

describe('ConciergeAgent.canRun', () => {
  const agent = new ConciergeAgent();

  it('runs on commerce platforms with at least one entity', async () => {
    expect(await agent.canRun(ctxFor())).toBe(true);
  });

  it('skips non-event triggers', async () => {
    expect(await agent.canRun(ctxFor({ trigger: 'scheduled' }))).toBe(false);
  });

  it('skips non-commerce platforms (e.g. youtube)', async () => {
    const ctx = ctxFor();
    (ctx.event as { platform?: Platform }).platform = 'youtube';
    expect(await agent.canRun(ctx)).toBe(false);
  });

  it('skips when no entities present (Amazon homepage view)', async () => {
    const ctx = ctxFor();
    (ctx.event as { entityNames?: string[] }).entityNames = [];
    expect(await agent.canRun(ctx)).toBe(false);
  });
});

describe('ConciergeAgent.run', () => {
  it('skips when cheapest offer is not below threshold', async () => {
    setPriceFetcher(
      new FixtureFetcher({
        amazon: quote({ amountCents: 95000, referenceCents: 100000 }), // 5% off — under threshold
        walmart: quote({ retailer: 'walmart', amountCents: 96000, referenceCents: 100000 }),
        ebay: quote({ retailer: 'ebay', amountCents: 98000, referenceCents: 100000 }),
      }),
    );
    const agent = new ConciergeAgent();
    const result = await agent.run(ctxFor());
    expect(result.status).toBe('skipped');
  });

  it('emits a deal_drop when a retailer is ≥10% under reference', async () => {
    setPriceFetcher(
      new FixtureFetcher({
        amazon: quote({ amountCents: 80000, referenceCents: 100000 }),
        walmart: quote({
          retailer: 'walmart',
          amountCents: 58900,
          referenceCents: 76800,
          url: 'https://walmart.com/x',
        }),
        ebay: quote({ retailer: 'ebay', amountCents: 73000, referenceCents: 78000 }),
      }),
    );
    const agent = new ConciergeAgent();
    const result = await agent.run(ctxFor());

    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') return;
    expect(result.emit.kind).toBe('deal_drop');
    expect(result.emit.title).toContain('Walmart');
    expect(result.emit.title).toContain('$589.00');
    expect(result.emit.actionUrl).toBe('https://walmart.com/x');
    expect(result.emit.dedupeKey).toContain('concierge:');
    // Citations include the trigger signal + entity + topic + every retailer page
    expect(result.emit.sources.length).toBeGreaterThanOrEqual(6);
  });

  it('skips when no in-stock offers anywhere', async () => {
    setPriceFetcher(
      new FixtureFetcher({
        amazon: quote({ inStock: false }),
        walmart: quote({ retailer: 'walmart', inStock: false }),
        ebay: quote({ retailer: 'ebay', inStock: false }),
      }),
    );
    const agent = new ConciergeAgent();
    const result = await agent.run(ctxFor());
    expect(result.status).toBe('skipped');
  });
});
