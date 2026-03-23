import { prisma } from '../db.js';
import type { Tier } from '@prisma/client';

/** Per-tier feature limits (per month) */
const TIER_LIMITS: Record<string, Record<string, number>> = {
  FREE: {
    sync_push: 100,
    sync_pull: 500,
    ai_discovery: 0,
    ai_metadata: 0,
    brain_queries: 10,
  },
  PRO: {
    sync_push: 5000,
    sync_pull: 25000,
    ai_discovery: 50,
    ai_metadata: 200,
    brain_queries: 500,
  },
  PREMIUM: {
    sync_push: -1, // unlimited
    sync_pull: -1,
    ai_discovery: 500,
    ai_metadata: 2000,
    brain_queries: -1,
  },
};

export class UsageTracker {
  /** Record a usage event. Returns false if limit exceeded. */
  async track(userId: string, tier: Tier, feature: string): Promise<boolean> {
    const limit = TIER_LIMITS[tier]?.[feature];
    if (limit === undefined) return true; // Unknown feature = no limit
    if (limit === -1) return true; // Unlimited

    const periodStart = this.currentPeriodStart();
    const periodEnd = this.currentPeriodEnd();

    const existing = await prisma.usageRecord.findUnique({
      where: { userId_feature_periodStart: { userId, feature, periodStart } },
    });

    if (existing && existing.count >= limit) {
      return false;
    }

    await prisma.usageRecord.upsert({
      where: { userId_feature_periodStart: { userId, feature, periodStart } },
      create: { userId, feature, count: 1, periodStart, periodEnd },
      update: { count: { increment: 1 } },
    });

    return true;
  }

  /** Get current usage for a user */
  async getUsage(
    userId: string,
    tier: Tier,
  ): Promise<Record<string, { used: number; limit: number }>> {
    const periodStart = this.currentPeriodStart();
    const records = await prisma.usageRecord.findMany({
      where: { userId, periodStart },
    });

    const limits = TIER_LIMITS[tier] ?? TIER_LIMITS.FREE!;
    const result: Record<string, { used: number; limit: number }> = {};

    for (const [feature, limit] of Object.entries(limits)) {
      const record = records.find((r) => r.feature === feature);
      result[feature] = { used: record?.count ?? 0, limit: limit === -1 ? Infinity : limit };
    }

    return result;
  }

  private currentPeriodStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  private currentPeriodEnd(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  }
}
