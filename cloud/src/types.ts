/**
 * Shared Hono type definitions for authenticated context.
 * Resolves the c.get('userId') / c.get('tier') type errors
 * caused by Hono's strict generic context typing.
 */
import type { Context } from 'hono';

export interface AuthVariables {
  userId: string;
  tier: string;
  deviceId?: string;
  /** Admin role (USER | ADMIN | SUPER_ADMIN) — only set after adminMiddleware runs */
  role?: string;
}

/** Authenticated Hono context — use in protected route handlers */
export type AuthContext = Context<{ Variables: AuthVariables }>;

/**
 * Shorthand for `Hono<{ Variables: AuthVariables }>` — use to type a controller
 * factory so c.get('userId') / c.get('tier') / c.get('role') resolve without
 * casts. Every protected-route controller should `new Hono<AuthEnv>()`.
 */
export type AuthEnv = { Variables: AuthVariables };
