import type { Context, Next } from 'hono';
import { TokenService } from '../auth/TokenService.js';

const tokenService = new TokenService();

/**
 * Auth middleware — validates Bearer token and sets userId + tier on context.
 * Skips auth for public routes.
 */
export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  const payload = tokenService.verifyAccessToken(token);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  c.set('userId', payload.sub);
  c.set('tier', payload.tier);
  c.set('deviceId', payload.deviceId);

  await next();
}
