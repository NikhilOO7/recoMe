import { Hono } from 'hono';
import type { AuthEnv } from '../types.js';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { TokenService } from './TokenService.js';
import {
  getAuthorizationUrl,
  handleOAuthCallback,
  findOrCreateOAuthUser,
  isProviderConfigured,
} from './OAuthService.js';

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

export function createAuthRoutes(): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
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

  // ── OAuth Routes ────────────────────────────────────────────────────────

  const SUPPORTED_PROVIDERS = ['google', 'github', 'facebook'] as const;

  // GET /auth/:provider — redirect to OAuth provider
  app.get('/:provider', async (c) => {
    const provider = c.req.param('provider');
    if (!SUPPORTED_PROVIDERS.includes(provider as (typeof SUPPORTED_PROVIDERS)[number])) {
      return c.json({ error: 'Unsupported provider' }, 400);
    }

    if (!isProviderConfigured(provider)) {
      return c.json({ error: `${provider} OAuth is not configured` }, 501);
    }

    // Build redirect URI — use X-Forwarded-Proto to get correct scheme behind reverse proxy
    const proto = c.req.header('x-forwarded-proto') ?? 'https';
    const host = c.req.header('host') ?? 'recome-api.fly.dev';
    const redirectUri = `${proto}://${host}/auth/${provider}/callback`;

    // State carries the client's return URL for after auth completes
    const returnUrl = c.req.query('return_url') ?? '';
    const extId = c.req.query('ext_id') ?? '';
    const state = Buffer.from(JSON.stringify({ returnUrl, extId })).toString('base64url');

    const authUrl = getAuthorizationUrl(provider, redirectUri, state);
    if (!authUrl) {
      return c.json({ error: 'Failed to generate auth URL' }, 500);
    }

    return c.redirect(authUrl);
  });

  // GET /auth/:provider/callback — handle OAuth callback
  app.get('/:provider/callback', async (c) => {
    const provider = c.req.param('provider');
    if (!SUPPORTED_PROVIDERS.includes(provider as (typeof SUPPORTED_PROVIDERS)[number])) {
      return c.json({ error: 'Unsupported provider' }, 400);
    }

    const code = c.req.query('code');
    const stateParam = c.req.query('state') ?? '';

    if (!code) {
      const error = c.req.query('error') ?? 'no_code';
      return c.json({ error: `OAuth failed: ${error}` }, 400);
    }

    // Decode state
    let returnUrl = '';
    let extId = '';
    try {
      const decoded = JSON.parse(Buffer.from(stateParam, 'base64url').toString());
      returnUrl = decoded.returnUrl ?? '';
      extId = decoded.extId ?? '';
    } catch {
      // State is optional — continue without it
    }

    // Must match exactly what was sent in the initial auth request
    const proto = c.req.header('x-forwarded-proto') ?? 'https';
    const host = c.req.header('host') ?? 'recome-api.fly.dev';
    const redirectUri = `${proto}://${host}/auth/${provider}/callback`;
    const profile = await handleOAuthCallback(provider, code, redirectUri);
    if (!profile) {
      return c.json({ error: 'Failed to authenticate with provider' }, 401);
    }

    // Find or create user
    const user = await findOrCreateOAuthUser(profile);

    // Issue tokens
    const tokens = await tokenService.issueTokens(user.id, user.tier);

    // If coming from extension, redirect back with tokens
    if (extId) {
      const callbackUrl = `chrome-extension://${extId}/callback.html?token=${tokens.accessToken}&refresh=${tokens.refreshToken}`;
      return c.redirect(callbackUrl);
    }

    // If return URL provided (web app), redirect with tokens
    if (returnUrl) {
      const separator = returnUrl.includes('?') ? '&' : '?';
      return c.redirect(
        `${returnUrl}${separator}token=${tokens.accessToken}&refresh=${tokens.refreshToken}`,
      );
    }

    // Default: return JSON (for API clients)
    return c.json({
      user: {
        id: user.id,
        email: user.email,
        tier: user.tier,
        isNew: user.isNew,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  });

  // GET /auth/providers — list configured providers
  app.get('/providers/list', async (c) => {
    const configured = SUPPORTED_PROVIDERS.filter((p) => isProviderConfigured(p));
    return c.json({ providers: configured });
  });

  return app;
}
