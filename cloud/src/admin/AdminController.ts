import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../db.js';
import { adminMiddleware } from '../middleware/adminMiddleware.js';

export function createAdminRoutes(): Hono {
  const app = new Hono();

  // All admin routes require admin role
  app.use('*', adminMiddleware);

  // ── Dashboard Stats ────────────────────────────────────────────────────

  app.get('/stats', async (c) => {
    const [
      totalUsers,
      activeToday,
      totalSyncStates,
      totalDevices,
      totalErrors,
      totalDeployments,
      totalFlags,
      tierCounts,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: { updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
      prisma.syncState.count(),
      prisma.device.count(),
      prisma.errorLog.count(),
      prisma.deployment.count(),
      prisma.featureFlag.count(),
      prisma.user.groupBy({ by: ['tier'], _count: true }),
    ]);

    return c.json({
      users: { total: totalUsers, activeToday },
      sync: { totalStates: totalSyncStates, devices: totalDevices },
      errors: { total: totalErrors },
      deployments: { total: totalDeployments },
      featureFlags: { total: totalFlags },
      tiers: Object.fromEntries(tierCounts.map((t) => [t.tier, t._count])),
    });
  });

  // ── Users Management ───────────────────────────────────────────────────

  app.get('/users', async (c) => {
    const page = parseInt(c.req.query('page') ?? '0');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 100);
    const search = c.req.query('search') ?? '';

    const where = search
      ? { OR: [{ email: { contains: search } }, { displayName: { contains: search } }] }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: where as never,
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          role: true,
          tier: true,
          createdAt: true,
          updatedAt: true,
          lastSyncAt: true,
          googleId: true,
          githubId: true,
          facebookId: true,
          _count: { select: { syncStates: true, devices: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: page * limit,
        take: limit,
      }),
      prisma.user.count({ where: where as never }),
    ]);

    return c.json({ users, total, page, limit });
  });

  app.patch('/users/:id/role', async (c) => {
    const id = c.req.param('id');
    const body = z
      .object({ role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN']) })
      .parse(await c.req.json());

    const adminRole = c.get('role') as string;
    // Only SUPER_ADMIN can promote to ADMIN/SUPER_ADMIN
    if (body.role !== 'USER' && adminRole !== 'SUPER_ADMIN') {
      return c.json({ error: 'Only SUPER_ADMIN can promote users' }, 403);
    }

    const user = await prisma.user.update({
      where: { id },
      data: { role: body.role },
      select: { id: true, email: true, role: true },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        adminId: c.get('userId') as string,
        action: 'user.role.update',
        resourceType: 'user',
        resourceId: id,
        details: { newRole: body.role },
      },
    });

    return c.json(user);
  });

  app.patch('/users/:id/tier', async (c) => {
    const id = c.req.param('id');
    const body = z.object({ tier: z.enum(['FREE', 'PRO', 'PREMIUM']) }).parse(await c.req.json());

    const user = await prisma.user.update({
      where: { id },
      data: { tier: body.tier },
      select: { id: true, email: true, tier: true },
    });

    await prisma.auditLog.create({
      data: {
        adminId: c.get('userId') as string,
        action: 'user.tier.update',
        resourceType: 'user',
        resourceId: id,
        details: { newTier: body.tier },
      },
    });

    return c.json(user);
  });

  app.delete('/users/:id', async (c) => {
    const id = c.req.param('id');
    await prisma.user.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        adminId: c.get('userId') as string,
        action: 'user.delete',
        resourceType: 'user',
        resourceId: id,
      },
    });

    return c.json({ ok: true });
  });

  // ── Feature Flags ──────────────────────────────────────────────────────

  app.get('/flags', async (c) => {
    const flags = await prisma.featureFlag.findMany({ orderBy: { createdAt: 'desc' } });
    return c.json(flags);
  });

  app.post('/flags', async (c) => {
    const body = z
      .object({
        key: z.string().min(1).max(100),
        name: z.string().min(1).max(200),
        description: z.string().optional(),
        enabled: z.boolean().default(false),
        rolloutPercent: z.number().min(0).max(100).default(0),
        app: z.enum(['EXTENSION', 'WEB', 'CLOUD', 'MOBILE', 'SDK', 'AGENTS']).default('EXTENSION'),
      })
      .parse(await c.req.json());

    const flag = await prisma.featureFlag.create({
      data: { ...body, createdBy: c.get('userId') as string },
    });

    await prisma.auditLog.create({
      data: {
        adminId: c.get('userId') as string,
        action: 'feature_flag.create',
        resourceType: 'feature_flag',
        resourceId: flag.id,
        details: body,
      },
    });

    return c.json(flag, 201);
  });

  app.patch('/flags/:id', async (c) => {
    const id = c.req.param('id');
    const body = z
      .object({
        enabled: z.boolean().optional(),
        rolloutPercent: z.number().min(0).max(100).optional(),
        targetTiers: z.array(z.string()).optional(),
        targetUsers: z.array(z.string()).optional(),
        description: z.string().optional(),
      })
      .parse(await c.req.json());

    const flag = await prisma.featureFlag.update({ where: { id }, data: body });

    await prisma.auditLog.create({
      data: {
        adminId: c.get('userId') as string,
        action: 'feature_flag.update',
        resourceType: 'feature_flag',
        resourceId: id,
        details: body,
      },
    });

    return c.json(flag);
  });

  app.delete('/flags/:id', async (c) => {
    const id = c.req.param('id');
    await prisma.featureFlag.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        adminId: c.get('userId') as string,
        action: 'feature_flag.delete',
        resourceType: 'feature_flag',
        resourceId: id,
      },
    });

    return c.json({ ok: true });
  });

  // ── Error Logs ─────────────────────────────────────────────────────────

  app.get('/errors', async (c) => {
    const page = parseInt(c.req.query('page') ?? '0');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 100);
    const source = c.req.query('source');

    const where = source ? { source: source as never } : {};

    const [errors, total] = await Promise.all([
      prisma.errorLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page * limit,
        take: limit,
      }),
      prisma.errorLog.count({ where }),
    ]);

    return c.json({ errors, total, page, limit });
  });

  app.post('/errors', async (c) => {
    // Public-ish — extensions can report errors (but still needs auth)
    const body = z
      .object({
        source: z.enum(['EXTENSION', 'WEB', 'CLOUD', 'MOBILE', 'SDK', 'AGENTS']),
        level: z.enum(['error', 'warn', 'info']).default('error'),
        message: z.string().min(1).max(2000),
        stack: z.string().max(5000).optional(),
        metadata: z.record(z.unknown()).optional(),
      })
      .parse(await c.req.json());

    const error = await prisma.errorLog.create({
      data: { ...body, userId: c.get('userId') as string | undefined },
    });

    return c.json(error, 201);
  });

  // ── Deployments ────────────────────────────────────────────────────────

  app.get('/deployments', async (c) => {
    const app_filter = c.req.query('app');
    const where = app_filter ? { app: app_filter as never } : {};

    const deployments = await prisma.deployment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return c.json(deployments);
  });

  app.post('/deployments', async (c) => {
    const body = z
      .object({
        app: z.enum(['EXTENSION', 'WEB', 'CLOUD', 'MOBILE', 'SDK', 'AGENTS']),
        version: z.string().min(1),
        environment: z.enum(['DEVELOPMENT', 'STAGING', 'PRODUCTION']).default('PRODUCTION'),
        commitSha: z.string().optional(),
        notes: z.string().optional(),
        deployUrl: z.string().optional(),
      })
      .parse(await c.req.json());

    const deployment = await prisma.deployment.create({
      data: { ...body, triggeredBy: c.get('userId') as string, status: 'PENDING' },
    });

    await prisma.auditLog.create({
      data: {
        adminId: c.get('userId') as string,
        action: 'deployment.create',
        resourceType: 'deployment',
        resourceId: deployment.id,
        details: body,
      },
    });

    return c.json(deployment, 201);
  });

  app.patch('/deployments/:id', async (c) => {
    const id = c.req.param('id');
    const body = z
      .object({
        status: z
          .enum(['PENDING', 'BUILDING', 'DEPLOYING', 'SUCCESS', 'FAILED', 'ROLLED_BACK'])
          .optional(),
        buildLog: z.string().optional(),
        deployUrl: z.string().optional(),
        completedAt: z.string().datetime().optional(),
      })
      .parse(await c.req.json());

    const deployment = await prisma.deployment.update({
      where: { id },
      data: {
        ...body,
        completedAt: body.completedAt ? new Date(body.completedAt) : undefined,
      },
    });

    return c.json(deployment);
  });

  // ── App Configuration ──────────────────────────────────────────────────

  app.get('/config', async (c) => {
    const app_filter = c.req.query('app');
    const where = app_filter ? { app: app_filter as never } : {};
    const configs = await prisma.appConfig.findMany({ where, orderBy: { key: 'asc' } });
    return c.json(configs);
  });

  app.put('/config', async (c) => {
    const body = z
      .object({
        app: z.enum(['EXTENSION', 'WEB', 'CLOUD', 'MOBILE', 'SDK', 'AGENTS']),
        key: z.string().min(1).max(100),
        value: z.string(),
        valueType: z.enum(['string', 'number', 'boolean', 'json']).default('string'),
        description: z.string().optional(),
      })
      .parse(await c.req.json());

    const config = await prisma.appConfig.upsert({
      where: { app_key: { app: body.app, key: body.key } },
      update: {
        value: body.value,
        valueType: body.valueType,
        description: body.description,
        updatedBy: c.get('userId') as string,
      },
      create: { ...body, updatedBy: c.get('userId') as string },
    });

    await prisma.auditLog.create({
      data: {
        adminId: c.get('userId') as string,
        action: 'config.update',
        resourceType: 'app_config',
        resourceId: config.id,
        details: body,
      },
    });

    return c.json(config);
  });

  // ── Audit Logs ─────────────────────────────────────────────────────────

  app.get('/audit', async (c) => {
    const page = parseInt(c.req.query('page') ?? '0');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 100);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: page * limit,
        take: limit,
      }),
      prisma.auditLog.count(),
    ]);

    return c.json({ logs, total, page, limit });
  });

  return app;
}
