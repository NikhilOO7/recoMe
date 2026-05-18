import { BaseAgent } from '../BaseAgent.js';
import type { AgentContext, AgentResult, AgentEventSource } from '../types.js';
import type { Platform } from '../../graph/types.js';
import { compareOffers, formatUsd } from './tools.js';
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
  readonly triggers = ['event'] as const;

  override async canRun(ctx: AgentContext): Promise<boolean> {
    if (ctx.trigger !== 'event') return false;
    const event = ctx.event as Partial<ConciergeTriggerEvent> | undefined;
    if (!event?.signalId || !event.topicNormalizedName) return false;
    // Concierge only fires when the user touched a commerce platform AND we
    // have at least one entity to price-check. A topic-only commerce signal
    // (e.g. browsing Amazon's homepage with no product entity) is skipped.
    if (!event.platform || !COMMERCE_PLATFORMS.includes(event.platform)) return false;
    if (!event.entityNames || event.entityNames.length === 0) return false;
    // Per ADR-0017 §2.3, in prod the price vendor must be explicitly set.
    // Allow stub in dev/test by default.
    const vendor = process.env.INTELLIGENCE_AGENTS_PRICE_VENDOR ?? 'stub';
    if (process.env.NODE_ENV === 'production' && vendor === 'stub') {
      logger.warn({ agent: this.name }, 'concierge skipped: stub vendor not allowed in production');
      return false;
    }
    return true;
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    const event = ctx.event as unknown as ConciergeTriggerEvent;
    const entityKey = (event.entityNames?.[0] ?? '').trim();
    if (!entityKey) {
      return { status: 'skipped', reason: 'no entity to price-check' };
    }

    // ── Compare offers across all supported retailers ────────────────────
    const cmp = await compareOffers(entityKey);
    if (!cmp.cheapest) {
      return { status: 'skipped', reason: `no in-stock quotes for entity "${entityKey}"` };
    }

    const { cheapest } = cmp;
    const ref = cheapest.referenceCents;
    const dropPct = ref ? 1 - cheapest.amountCents / ref : 0;
    if (!ref || dropPct < DEAL_THRESHOLD) {
      return {
        status: 'skipped',
        reason: `cheapest ${formatUsd(cheapest.amountCents)} not a deal (drop ${(dropPct * 100).toFixed(1)}%)`,
      };
    }

    // ── Build the emission ───────────────────────────────────────────────
    const savingsCents = ref - cheapest.amountCents;
    const retailerLabel = retailerDisplay(cheapest.retailer);
    const title = `${retailerLabel} dropped "${entityKey}" to ${formatUsd(cheapest.amountCents)} — ${formatUsd(savingsCents)} below baseline.`;

    const otherQuotes = cmp.quotes.filter((q) => q.retailer !== cheapest.retailer && q.inStock);
    const otherSummary = otherQuotes
      .sort((a, b) => a.amountCents - b.amountCents)
      .slice(0, 2)
      .map((q) => `${retailerDisplay(q.retailer)} ${formatUsd(q.amountCents)}`)
      .join(' · ');

    const bodyParts: string[] = [
      `You're looking at this on ${retailerDisplay(event.platform ?? cheapest.retailer)} — Concierge checked ${cmp.quotes.length} retailers.`,
    ];
    if (otherSummary) bodyParts.push(`Other in-stock offers: ${otherSummary}.`);
    if (cmp.spreadCents > 0) {
      bodyParts.push(`Cross-retailer spread: ${formatUsd(cmp.spreadCents)}.`);
    }
    if (cheapest.source === 'stub') {
      bodyParts.push('Note: prices are illustrative — Concierge is in early access (ADR-0017).');
    }

    const sources: AgentEventSource[] = [
      { kind: 'signal', id: event.signalId, label: `capture that triggered this check` },
      { kind: 'entity', id: entityKey, label: entityKey },
      { kind: 'topic', id: event.topicNormalizedName, label: event.topicName },
      ...cmp.quotes.map(
        (q): AgentEventSource => ({
          kind: 'page',
          id: q.url,
          label: `${retailerDisplay(q.retailer)} · ${formatUsd(q.amountCents)}${q.inStock ? '' : ' (out of stock)'}`,
          url: q.url,
        }),
      ),
    ];

    return {
      status: 'succeeded',
      emit: {
        kind: 'deal_drop',
        title,
        body: bodyParts.join(' '),
        actionUrl: cheapest.url,
        sources,
        // One Concierge emission per (user, entity, day-bucket). Repeated views
        // of the same product within 24h won't re-notify.
        dedupeKey: `concierge:${entityKey.toLowerCase()}:${Math.floor(ctx.now.getTime() / (24 * 60 * 60 * 1000))}`,
      },
      llmTokens: 0,
      costMicros: 0,
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
