import type { Context, Next } from 'hono';
import { prisma } from '../db.js';
import { TokenService } from '../auth/TokenService.js';

const tokenService = new TokenService();

/**
 * Admin middleware — validates Bearer token AND checks user has ADMIN or SUPER_ADMIN role.
 * Returns 401 if not authenticated, 403 if not admin.
 */
export async function adminMiddleware(c: Context, next: Next): Promise<Response | void> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  const payload = tokenService.verifyAccessToken(token);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  // Check admin role in database
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, email: true },
  });

  if (!user) {
    return c.json({ error: 'User not found' }, 401);
  }

  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    return c.json({ error: 'Insufficient permissions' }, 403);
  }

  c.set('userId', user.id);
  c.set('role', user.role);
  c.set('tier', payload.tier);

  await next();
}
