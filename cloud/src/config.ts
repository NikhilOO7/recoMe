import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().optional(), // Supabase direct connection (for Prisma migrations)

  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRO_PRICE_ID: z.string().optional(),
  STRIPE_PREMIUM_PRICE_ID: z.string().optional(),

  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGINS: z.string().default('chrome-extension://,http://localhost:*'),

  // ── Intelligence stack (ADR-0001) ──────────────────────────────────────────
  INTELLIGENCE_ENABLED: z.coerce.boolean().default(false),
  INTELLIGENCE_RUN_MIGRATIONS_ON_BOOT: z.coerce.boolean().default(false),
  /** Active agents (ADR-0012). Off by default — dark deploy → opt-in. */
  INTELLIGENCE_AGENTS_ENABLED: z.coerce.boolean().default(false),

  NEO4J_URI: z.string().optional(),
  NEO4J_USERNAME: z.string().optional(),
  NEO4J_PASSWORD: z.string().optional(),
  NEO4J_DATABASE: z.string().default('neo4j'),

  QDRANT_URL: z.string().optional(),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION: z.string().default('recome_v1'),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
});

export type Config = z.infer<typeof envSchema>;

let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
      throw new Error('Invalid environment configuration');
    }
    _config = result.data;
  }
  return _config;
}
