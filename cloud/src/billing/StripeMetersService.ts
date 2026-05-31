import Stripe from 'stripe';
import { prisma } from '../db.js';
import { getConfig } from '../config.js';
import { logger } from '../observability/logger.js';

/**
 * StripeMetersService — daily delta rollup of TenantUsage → Stripe Meters
 * (P4.1, ADR-0003 §2.3 usage-based billing).
 *
 * Why daily and not real-time:
 *   - One Stripe meter_event per signal would be expensive and noisy
 *     (Stripe rate-limits meter_event creation; we have no need for sub-day
 *     granularity at our pricing curve).
 *   - A daily delta is what shows up on the customer's invoice anyway.
 *   - Re-tries are cheap: each row carries the last reported count, so a
 *     re-run reports only the new delta (idempotent).
 *
 * Per-metric mapping (configured via env, see config.ts):
 *   signalsIngested   → STRIPE_METER_SIGNALS_ID
 *   queriesServed     → STRIPE_METER_QUERIES_ID
 *   embeddingsBilled  → STRIPE_METER_EMBEDDINGS_ID
 *
 * When a meter ID is unset the metric is skipped (logged at debug). Lets
 * us roll out per-metric billing one meter at a time without forcing all
 * three to be configured up front.
 *
 * Failure isolation: a Stripe-side failure for one tenant does not abort
 * the loop. The TenantUsage row stays at its current `*Reported` count, so
 * the next tick re-reports the same delta. Stripe Meters' own deduplication
 * (identifier = "{period}::{tenantId}::{metric}::{counter}") prevents
 * double-billing across re-tries.
 */

type Metric = 'signals' | 'queries' | 'embeddings';

interface MetricBinding {
  metric: Metric;
  /** Column on TenantUsage holding the current period count. */
  currentField: 'signalsIngested' | 'queriesServed' | 'embeddingsBilled';
  /** Column tracking the last-reported value. */
  reportedField: 'signalsReported' | 'queriesReported' | 'embeddingsReported';
  /** Stripe meter ID for `event_name` on meter_event create. */
  meterEnvKey: 'STRIPE_METER_SIGNALS_ID' | 'STRIPE_METER_QUERIES_ID' | 'STRIPE_METER_EMBEDDINGS_ID';
}

const BINDINGS: ReadonlyArray<MetricBinding> = [
  {
    metric: 'signals',
    currentField: 'signalsIngested',
    reportedField: 'signalsReported',
    meterEnvKey: 'STRIPE_METER_SIGNALS_ID',
  },
  {
    metric: 'queries',
    currentField: 'queriesServed',
    reportedField: 'queriesReported',
    meterEnvKey: 'STRIPE_METER_QUERIES_ID',
  },
  {
    metric: 'embeddings',
    currentField: 'embeddingsBilled',
    reportedField: 'embeddingsReported',
    meterEnvKey: 'STRIPE_METER_EMBEDDINGS_ID',
  },
];

export interface RollupResult {
  tenantsScanned: number;
  metricsReported: number;
  metricsSkipped: number;
  errors: number;
}

export class StripeMetersService {
  private stripe: Stripe | null = null;

  private getStripe(): Stripe | null {
    if (this.stripe) return this.stripe;
    const config = getConfig();
    if (!config.STRIPE_SECRET_KEY) return null;
    this.stripe = new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });
    return this.stripe;
  }

  /**
   * Walk every TenantUsage row for the current period; for each metric with
   * a configured meter, report the delta and advance `*Reported`. Returns
   * a summary so the worker can log totals.
   */
  async rollupCurrentPeriod(): Promise<RollupResult> {
    const stripe = this.getStripe();
    const result: RollupResult = {
      tenantsScanned: 0,
      metricsReported: 0,
      metricsSkipped: 0,
      errors: 0,
    };
    if (!stripe) {
      logger.warn('StripeMetersService: STRIPE_SECRET_KEY unset, rollup is a no-op');
      return result;
    }

    const config = getConfig();
    const period = currentPeriod();
    const rows = await prisma.tenantUsage.findMany({
      where: { period },
      include: { tenant: { select: { id: true, stripeCustomerId: true } } },
    });

    for (const row of rows) {
      result.tenantsScanned++;
      const customerId = row.tenant.stripeCustomerId;
      if (!customerId) {
        // Free tier without a Stripe customer — nothing to bill.
        result.metricsSkipped += BINDINGS.length;
        continue;
      }

      for (const binding of BINDINGS) {
        const meterId = config[binding.meterEnvKey];
        if (!meterId) {
          result.metricsSkipped++;
          continue;
        }
        const current = row[binding.currentField];
        const reported = row[binding.reportedField];
        const delta = current - reported;
        if (delta <= 0) {
          result.metricsSkipped++;
          continue;
        }

        try {
          await stripe.billing.meterEvents.create({
            event_name: meterId,
            payload: {
              stripe_customer_id: customerId,
              value: String(delta),
            },
            // Stripe-side dedupe: same identifier within the meter's window
            // is a single event. (period, tenant, metric, reported) is the
            // unique key — re-running today's rollup won't double-count.
            identifier: `${period}::${row.tenantId}::${binding.metric}::${current}`,
          });
          result.metricsReported++;

          // Advance the watermark only on success. A failure leaves it
          // alone so tomorrow's tick re-tries the same delta.
          await prisma.tenantUsage.update({
            where: { id: row.id },
            data: {
              [binding.reportedField]: current,
              lastReportedAt: new Date(),
            },
          });
        } catch (err) {
          result.errors++;
          logger.warn(
            { err, tenantId: row.tenantId, metric: binding.metric, delta },
            'meter event create failed',
          );
        }
      }
    }

    logger.info(result, 'tenant usage rollup completed');
    return result;
  }
}

function currentPeriod(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

let svc: StripeMetersService | null = null;
export function getStripeMeters(): StripeMetersService {
  if (!svc) svc = new StripeMetersService();
  return svc;
}
