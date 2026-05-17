import { prisma } from '../db.js';
import { logger } from '../observability/logger.js';

// ── TenantUsage tracker ──────────────────────────────────────────────────────
// Cheap, best-effort counters bumped on each request. Period = "YYYY-MM".
// Quota enforcement reads these counters; billing aggregates them at month end.
//
// Atomicity: uses Prisma's `upsert` + atomic `increment`. No race risk under
// Postgres concurrent writes — the database serializes the UPDATE.
//
// Failure mode: if Postgres is briefly unavailable, we LOG and drop the
// increment rather than fail the request. The cost is mild undercounting
// during incidents, which is preferable to refusing service.

function currentPeriod(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export type UsageMetric = 'signalsIngested' | 'queriesServed' | 'embeddingsBilled';

export async function bumpUsage(tenantId: string, metric: UsageMetric, by = 1): Promise<void> {
  if (by <= 0) return;
  const period = currentPeriod();
  try {
    await prisma.tenantUsage.upsert({
      where: { tenantId_period: { tenantId, period } },
      update: { [metric]: { increment: by } },
      create: { tenantId, period, [metric]: by },
    });
  } catch (err) {
    logger.warn({ err, tenantId, metric, by }, 'usage bump failed — dropping');
  }
}

export interface UsageSnapshot {
  period: string;
  signalsIngested: number;
  queriesServed: number;
  embeddingsBilled: number;
}

export async function getUsage(tenantId: string): Promise<UsageSnapshot> {
  const period = currentPeriod();
  const row = await prisma.tenantUsage.findUnique({
    where: { tenantId_period: { tenantId, period } },
  });
  return {
    period,
    signalsIngested: row?.signalsIngested ?? 0,
    queriesServed: row?.queriesServed ?? 0,
    embeddingsBilled: row?.embeddingsBilled ?? 0,
  };
}

// ── Plan quotas ──────────────────────────────────────────────────────────────
// Hard ceilings per plan, per calendar month. Returning 429 with a clear
// `Retry-After` (next month boundary) is friendlier than silent throttling.

import type { TenantPlan } from '@prisma/client';

export interface PlanQuota {
  signalsPerMonth: number;
  queriesPerMonth: number;
}

const PLAN_QUOTAS: Record<TenantPlan, PlanQuota> = {
  FREE: { signalsPerMonth: 1_000, queriesPerMonth: 10_000 },
  STARTER: { signalsPerMonth: 100_000, queriesPerMonth: 1_000_000 },
  PRO: { signalsPerMonth: 1_000_000, queriesPerMonth: 10_000_000 },
  ENTERPRISE: {
    signalsPerMonth: Number.POSITIVE_INFINITY,
    queriesPerMonth: Number.POSITIVE_INFINITY,
  },
};

export function planQuota(plan: TenantPlan): PlanQuota {
  // PLAN_QUOTAS is exhaustive over the TenantPlan enum; the `?? FREE` fallback
  // is purely to keep tsc happy under noUncheckedIndexedAccess.
  return PLAN_QUOTAS[plan] ?? PLAN_QUOTAS.FREE;
}

export function nextPeriodBoundaryIso(now = new Date()): string {
  // First day of next month, 00:00 UTC.
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  return next.toISOString();
}
