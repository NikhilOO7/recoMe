import webpush, { type PushSubscription as WebPushSubscription } from 'web-push';
import { prisma } from '../db.js';
import { getConfig } from '../config.js';
import { logger } from '../observability/logger.js';

/**
 * PushService — VAPID-authed web-push delivery (P4.3).
 *
 * One row per (user, endpoint) in Prisma. AgentEventStore.insert calls
 * `notifyUser` after every successful emission; we fan out to every active
 * subscription. Disabled rows are skipped, and a 410 GONE / 404 from the
 * push provider marks the row disabled so the next emission stops trying.
 *
 * Failure isolation: a per-subscription send failure logs at warn and the
 * loop continues. We never throw back into the agent runner — push is
 * best-effort by spec (browsers will redeliver on next online, but they
 * don't guarantee anything).
 *
 * Payload size limit: the web-push wire format caps payloads at ~4 KB.
 * We only send title + body + actionUrl + a few IDs, well under that.
 *
 * The service is gated on VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY being set.
 * Without them, all operations no-op (logged at info on first call) so
 * dev environments without VAPID keys keep working.
 */

export interface PushPayload {
  title: string;
  body?: string;
  /** Internal route or external URL the SW opens on click. */
  url?: string;
  /** AgentEvent id, surfaced so the SW can mark seen on click. */
  eventId?: string;
  /** Agent name — drives the icon / accent in the notification. */
  agent?: string;
}

export interface SubscribeInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

export class PushService {
  private configured = false;
  private warned = false;

  private ensureConfigured(): boolean {
    if (this.configured) return true;
    const cfg = getConfig();
    if (!cfg.VAPID_PUBLIC_KEY || !cfg.VAPID_PRIVATE_KEY) {
      if (!this.warned) {
        logger.info('PushService: VAPID keys unset, all push operations are no-ops');
        this.warned = true;
      }
      return false;
    }
    webpush.setVapidDetails(cfg.VAPID_CONTACT, cfg.VAPID_PUBLIC_KEY, cfg.VAPID_PRIVATE_KEY);
    this.configured = true;
    return true;
  }

  /** True when the service has VAPID keys and will attempt deliveries. */
  isEnabled(): boolean {
    const cfg = getConfig();
    return !!(cfg.VAPID_PUBLIC_KEY && cfg.VAPID_PRIVATE_KEY);
  }

  getVapidPublicKey(): string | null {
    return getConfig().VAPID_PUBLIC_KEY ?? null;
  }

  /** Upsert a subscription. Endpoint is the unique key. */
  async subscribe(userId: string, input: SubscribeInput): Promise<{ id: string }> {
    const row = await prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      update: {
        userId,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
        disabledAt: null,
      },
      create: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
      },
      select: { id: true },
    });
    logger.info({ userId, endpoint: maskEndpoint(input.endpoint) }, 'push subscription stored');
    return row;
  }

  async unsubscribe(userId: string, endpoint: string): Promise<boolean> {
    // Scope by userId so a forged endpoint from another user can't drop a
    // row that doesn't belong to them.
    const res = await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
    return res.count > 0;
  }

  async listForUser(userId: string) {
    return prisma.pushSubscription.findMany({
      where: { userId },
      select: {
        id: true,
        endpoint: true,
        userAgent: true,
        disabledAt: true,
        lastDeliveredAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Send one payload to every active subscription for a user. Best-effort.
   * Returns the count of successful deliveries (the rest were either
   * disabled or hit a transport error).
   */
  async notifyUser(userId: string, payload: PushPayload): Promise<number> {
    if (!this.ensureConfigured()) return 0;
    const subs = await prisma.pushSubscription.findMany({
      where: { userId, disabledAt: null },
    });
    if (subs.length === 0) return 0;

    const body = JSON.stringify(payload);
    let ok = 0;
    for (const sub of subs) {
      try {
        const target: WebPushSubscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        };
        await webpush.sendNotification(target, body, { TTL: 24 * 60 * 60 });
        ok++;
        await prisma.pushSubscription
          .update({ where: { id: sub.id }, data: { lastDeliveredAt: new Date() } })
          .catch(() => {
            /* delivery succeeded, the audit-update did not — acceptable */
          });
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription is permanently invalid (user unsubscribed, browser
          // re-registered with a new endpoint, etc.). Disable so we stop
          // trying — keep the row so the UI can show "expired" instead of
          // silently dropping it.
          await prisma.pushSubscription
            .update({ where: { id: sub.id }, data: { disabledAt: new Date() } })
            .catch(() => {
              /* nothing actionable */
            });
          logger.info(
            { userId, endpoint: maskEndpoint(sub.endpoint), statusCode },
            'push subscription disabled (provider gone)',
          );
        } else {
          logger.warn(
            { userId, endpoint: maskEndpoint(sub.endpoint), err, statusCode },
            'push delivery failed',
          );
        }
      }
    }
    return ok;
  }
}

/** Endpoints are long URLs from the push provider — show the host + 8-char suffix only. */
function maskEndpoint(endpoint: string): string {
  try {
    const u = new URL(endpoint);
    return `${u.host}/…${endpoint.slice(-8)}`;
  } catch {
    return endpoint.slice(0, 24) + '…';
  }
}

let svc: PushService | null = null;
export function getPushService(): PushService {
  if (!svc) svc = new PushService();
  return svc;
}
