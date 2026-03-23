import Stripe from 'stripe';
import { prisma } from '../db.js';
import { getConfig } from '../config.js';
import type { Tier } from '@prisma/client';

const TIER_PRICE_MAP: Record<string, 'STRIPE_PRO_PRICE_ID' | 'STRIPE_PREMIUM_PRICE_ID'> = {
  PRO: 'STRIPE_PRO_PRICE_ID',
  PREMIUM: 'STRIPE_PREMIUM_PRICE_ID',
};

export class StripeService {
  private stripe: Stripe | null = null;

  private getStripe(): Stripe | null {
    if (this.stripe) return this.stripe;
    const config = getConfig();
    if (!config.STRIPE_SECRET_KEY) return null;
    this.stripe = new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });
    return this.stripe;
  }

  /** Create Stripe Checkout session for upgrade */
  async createCheckoutSession(
    userId: string,
    tier: 'PRO' | 'PREMIUM',
    successUrl: string,
    cancelUrl: string,
  ): Promise<{ url: string | null; id: string } | null> {
    const stripe = this.getStripe();
    if (!stripe) return null;

    const config = getConfig();
    const priceId = config[TIER_PRICE_MAP[tier]!];
    if (!priceId) return null;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    // Get or create Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId, tier },
    });

    return { url: session.url, id: session.id };
  }

  /** Create Stripe Customer Portal session */
  async createPortalSession(userId: string, returnUrl: string): Promise<{ url: string } | null> {
    const stripe = this.getStripe();
    if (!stripe) return null;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.stripeCustomerId) return null;

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  /** Get subscription status */
  async getSubscriptionStatus(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return {
      tier: user?.tier ?? 'FREE',
      stripeCustomerId: user?.stripeCustomerId ?? null,
      hasSubscription: !!user?.stripeSubscriptionId,
    };
  }

  /** Handle Stripe webhooks */
  async handleWebhook(
    rawBody: string,
    signature: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const stripe = this.getStripe();
    const config = getConfig();
    if (!stripe || !config.STRIPE_WEBHOOK_SECRET) {
      return { ok: false, error: 'Stripe not configured' };
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return { ok: false, error: 'Invalid signature' };
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.handleCheckoutComplete(session);
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        await this.handleSubscriptionUpdate(sub);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await this.handleSubscriptionDeleted(sub);
        break;
      }
    }

    // Log billing event
    const userId = this.extractUserId(event);
    if (userId) {
      await prisma.billingEvent.create({
        data: {
          userId,
          eventType: event.type,
          stripeEventId: event.id,
          metadata: event.data.object as unknown as Record<string, unknown>,
        },
      });
    }

    return { ok: true };
  }

  private async handleCheckoutComplete(session: Stripe.Checkout.Session): Promise<void> {
    const userId = session.metadata?.userId;
    const tier = session.metadata?.tier as Tier | undefined;
    if (!userId || !tier) return;

    await prisma.user.update({
      where: { id: userId },
      data: {
        tier,
        stripeSubscriptionId: session.subscription as string,
      },
    });
  }

  private async handleSubscriptionUpdate(sub: Stripe.Subscription): Promise<void> {
    const user = await prisma.user.findFirst({
      where: { stripeSubscriptionId: sub.id },
    });
    if (!user) return;

    // If subscription is active, keep tier. If past_due/unpaid, could downgrade.
    if (sub.status === 'past_due' || sub.status === 'unpaid') {
      // Grace period — don't downgrade immediately
      return;
    }
    if (sub.status === 'canceled') {
      await prisma.user.update({
        where: { id: user.id },
        data: { tier: 'FREE', stripeSubscriptionId: null },
      });
    }
  }

  private async handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
    const user = await prisma.user.findFirst({
      where: { stripeSubscriptionId: sub.id },
    });
    if (!user) return;

    await prisma.user.update({
      where: { id: user.id },
      data: { tier: 'FREE', stripeSubscriptionId: null },
    });
  }

  private extractUserId(event: Stripe.Event): string | null {
    const obj = event.data.object as Record<string, unknown>;
    if (typeof obj.metadata === 'object' && obj.metadata && 'userId' in obj.metadata) {
      return (obj.metadata as Record<string, string>).userId ?? null;
    }
    return null;
  }
}
