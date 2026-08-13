import { BaseAgent } from '../BaseAgent.js';
import type { AgentContext, AgentResult, AgentEventSource } from '../types.js';
import type { Platform } from '../../graph/types.js';
import { compareOffers, formatUsd, resolveAsinFromUrl } from './tools.js';
import { listWatchlist, updateWatchlistPrice, type WatchlistItem } from './Watchlist.js';
import { logger } from '../../observability/logger.js';

/**
 * ConciergeAgent (ADR-0012 F-403 + ADR-0014 §4) ─ event-triggered v1.
 *
 * "Wayfair dropped the Uplift V2 desk to $589 — $217 below your baseline." —
 * the canonical Concierge surface. v1 fires when a commerce-platform signal
 * is ingested (the user is *actively* browsing a product); the cron 4×/day
 * pass from ADR-0012 §2.2 is a v1.1 add when the BullMQ scheduler lands.
 *
 * Why event-triggered first:
 *   - Re-uses the existing fireSignalIngestTrigger plumbing → zero new infra.
 *   - The "user is on Amazon right now" moment is the most useful surface for
 *     a deal nudge — better hit-rate than a 4×/day background sweep on cold
 *     trails the user hasn't returned to.
 *   - The 4×/day pass is additive; same agent class will be invoked from a
 *     scheduled trigger that builds the same AgentContext.
 *
 * Trust + safety (ADR-0012 §5):
 *   - Recommends only. No buy / cart / checkout.
 *   - Cites every signal AND every retailer the PriceFetcher hit.
 *   - Guardian enforces daily LLM budget + quiet hours (we contribute 0 LLM
 *     tokens in v1 — all logic is deterministic).
 *   - Stub price data is gated by INTELLIGENCE_AGENTS_PRICE_VENDOR=stub.
 *     Production builds without that flag will skip Concierge until a real
 *     vendor is wired (ADR-0017).
 */

const COMMERCE_PLATFORMS: ReadonlyArray<Platform> = ['amazon', 'walmart', 'ebay'];

/** Emit only when at least this % below the retailer's reference price. */
const DEAL_THRESHOLD = 0.1; // 10% off

interface ConciergeTriggerEvent {
  signalId: string;
  topicNormalizedName: string;
  topicName: string;
  ts: number;
  platform?: Platform;
  entityNames?: string[];
  pageUrl?: string;
}

export class ConciergeAgent extends BaseAgent {
  readonly name = 'concierge';
  readonly displayName = 'Concierge';
  // 'event'     → fired by signalIngestTrigger when the user lands on a PDP
  //              (or by the extension's ConciergeFlow on PDP nav).
  // 'scheduled' → walks the user's Watchlist and price-checks each item;
  //              runs N×/day from a cron (BullMQ today, Fly cron command in
  //              the interim). Same agent class; the trigger picks the path.
  readonly triggers = ['event', 'scheduled'] as const;

  override async canRun(ctx: AgentContext): Promise<boolean> {
    if (this.priceVendorBlockedInProd()) return false;

    if (ctx.trigger === 'scheduled') {
      // Only run a scheduled sweep when there's something explicit to watch.
      return (await listWatchlist(ctx.userId)).length > 0;
    }
    if (ctx.trigger !== 'event') return false;

    const event = ctx.event as Partial<ConciergeTriggerEvent> | undefined;
    if (!event?.signalId || !event.topicNormalizedName) return false;
    // Concierge only fires when the user touched a commerce platform AND we
    // have at least one entity to price-check. A topic-only commerce signal
    // (e.g. browsing Amazon's homepage with no product entity) is skipped.
    if (!event.platform || !COMMERCE_PLATFORMS.includes(event.platform)) return false;
    if (!event.entityNames || event.entityNames.length === 0) return false;
    return true;
  }

  private priceVendorBlockedInProd(): boolean {
    const vendor = process.env.INTELLIGENCE_AGENTS_PRICE_VENDOR ?? 'stub';
    if (process.env.NODE_ENV === 'production' && vendor === 'stub') {
      logger.warn({ agent: this.name }, 'concierge skipped: stub vendor not allowed in production');
      return true;
    }
    return false;
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    if (ctx.trigger === 'scheduled') return this.runWatchlistSweep(ctx);
    return this.runEvent(ctx);
  }

  /** Walk the user's Watchlist; emit the first item that hits target or threshold. */
  private async runWatchlistSweep(ctx: AgentContext): Promise<AgentResult> {
    const items = await listWatchlist(ctx.userId);
    if (items.length === 0) {
      return { status: 'skipped', reason: 'empty_watchlist' };
    }

    for (const item of items) {
      // Watchlist rows are free-text labels — no ASIN available yet (the
      // free-text→ASIN resolver is the remaining v1.1 piece of ADR-0017 §1).
      const emission = await this.checkOne(item.label, item.label, ctx, { item });
      if (emission) {
        return { status: 'succeeded', emit: emission, llmTokens: 0, costMicros: 0 };
      }
    }
    return { status: 'skipped', reason: 'no_watchlist_deals' };
  }

  private async runEvent(ctx: AgentContext): Promise<AgentResult> {
    const event = ctx.event as unknown as ConciergeTriggerEvent;
    const label = (event.entityNames?.[0] ?? '').trim();
    if (!label) {
      return { status: 'skipped', reason: 'no entity to price-check' };
    }

    // The user is ON the product page — its URL carries the ASIN, which is
    // what real vendors (Keepa) key lookups on. Fall back to the label so the
    // stub vendor (and future title-keyed vendors) keep working.
    const lookupKey = resolveAsinFromUrl(event.pageUrl) ?? label;

    // If the touched entity is on the user's Watchlist, surface the watchlist
    // target so the user's explicit threshold beats the generic 10%-off rule.
    const wlItem = (await listWatchlist(ctx.userId)).find(
      (i) => i.label.trim().toLowerCase() === label.toLowerCase(),
    );
    const emission = await this.checkOne(lookupKey, label, ctx, { event, item: wlItem });
    if (!emission) {
      return { status: 'skipped', reason: `no deal on "${label}"` };
    }
    return { status: 'succeeded', emit: emission, llmTokens: 0, costMicros: 0 };
  }

  /**
   * Shared "check one entity" path. Returns an AgentEmission when the cheapest
   * quote either hits the watchlist target (if any) or is ≥10% below baseline.
   * `lookupKey` feeds the price vendor (ASIN when resolvable); `label` is the
   * human-readable entity name used in all copy and citations.
   * Side effect: updates Watchlist.lastPriceUsd / lastPriceAt when an item is
   * provided, so the /ask Watchlist UI reflects fresh data.
   */
  private async checkOne(
    lookupKey: string,
    label: string,
    ctx: AgentContext,
    src: { event?: ConciergeTriggerEvent; item?: WatchlistItem },
  ): Promise<NonNullable<AgentResult & { status: 'succeeded' }>['emit'] | null> {
    const cmp = await compareOffers(lookupKey);
    if (!cmp.cheapest) return null;

    const { cheapest } = cmp;
    const targetCents = src.item?.targetPriceUsd ? Math.round(src.item.targetPriceUsd * 100) : null;
    const ref = cheapest.referenceCents;
    const dropPct = ref ? 1 - cheapest.amountCents / ref : 0;
    const hitsTarget = targetCents != null && cheapest.amountCents <= targetCents;
    const hitsThreshold = ref != null && dropPct >= DEAL_THRESHOLD;

    if (src.item) {
      // Refresh the explicit-watch row regardless of whether we emit, so the
      // user sees Concierge actively tracking it on /ask.
      await updateWatchlistPrice(ctx.userId, src.item.id, cheapest.amountCents / 100);
    }

    if (!hitsTarget && !hitsThreshold) return null;

    const retailerLabel = retailerDisplay(cheapest.retailer);
    const reasonLabel = hitsTarget
      ? `at or below your target of ${formatUsd(targetCents!)}`
      : `${formatUsd(ref! - cheapest.amountCents)} below baseline`;
    const title = `${retailerLabel} dropped "${label}" to ${formatUsd(cheapest.amountCents)} — ${reasonLabel}.`;

    const otherQuotes = cmp.quotes.filter((q) => q.retailer !== cheapest.retailer && q.inStock);
    const otherSummary = otherQuotes
      .sort((a, b) => a.amountCents - b.amountCents)
      .slice(0, 2)
      .map((q) => `${retailerDisplay(q.retailer)} ${formatUsd(q.amountCents)}`)
      .join(' · ');

    const contextLine = src.item
      ? `From your /ask Watchlist — Concierge checked ${cmp.quotes.length} retailers.`
      : `You're looking at this on ${retailerDisplay(src.event?.platform ?? cheapest.retailer)} — Concierge checked ${cmp.quotes.length} retailers.`;
    const bodyParts: string[] = [contextLine];
    if (otherSummary) bodyParts.push(`Other in-stock offers: ${otherSummary}.`);
    if (cmp.spreadCents > 0) {
      bodyParts.push(`Cross-retailer spread: ${formatUsd(cmp.spreadCents)}.`);
    }
    if (cheapest.source === 'stub') {
      bodyParts.push('Note: prices are illustrative — Concierge is in early access (ADR-0017).');
    }

    const sources: AgentEventSource[] = [];
    if (src.event?.signalId) {
      sources.push({
        kind: 'signal',
        id: src.event.signalId,
        label: 'capture that triggered this check',
      });
    }
    if (src.item) {
      sources.push({
        kind: 'entity',
        id: `watchlist:${src.item.id}`,
        label: `Watchlist item · ${src.item.label}`,
      });
    }
    sources.push({ kind: 'entity', id: lookupKey, label });
    if (src.event?.topicNormalizedName) {
      sources.push({
        kind: 'topic',
        id: src.event.topicNormalizedName,
        label: src.event.topicName ?? src.event.topicNormalizedName,
      });
    }
    for (const q of cmp.quotes) {
      sources.push({
        kind: 'page',
        id: q.url,
        label: `${retailerDisplay(q.retailer)} · ${formatUsd(q.amountCents)}${q.inStock ? '' : ' (out of stock)'}`,
        url: q.url,
      });
    }

    return {
      kind: 'deal_drop',
      title,
      body: bodyParts.join(' '),
      actionUrl: cheapest.url,
      sources,
      // One Concierge emission per (user, entity, day-bucket). Repeated views
      // of the same product within 24h won't re-notify. Keyed on lookupKey so
      // an ASIN-resolved product dedupes across differently-titled captures.
      dedupeKey: `concierge:${lookupKey.toLowerCase()}:${Math.floor(ctx.now.getTime() / (24 * 60 * 60 * 1000))}`,
    };
  }
}

function retailerDisplay(p: Platform): string {
  switch (p) {
    case 'amazon':
      return 'Amazon';
    case 'walmart':
      return 'Walmart';
    case 'ebay':
      return 'eBay';
    case 'youtube':
      return 'YouTube';
    case 'reddit':
      return 'Reddit';
    default:
      return p.charAt(0).toUpperCase() + p.slice(1);
  }
}
