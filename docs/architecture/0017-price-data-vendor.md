# ADR-0017 — Price-data vendor for the Concierge agent

**Status:** Accepted (v1: stub) · v1.1 Keepa skeleton landed 2026-05-30 (off by default) · v1.2 cross-retailer deferred
**Date:** 2026-05-17 (original) · 2026-05-30 (supplement §7)
**Decider:** Founder + Principal Engineering
**Extends:** [ADR-0012 §2.5](0012-active-agents-and-personality-mirror.md#25-real-time-deals--cross-platform-comparison) (Concierge tools), [0014 §4.4](0014-unique-product-surfaces.md#44-whats-missing) (price-API vendor — open)

---

## 1. Context

The [Concierge agent](0012-active-agents-and-personality-mirror.md#22-six-agents-three-priority-tiers) needs current price + stock data for entities on commerce platforms (Amazon, Walmart, eBay, direct retailers). Three options exist in May 2026:

| Vendor                  | Surface                                                                  | Price                                         | Constraints                                                                                |
| ----------------------- | ------------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Keepa**               | Historical + real-time Amazon prices, drop alerts, marketplace breakdown | ~$19/mo for 100 tokens/min, scales linearly   | Amazon-only. Token quota; bursty workloads need throttling.                                |
| **RainforestAPI**       | Amazon + Walmart + eBay scrape-as-a-service                              | $0.001 – $0.005 per call (volume-tiered)      | Per-call billing; cost grows linearly with active trails. No historical depth.             |
| **Amazon PA-API**       | Official Amazon Product Advertising API                                  | Free, but requires affiliate-program approval | Bound by affiliate compliance; rate-limited per 24h-shipped-sales. No competitor coverage. |
| **Direct scrape**       | Custom HTTP fetchers per retailer                                        | Free except ops/legal cost                    | Brittle; legal grey area; CAPTCHA + IP-rotation maintenance.                               |
| **Stub (v0, this ADR)** | Deterministic test data from the user's graph                            | Free; runs in-process; no external network    | Not real prices. Cannot ship to paying users as the price source.                          |

[ADR-0014 §4.4](0014-unique-product-surfaces.md#44-whats-missing) called the vendor decision out as load-bearing for Concierge launch. The honest assessment: we don't have enough Concierge usage data yet to pick well. Keepa wins on Amazon depth; RainforestAPI wins on cross-retailer; PA-API wins on cost only if we accept the affiliate-program constraints. The right call depends on what users actually compare across, which we won't know until Concierge is in front of them.

## 2. Decision

### 2.1 Ship Concierge v1 against a `PriceFetcher` interface, with a stub implementation.

The agent code, tools (`price_check`, `compare_offers`, `find_alternatives`), and event emissions all flow through `PriceFetcher`. The interface is the contract that lives forever; the implementation is swappable.

This unblocks every downstream piece (Inbox cards, AgentEvent dedupe, Guardian throttling, the agents-management UI in Wave 3) without forcing a vendor decision we don't have signal for.

### 2.2 The `PriceFetcher` interface

```ts
export interface PriceFetcher {
  readonly name: string; // 'stub' | 'keepa' | 'rainforest' | 'pa-api'
  readonly supports: ReadonlyArray<Platform>;

  /**
   * Current price + stock for ONE entity on ONE retailer.
   * Implementations cache 15min per (entityKey, retailer) per ADR-0012 §2.5.
   */
  priceCheck(entityKey: string, retailer: Platform): Promise<PriceQuote | null>;
}

export interface PriceQuote {
  retailer: Platform;
  url: string;
  currency: 'USD'; // single-region for v1; multi-currency when EU tenants ask
  amountCents: number;
  inStock: boolean;
  shippingDays?: number;
  capturedAt: number; // ms
  source: 'stub' | 'keepa' | 'rainforest' | 'pa-api' | 'scrape';
}
```

Tools (`compare_offers`, `find_alternatives`) compose `priceCheck` — they do not bypass it. Cache lives behind the interface, not inside it, so a real vendor swap touches one file.

### 2.3 v0 — `StubPriceFetcher` (this cycle)

- Returns deterministic `PriceQuote`s derived from the entity key hash + the current time bucket.
- Occasionally returns a "price dropped" quote (every ~6h per entity) so the dedupe key + Inbox event path are exercised in dev.
- Logs every call so we can see what the real vendor would have been asked.
- **Never shown to paying users** — gated by `INTELLIGENCE_AGENTS_PRICE_VENDOR=stub` (default in dev; required to be explicitly set in prod, or Concierge skips).

### 2.4 v1 — vendor swap (next cycle, separate ADR)

Decided after we have ≥2 weeks of Concierge stub traffic. Picks one of:

- **Keepa-only** if 80%+ of stub traffic targets Amazon entities (likely)
- **Keepa + RainforestAPI** if cross-retailer comparison is a common path (the §F-403 promise)
- **Switch to PA-API** if affiliate approval is approved and the rate-limit curve is acceptable

The vendor swap is one file (`cloud/src/agents/concierge/PriceFetcher.ts`) plus an env flag.

## 3. What this ADR explicitly does NOT decide

- The eventual vendor. We commit only to the interface.
- Affiliate-revenue model from Concierge surfaces. Per [ADR-0012 §8](0012-active-agents-and-personality-mirror.md#8-decisions-explicitly-deferred), defer until ≥1000 DAU on Concierge.
- Multi-currency / EU coverage. Single-region (USD) for v1.
- Caching backend. The interface owns the cache contract; v1 uses an in-process LRU. Redis-backed cache is a swap when fleet size grows.

## 4. Consequences

### Positive

- Concierge ships now, not after a vendor RFP. The whole agent loop (event → tool → emission → Inbox card → feedback) is exercised in dev + prod against stub data.
- Vendor decision is informed by real usage, not speculation.
- The `PriceFetcher` interface is the only contract downstream code couples to — vendor swap is a localised diff.

### Negative / risks

- **Stub data in prod is a footgun.** Mitigation: a hard gate (`INTELLIGENCE_AGENTS_PRICE_VENDOR=stub`) that must be explicitly set; if unset in prod, Concierge `canRun()` returns false. No accidental "we shipped fake prices to a real user."
- **Concierge emissions during the stub period are not deal-decisions, just deal-shaped notifications.** UI copy must say "Concierge is in early access — prices are illustrative" until vendor lands. Tracked as a one-line banner on Inbox cards from the stub.
- **Spend / latency profile is unknown** until a real vendor is in path. We will discover budget surprises after the swap. Mitigation: GuardianAgent's per-user daily cap absorbs surprises; we'll re-audit.

## 5. Open questions

1. **Caching key — entity-key or canonical-URL?** Stub uses entity-key. Real vendors usually accept ASIN / item-id, which is closer to entity-key. Defer.
2. **Affiliate-program approval for PA-API.** Worth applying in parallel so it's an option when v1 ships. Not blocking this ADR.
3. **Stub-data warning UI** copy — exact wording on Inbox cards. Defer to the marketing pass when Concierge gets a public release note.

## 6. Related

- [ADR-0012 §2.5](0012-active-agents-and-personality-mirror.md#25-real-time-deals--cross-platform-comparison) — Concierge tools
- [0014 §4.3 — F-403 Cross-platform Concierge](0014-unique-product-surfaces.md#43-cross-platform-concierge)
- [ADR-0010 §2](0010-security-privacy-ops.md) — third-party data flow constraints (PriceFetcher requests do not include the user's identity)
- [0011 §1.1](0011-cost-and-iaas-gtm.md#11) — Concierge cost line item (~$0.30/user/mo per ADR-0012 §4)

---

## 7. Supplement (2026-05-30) — vendor-pick decision criteria + v1.1 Keepa skeleton

This supplement lands when WS-7 (BullMQ workers) ships so the Concierge sweep cadence is real and the telemetry below is collectible.

### 7.1 What just shipped

- `cloud/src/agents/concierge/KeepaPriceFetcher.ts` — v1 Amazon-only implementation against Keepa's `/product` endpoint, 15-min in-process cache, server-reported token-bucket honored, ASIN-shaped entity-key gate.
- `INTELLIGENCE_AGENTS_PRICE_VENDOR` widened to accept `keepa`. `KEEPA_API_KEY` added to `cloud/src/config.ts`. Missing key falls back to `stub` with a warn log (no boot failure).
- The selector in `PriceFetcher.ts` instantiates `KeepaPriceFetcher` when the env says so; the agent + tools didn't change a line.

What this **doesn't** decide: whether to flip prod to `keepa`. That's the vendor swap §2.4 calls for, and it still needs the data from §7.2.

### 7.2 Decision criteria for the prod swap

Flip `INTELLIGENCE_AGENTS_PRICE_VENDOR=keepa` in Fly secrets when **all four** hold over a rolling 14-day window:

| Criterion                | Threshold              | How to measure                                                                                                                                                  |
| ------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Amazon entity share      | ≥ 80%                  | Count `priceCheck` calls with `retailer === 'amazon'` ÷ total. The KeepaPriceFetcher's `keepa: skipping non-ASIN` info logs surface the inverse (resolver gap). |
| Daily call volume        | < 8,000 / day (≈Keepa) | Sum `priceCheck` calls across all users. At ~$20/mo for 100 tokens/min ⇒ 144k tokens/day ⇒ ample headroom at this threshold.                                    |
| ASIN-resolver hit-rate   | ≥ 60%                  | (ASIN-shaped entityKeys) ÷ (total commerce-platform entityKeys seen by Concierge). Below this, build the resolver before the swap.                              |
| Stub deal-drop precision | ≥ 50% useful           | `/inbox/:id/feedback` ratio of `useful` ÷ (`useful` + `not_useful`) for `deal_drop` events during the stub period. If users are dismissing the shape, fix the   |
|                          |                        | emission copy first — the vendor swap won't help.                                                                                                               |

When all four pass: rotate `KEEPA_API_KEY` into Fly secrets, set `INTELLIGENCE_AGENTS_PRICE_VENDOR=keepa`, redeploy. Keep the stub fetcher in code as the fallback path.

### 7.3 What still needs deciding (next supplement)

- **Cross-retailer coverage (Walmart / eBay).** Keepa is Amazon-only. If telemetry shows ≥ 25% of Concierge-eligible signals come from non-Amazon commerce platforms, wire RainforestAPI alongside Keepa (a v1.2 selector that returns the cheapest of both). Until then, single-vendor is honest about the F-403 promise.
- **Entity-key → ASIN resolver.** v1 expects `entityKey` to already be an ASIN. Most real signals won't. Two paths:
  1. Cheap: ask the extension to extract `data-asin` / canonical `/dp/{ASIN}/` from PDP DOM (already partly done — verify in `extension/src/platforms/amazon.ts`) and propagate as `entityName`.
  2. Expensive: Keepa's `/search` endpoint (5 tokens per call) → map title → ASIN. Only worth it if path (1) hit-rate stays < 60%.
- **PA-API path.** Worth applying for the affiliate program in parallel; if approval lands and rate-limit math works, PA-API at $0 beats Keepa at $20. The selector's `case 'pa-api'` is already stubbed.

### 7.4 Risks introduced by the Keepa skeleton

- **Stale 15-min cache during fast price drops.** Acceptable for Concierge's ~6h emission dedupe window; Watchlist users won't get sub-15-min notifications. Documented gap.
- **Token-bucket starvation on a noisy day.** `KeepaPriceFetcher.applyTokenAccounting` honors the server-reported `tokensLeft`; when 0, calls short-circuit to `null` and the agent skips emission. Worst case: Concierge silently no-ops for a window — no incorrect emissions, no infra alarm. Acceptable for v1.1.
- **Off-by-default ships dead code in prod.** Acceptable trade-off — the alternative (delaying the integration until the data is in) leaves more diff to land at the moment the founder makes the swap call, which is precisely when we want minimal change.
