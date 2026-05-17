import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { prisma } from '../db.js';
import { getAgentEventStore } from './AgentEventStore.js';
import { getGuardian } from './GuardianAgent.js';
import { maybeAgentRegistry } from './AgentRegistry.js';
import { logger } from '../observability/logger.js';

// ── Consumer surface for active agents ──────────────────────────────────────
// Mounted under /intelligence/agents + /intelligence/inbox by the
// IntelligenceController. Always JWT-authed; tenant-scoped views for IaaS
// callers go under /v1/agents/* in a later milestone (ADR-0012 §7).

type AuthVars = { Variables: { userId: string; tier?: string; deviceId?: string } };

const feedbackSchema = z.object({ feedback: z.enum(['useful', 'not_useful']) });
const pauseSchema = z.object({ reason: z.string().max(120).optional() });

export function createAgentRoutes(): Hono<AuthVars> {
  const app = new Hono<AuthVars>();
  app.use('*', authMiddleware);

  // ── GET /agents — list all registered agents + this user's subscription state.
  app.get('/agents', async (c) => {
    const userId = c.get('userId');
    const registry = maybeAgentRegistry();
    if (!registry) {
      return c.json({ enabled: false, agents: [] });
    }

    const subs = await prisma.agentSubscription.findMany({
      where: { userId },
      select: {
        agent: true,
        enabled: true,
        pausedAt: true,
        pausedReason: true,
        lastRunAt: true,
        lastEmittedAt: true,
      },
    });
    const subByName = new Map(subs.map((s) => [s.agent, s]));

    const agents = registry.all().map((a) => {
      const sub = subByName.get(a.name);
      return {
        name: a.name,
        displayName: a.displayName,
        triggers: a.triggers,
        enabled: sub?.enabled ?? true, // default-on
        paused: !!sub?.pausedAt,
        pausedReason: sub?.pausedReason ?? null,
        lastRunAt: sub?.lastRunAt ?? null,
        lastEmittedAt: sub?.lastEmittedAt ?? null,
      };
    });

    return c.json({ enabled: true, agents });
  });

  // ── POST /agents/:name/pause — soft-pause an agent for this user.
  app.post('/agents/:name/pause', async (c) => {
    const userId = c.get('userId');
    const name = c.req.param('name');
    const registry = maybeAgentRegistry();
    if (!registry?.byName(name)) return c.json({ error: 'unknown_agent' }, 404);

    const body = pauseSchema.safeParse(await c.req.json().catch(() => ({})));
    const reason = body.success ? (body.data.reason ?? 'user_paused') : 'user_paused';
    await getGuardian().pause(userId, name, reason);
    return c.json({ ok: true, agent: name, paused: true, reason });
  });

  // ── POST /agents/:name/resume — resume after a pause.
  app.post('/agents/:name/resume', async (c) => {
    const userId = c.get('userId');
    const name = c.req.param('name');
    const registry = maybeAgentRegistry();
    if (!registry?.byName(name)) return c.json({ error: 'unknown_agent' }, 404);

    await getGuardian().resume(userId, name);
    return c.json({ ok: true, agent: name, paused: false });
  });

  // ── GET /inbox — surfaced agent events for this user.
  app.get('/inbox', async (c) => {
    const userId = c.get('userId');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '30', 10) || 30, 100);
    const onlyUnseen = c.req.query('unseen') === '1';
    const since = c.req.query('since') ? new Date(c.req.query('since')!) : undefined;
    const events = await getAgentEventStore().listForUser(userId, { limit, since, onlyUnseen });
    return c.json({ events });
  });

  // ── POST /inbox/:id/seen — mark an event seen (idempotent).
  app.post('/inbox/:id/seen', async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    await getAgentEventStore().markSeen(userId, id);
    return c.json({ ok: true });
  });

  // ── POST /inbox/:id/feedback — useful / not_useful rating.
  app.post('/inbox/:id/feedback', async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const body = feedbackSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'invalid_feedback', details: body.error.flatten() }, 400);
    }
    await getAgentEventStore().recordFeedback(userId, id, body.data.feedback);
    logger.info({ userId, id, feedback: body.data.feedback }, 'agent event feedback');
    return c.json({ ok: true });
  });

  return app;
}
