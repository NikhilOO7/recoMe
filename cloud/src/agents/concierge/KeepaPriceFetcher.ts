import type { Platform } from '../../graph/types.js';
import type { PriceFetcher, PriceQuote } from './PriceFetcher.js';
import { logger } from '../../observability/logger.js';

/**
 * KeepaPriceFetcher — Amazon-only price source via keepa.com (ADR-0017 §2.4).
 *
 * Keepa is the v1.1 vendor pick when ≥80% of Concierge traffic targets Amazon
 * entities (see ADR-0017 §5 telemetry plan). It exposes deep historical
 * pricing (90d / lifetime averages) which lets Concierge gate `deal_drop`
 * emissions on "below baseline" without us maintaining a price baseline table.
 *
 * v1 of this fetcher handles:
 *   - ASIN-keyed lookups (entityKey === ASIN today; an entity-to-ASIN resolver
 *     is a v1.1 follow-up — see open question §1 in ADR-0017).
 *   - 15-min in-process cache (matches ADR-0012 §2.5 cache contract).
 *   - Token-bucket throttling so we never blow past Keepa's per-minute quota
 *     and trigger a 503 streak.
 *
 * What this v1 does NOT handle (intentional):
 *   - Walmart / eBay — Keepa is Amazon-only. compareOffers() will return only
 *     the Amazon quote until the cross-retailer fetcher (Rainforest or PA-API)
 *     is wired alongside.
 *   - Free-text → ASIN resolution. Entity keys that are not ASIN-shaped get
 *     a null quote (logged at info level) — same as if the retailer didn't
 *     carry the entity. The resolver belongs upstream in the graph.
 *   - Persisted-across-process cache. In-process LRU is fine until we run
 *     more than 2 worker machines per region; Redis swap is one file.
 *
 * Wiring: set INTELLIGENCE_AGENTS_PRICE_VENDOR=keepa and KEEPA_API_KEY in env;
 * PriceFetcher.getPriceFetcher() will instantiate this class instead of stub.
 */

const KEEPA_BASE_URL = 'https://api.keepa.com';
const KEEPA_DOMAIN_US = 1; // Keepa's marketplace ID for amazon.com (1=US, 2=UK, 3=DE, ...)

/** Per-call timeout; Keepa p95 is <500ms, so 5s is well over the alarm threshold. */
const REQUEST_TIMEOUT_MS = 5_000;

/** Hard ceiling — never burn more than this many tokens in one polling burst. */
const MAX_TOKENS_PER_CALL = 10;

export interface KeepaPriceFetcherOptions {
  apiKey: string;
  /** Override for tests. */
  fetchImpl?: typeof fetch;
  /** Override for tests. */
  now?: () => number;
}

export class KeepaPriceFetcher implements PriceFetcher {
  readonly name = 'keepa';
  readonly supports: ReadonlyArray<Platform> = ['amazon'];

  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  private readonly cache = new Map<string, { q: PriceQuote; until: number }>();
  private readonly cacheTtlMs = 15 * 60 * 1000;

  /** Tokens remaining (Keepa surfaces this in every response). 0 = throttled. */
  private tokensLeft = 100;
  /** Most recent server-reported refill rate (tokens per minute). */
  private refillPerMinute = 5;
  /** ms epoch we'll be back at full capacity (approx). */
  private nextTokenAt = 0;

  constructor(opts: KeepaPriceFetcherOptions) {
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? (() => Date.now());
  }

  async priceCheck(entityKey: string, retailer: Platform): Promise<PriceQuote | null> {
    if (retailer !== 'amazon') return null;
    if (!isLikelyAsin(entityKey)) {
      // No upstream ASIN resolver yet — log so we can size the resolver work.
      logger.info({ entityKey }, 'keepa: skipping non-ASIN entity key');
      return null;
    }

    const asin = entityKey.toUpperCase();
    const cacheKey = `${asin}::amazon`;
    const now = this.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.until > now) return cached.q;

    if (this.tokensLeft <= 0 && this.nextTokenAt > now) {
      logger.warn(
        { asin, nextTokenAt: this.nextTokenAt },
        'keepa: token bucket empty, skipping call',
      );
      return null;
    }

    let body: KeepaProductResponse | null = null;
    try {
      body = await this.callKeepa(asin);
    } catch (err) {
      logger.warn({ asin, err }, 'keepa: priceCheck failed');
      return null;
    }
    if (!body) return null;

    const product = body.products?.[0];
    if (!product) {
      logger.info({ asin }, 'keepa: no product returned');
      return null;
    }

    const quote = toPriceQuote(product, asin, now);
    if (!quote) return null;

    this.cache.set(cacheKey, { q: quote, until: now + this.cacheTtlMs });
    return quote;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async callKeepa(asin: string): Promise<KeepaProductResponse | null> {
    const url =
      `${KEEPA_BASE_URL}/product` +
      `?key=${encodeURIComponent(this.apiKey)}` +
      `&domain=${KEEPA_DOMAIN_US}` +
      `&asin=${asin}` +
      // history=0 → just current snapshot. Saves tokens vs the default (1).
      `&history=0` +
      `&offers=20` +
      `&stock=1`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await this.fetchImpl(url, { signal: ctrl.signal });
      if (!res.ok) {
        if (res.status === 429) {
          // Keepa returns 429 when we burn the bucket faster than refill.
          this.tokensLeft = 0;
          this.nextTokenAt = this.now() + 60_000; // back off 1 min
        }
        logger.warn({ asin, status: res.status }, 'keepa: non-2xx response');
        return null;
      }
      const json = (await res.json()) as KeepaProductResponse;
      this.applyTokenAccounting(json);
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  private applyTokenAccounting(body: KeepaProductResponse): void {
    if (typeof body.tokensLeft === 'number') {
      this.tokensLeft = body.tokensLeft;
    }
    if (typeof body.refillRate === 'number') {
      this.refillPerMinute = body.refillRate;
    }
    if (this.tokensLeft <= 0) {
      this.nextTokenAt =
        this.now() + Math.ceil((MAX_TOKENS_PER_CALL / this.refillPerMinute) * 60_000);
    } else {
      this.nextTokenAt = 0;
    }
  }
}

// ── Response shape (minimal, what we actually read) ─────────────────────────
// Keepa's product endpoint returns a large object; we destructure only the
// fields v1 needs. Full schema is at https://keepa.com/#!discuss/t/product/110

interface KeepaProductResponse {
  tokensLeft?: number;
  refillRate?: number;
  products?: KeepaProduct[];
}

interface KeepaProduct {
  asin: string;
  title?: string;
  /**
   * `stats.current` is a fixed-length array of current-prices keyed by the
   * "csv index" enum (0=AMAZON, 1=NEW, 2=USED, …). Prices in cents; -1 means
   * "no current offer at this index".
   */
  stats?: {
    current?: number[];
    avg90?: number[];
    avg30?: number[];
  };
  /** When `&offers=N` is passed, Keepa returns offer rows here. */
  offers?: Array<{
    sellerId?: string;
    isPrime?: boolean;
    offerCSV?: number[]; // [time, price, shipping, …]
    stockCSV?: number[];
  }>;
}

// Keepa "csv index" 0 = Amazon, 1 = New (3p), 2 = Used, 3 = Sales rank, ...
const CSV_AMAZON = 0;
const CSV_NEW = 1;

function toPriceQuote(product: KeepaProduct, asin: string, now: number): PriceQuote | null {
  const current = product.stats?.current;
  const avg90 = product.stats?.avg90;

  // Prefer Amazon's own offer; fall back to cheapest new from a 3p seller.
  const amazonCents = pickPositive(current?.[CSV_AMAZON]);
  const newCents = pickPositive(current?.[CSV_NEW]);
  const amountCents = amazonCents ?? newCents;
  if (amountCents == null) return null;

  const ref90 = pickPositive(avg90?.[CSV_AMAZON]) ?? pickPositive(avg90?.[CSV_NEW]);
  const inStock = amazonCents != null || newCents != null;

  return {
    retailer: 'amazon',
    url: `https://www.amazon.com/dp/${asin}`,
    currency: 'USD',
    amountCents,
    ...(ref90 != null ? { referenceCents: ref90 } : {}),
    inStock,
    capturedAt: now,
    source: 'keepa',
  };
}

/** Keepa uses -1 for "no value"; treat anything <= 0 as missing. */
function pickPositive(v: number | undefined): number | undefined {
  return typeof v === 'number' && v > 0 ? v : undefined;
}

/** ASINs are 10 chars, alphanumeric, usually starting with B0 (modern) or 0/1 (books). */
function isLikelyAsin(s: string): boolean {
  return /^[A-Z0-9]{10}$/i.test(s.trim());
}
