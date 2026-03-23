import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { TokenService } from './TokenService.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceFingerprint: z.string().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export function createAuthRoutes(): Hono {
  const app = new Hono();
  const tokenService = new TokenService();

  // POST /auth/register
  app.post('/register', async (c) => {
    const body = registerSchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ error: 'Invalid input', details: body.error.flatten() }, 400);
    }

    const { email, password, displayName } = body.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return c.json({ error: 'Email already registered' }, 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName },
    });

    const tokens = await tokenService.issueTokens(user.id, user.tier);
    return c.json(
      {
        user: { id: user.id, email: user.email, displayName: user.displayName, tier: user.tier },
        ...tokens,
      },
      201,
    );
  });

  // POST /auth/login
  app.post('/login', async (c) => {
    const body = loginSchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ error: 'Invalid input' }, 400);
    }

    const { email, password } = body.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const tokens = await tokenService.issueTokens(user.id, user.tier);

    // Update last sync
    await prisma.user.update({ where: { id: user.id }, data: { lastSyncAt: new Date() } });

    return c.json({
      user: { id: user.id, email: user.email, displayName: user.displayName, tier: user.tier },
      ...tokens,
    });
  });

  // POST /auth/refresh
  app.post('/refresh', async (c) => {
    const body = refreshSchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ error: 'Invalid input' }, 400);
    }

    const result = await tokenService.rotateRefreshToken(body.data.refreshToken);
    if (!result) {
      return c.json({ error: 'Invalid or expired refresh token' }, 401);
    }

    return c.json(result);
  });

  // POST /auth/logout
  app.post('/logout', async (c) => {
    const userId = c.get('userId') as string | undefined;
    if (userId) {
      await tokenService.revokeAllTokens(userId);
    }
    return c.json({ ok: true });
  });

  return app;
}
