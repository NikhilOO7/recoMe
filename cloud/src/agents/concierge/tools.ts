import type { Platform } from '../../graph/types.js';
import { getPriceFetcher, type PriceFetcher, type PriceQuote } from './PriceFetcher.js';
import { logger } from '../../observability/logger.js';

/**
 * Concierge tools (ADR-0012 §2.5).
 *
 * These are the three primitives the agent composes. Each is a pure function
 * over the PriceFetcher contract — none knows which vendor is in path. Tests
 * inject a mock via setPriceFetcher().
 */

// ── price_check(entity, retailers[]) ───────────────────────────────────────
// Single retailer at a time; the orchestration is compareOffers's job.

export interface PriceCheckResult {
  entityKey: string;
  quotes: PriceQuote[];
  missing: Platform[]; // retailers the fetcher returned null for
}

export async function priceCheck(
  entityKey: string,
  retailers: Platform[],
  fetcher: PriceFetcher = getPriceFetcher(),
): Promise<PriceCheckResult> {
  const settled = await Promise.allSettled(retailers.map((r) => fetcher.priceCheck(entityKey, r)));
  const quotes: PriceQuote[] = [];
  const missing: Platform[] = [];
  settled.forEach((s, i) => {
    const r = retailers[i]!;
    if (s.status === 'fulfilled' && s.value) {
      quotes.push(s.value);
    } else {
      missing.push(r);
      if (s.status === 'rejected') {
        logger.warn({ entityKey, retailer: r, err: s.reason }, 'price_check failed for retailer');
      }
    }
  });
  return { entityKey, quotes, missing };
}

// ── compare_offers(entity) ─────────────────────────────────────────────────
// Calls price_check across all retailers the fetcher supports and ranks
// in-stock offers by price (ties broken by shipping time).

export interface CompareOffersResult extends PriceCheckResult {
  cheapest: PriceQuote | null;
  spreadCents: number; // 0 if 0–1 quotes; max - min otherwise
}

export async function compareOffers(
  entityKey: string,
  fetcher: PriceFetcher = getPriceFetcher(),
): Promise<CompareOffersResult> {
  const result = await priceCheck(entityKey, [...fetcher.supports], fetcher);
  const inStock = result.quotes.filter((q) => q.inStock);
  inStock.sort((a, b) => {
    if (a.amountCents !== b.amountCents) return a.amountCents - b.amountCents;
    return (a.shippingDays ?? 99) - (b.shippingDays ?? 99);
  });
  const cheapest = inStock[0] ?? null;
  const spreadCents =
    inStock.length < 2
      ? 0
      : (inStock[inStock.length - 1]?.amountCents ?? 0) - (inStock[0]?.amountCents ?? 0);
  return { ...result, cheapest, spreadCents };
}

// ── find_alternatives(entity, criteria) ────────────────────────────────────
// Returns alternative entity keys that match revealed criteria. v1: deterministic
// nearby keys + their cheapest offer. Real implementation will use the user's
// graph + LLM-generated candidates (per ADR-0012 §2.5) — that swap is gated on
// the LLM-budget review in ADR-0012 §4.
//
// Inputs:
//   - entityKey: the candidate the user is comparing
//   - relatedEntityKeys: ranked alternatives sourced from the user's graph
//     (caller's job — we don't traverse the graph here)
//   - maxCheaperThanCents: only return alternatives strictly cheaper than this

export interface AlternativeOffer {
  entityKey: string;
  quote: PriceQuote;
  savingsCents: number;
}

export async function findAlternatives(
  entityKey: string,
  relatedEntityKeys: string[],
  maxCheaperThanCents: number,
  fetcher: PriceFetcher = getPriceFetcher(),
): Promise<AlternativeOffer[]> {
  const alternatives: AlternativeOffer[] = [];
  for (const key of relatedEntityKeys) {
    if (key === entityKey) continue;
    const cmp = await compareOffers(key, fetcher);
    if (cmp.cheapest && cmp.cheapest.amountCents < maxCheaperThanCents) {
      alternatives.push({
        entityKey: key,
        quote: cmp.cheapest,
        savingsCents: maxCheaperThanCents - cmp.cheapest.amountCents,
      });
    }
  }
  alternatives.sort((a, b) => b.savingsCents - a.savingsCents);
  return alternatives;
}

// ── Small helper: pretty-format a USD price for emission copy. ─────────────
export function formatUsd(amountCents: number): string {
  return `$${(amountCents / 100).toFixed(2)}`;
}
