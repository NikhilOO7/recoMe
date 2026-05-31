import type { Platform } from '../../graph/types.js';
import { logger } from '../../observability/logger.js';
import { KeepaPriceFetcher } from './KeepaPriceFetcher.js';

/**
 * PriceFetcher — the interface every Concierge price source implements
 * (ADR-0017). Concierge tools (price_check, compare_offers, find_alternatives)
 * compose this; the agent never imports a concrete vendor. Swapping Keepa /
 * RainforestAPI / PA-API in is one file's worth of work.
 */

export interface PriceQuote {
  retailer: Platform;
  url: string;
  currency: 'USD';
  amountCents: number;
  /**
   * The "typical" price for this entity on this retailer when the vendor
   * exposes one — Keepa surfaces 90d / lifetime averages; PA-API returns
   * MSRP. Concierge uses (amountCents < referenceCents * 0.9) to gate
   * deal_drop emissions. Optional because some vendors will not provide it.
   */
  referenceCents?: number;
  inStock: boolean;
  shippingDays?: number;
  capturedAt: number; // ms epoch
  source: 'stub' | 'keepa' | 'rainforest' | 'pa-api' | 'scrape';
}

export interface PriceFetcher {
  readonly name: string;
  readonly supports: ReadonlyArray<Platform>;
  /**
   * Current price + stock for ONE entity on ONE retailer.
   * Implementations cache 15min per (entityKey, retailer) per ADR-0012 §2.5.
   * Returns null if the retailer doesn't carry the entity or the call fails.
   */
  priceCheck(entityKey: string, retailer: Platform): Promise<PriceQuote | null>;
}

// ── StubPriceFetcher (ADR-0017 §2.3) ────────────────────────────────────────
// Deterministic-by-entity, time-bucketed so the dev/test loop is repeatable
// but emissions still happen occasionally so the Inbox event path is real.
//
// Hard rule: in prod, this fetcher refuses to run unless
//   INTELLIGENCE_AGENTS_PRICE_VENDOR === 'stub'
// is explicitly set. The agent's canRun() checks the env, so this fetcher's
// own gate is belt-and-braces.

const STUB_RETAILERS: Platform[] = ['amazon', 'walmart', 'ebay'];

/** Tiny djb2 hash — fits in 32 bits, deterministic across runs. */
function hash32(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

export class StubPriceFetcher implements PriceFetcher {
  readonly name = 'stub';
  readonly supports = STUB_RETAILERS;

  /** In-process cache so repeated calls inside one pass don't re-roll. */
  private readonly cache = new Map<string, { q: PriceQuote; until: number }>();
  private readonly cacheTtlMs = 15 * 60 * 1000;

  /** Bucket size for "occasional price drops" — every ~6h per entity. */
  private readonly dropBucketMs = 6 * 60 * 60 * 1000;

  async priceCheck(entityKey: string, retailer: Platform): Promise<PriceQuote | null> {
    if (!this.supports.includes(retailer)) return null;
    const cacheKey = `${entityKey}::${retailer}`;
    const now = Date.now();
    const hit = this.cache.get(cacheKey);
    if (hit && hit.until > now) return hit.q;

    const h = hash32(`${entityKey}::${retailer}`);
    // Stable base price in $50–$1200 range, varied per retailer.
    const baseCents = 5000 + (h % 115_000);
    // Per-retailer drift so cross-retailer compare is non-trivial.
    const retailerDelta = retailer === 'amazon' ? 0 : retailer === 'walmart' ? -1200 : 800; // ebay slight up
    // Drop cycle: every ~6h some entities go on sale.
    const bucket = Math.floor(now / this.dropBucketMs);
    const onSale = hash32(`${entityKey}::${bucket}`) % 7 === 0; // ~14% chance per bucket
    const dropCents = onSale ? Math.round(baseCents * 0.12) : 0;

    const amountCents = Math.max(1000, baseCents + retailerDelta - dropCents);
    // Reference = base + retailerDelta (no drop). Lets Concierge detect a drop
    // without a baseline table.
    const referenceCents = Math.max(amountCents + 1, baseCents + retailerDelta);
    const inStock = h % 17 !== 0; // ~94% in stock
    const shippingDays = 2 + ((h >> 8) % 6);

    const q: PriceQuote = {
      retailer,
      url: this.buildStubUrl(entityKey, retailer),
      currency: 'USD',
      amountCents,
      referenceCents,
      inStock,
      shippingDays,
      capturedAt: now,
      source: 'stub',
    };

    this.cache.set(cacheKey, { q, until: now + this.cacheTtlMs });
    logger.debug({ entityKey, retailer, amountCents, onSale }, 'stub price quote');
    return q;
  }

  private buildStubUrl(entityKey: string, retailer: Platform): string {
    const slug = encodeURIComponent(entityKey.replace(/[^a-z0-9-]/gi, '-').slice(0, 64));
    switch (retailer) {
      case 'amazon':
        return `https://www.amazon.com/s?k=${slug}`;
      case 'walmart':
        return `https://www.walmart.com/search?q=${slug}`;
      case 'ebay':
        return `https://www.ebay.com/sch/i.html?_nkw=${slug}`;
      default:
        return `https://example.com/${slug}`;
    }
  }
}

// ── Selection ──────────────────────────────────────────────────────────────
// Single entry point so the agent, tools, and any future endpoint all see the
// same fetcher instance (so the in-process cache works).

let svc: PriceFetcher | null = null;

export function getPriceFetcher(): PriceFetcher {
  if (svc) return svc;
  const vendor = process.env.INTELLIGENCE_AGENTS_PRICE_VENDOR ?? 'stub';
  switch (vendor) {
    case 'stub':
      svc = new StubPriceFetcher();
      break;
    case 'keepa': {
      const apiKey = process.env.KEEPA_API_KEY;
      if (!apiKey) {
        logger.warn('KEEPA_API_KEY not set; falling back to stub fetcher');
        svc = new StubPriceFetcher();
      } else {
        svc = new KeepaPriceFetcher({ apiKey });
      }
      break;
    }
    // case 'rainforest': svc = new RainforestPriceFetcher(...); break;    // v1.2
    // case 'pa-api': svc = new PaApiPriceFetcher(...); break;             // v1.2
    default:
      logger.warn({ vendor }, 'unknown price vendor, falling back to stub');
      svc = new StubPriceFetcher();
  }
  return svc;
}

/** Test seam — let unit tests inject a mock fetcher. */
export function setPriceFetcher(fetcher: PriceFetcher): void {
  svc = fetcher;
}
