import { Hono } from 'hono';
import { z } from 'zod';
import { StripeService } from './StripeService.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const checkoutSchema = z.object({
  tier: z.enum(['PRO', 'PREMIUM']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

export function createBillingRoutes(): Hono {
  const app = new Hono();
  const stripe = new StripeService();

  // Webhook route — no auth middleware (Stripe calls this)
  app.post('/webhook', async (c) => {
    const sig = c.req.header('stripe-signature');
    if (!sig) return c.json({ error: 'Missing signature' }, 400);

    const rawBody = await c.req.text();
    const result = await stripe.handleWebhook(rawBody, sig);

    if (!result.ok) {
      return c.json({ error: result.error }, 400);
    }
    return c.json({ received: true });
  });

  // Protected routes
  app.use('*', authMiddleware);

  // POST /billing/checkout — create checkout session
  app.post('/checkout', async (c) => {
    const userId = c.get('userId') as string;
    const body = checkoutSchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ error: 'Invalid input' }, 400);
    }

    const session = await stripe.createCheckoutSession(
      userId,
      body.data.tier,
      body.data.successUrl,
      body.data.cancelUrl,
    );

    if (!session) {
      return c.json({ error: 'Failed to create checkout session' }, 500);
    }

    return c.json({ url: session.url, sessionId: session.id });
  });

  // POST /billing/portal — create customer portal session
  app.post('/portal', async (c) => {
    const userId = c.get('userId') as string;
    const body = await c.req.json<{ returnUrl: string }>();
    const session = await stripe.createPortalSession(userId, body.returnUrl);

    if (!session) {
      return c.json({ error: 'No billing account found' }, 404);
    }

    return c.json({ url: session.url });
  });

  // GET /billing/status — get current subscription status
  app.get('/status', async (c) => {
    const userId = c.get('userId') as string;
    const status = await stripe.getSubscriptionStatus(userId);
    return c.json(status);
  });

  return app;
}
