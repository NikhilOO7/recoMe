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
}

/** Authenticated Hono context — use in protected route handlers */
export type AuthContext = Context<{ Variables: AuthVariables }>;
