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

  // Stripe Meters (P4.1) — per-metric event names for usage-based IaaS billing.
  // Daily rollup worker (cloud/src/billing/StripeMetersService.ts) skips a
  // metric when its ID is unset, so meters can roll out one at a time.
  STRIPE_METER_SIGNALS_ID: z.string().optional(),
  STRIPE_METER_QUERIES_ID: z.string().optional(),
  STRIPE_METER_EMBEDDINGS_ID: z.string().optional(),

  // ── PWA push (P4.3, VAPID) ─────────────────────────────────────────────────
  // Generate once with `npx web-push generate-vapid-keys` and put both into
  // Fly secrets. The public key is also exposed via GET
  // /notifications/push/vapid-public-key so the web client can register a
  // subscription without hardcoding it. CONTACT must be a mailto: that the
  // push provider can reach on delivery problems (Apple, Mozilla, Google
  // enforce this in production).
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_CONTACT: z.string().default('mailto:hello@recome.app'),

  // ── Email (P4.4, Resend) ───────────────────────────────────────────────────
  // Weekly digest of unseen AgentEvents. Off by default — the worker no-ops
  // without an API key, so dev / preview deploys don't accidentally email
  // anyone. RESEND_FROM must be a verified sender on the Resend account.
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().default('Recome <digest@recome.app>'),

  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGINS: z.string().default('chrome-extension://,http://localhost:*'),

  // ── Intelligence stack (ADR-0001) ──────────────────────────────────────────
  INTELLIGENCE_ENABLED: z.coerce.boolean().default(false),
  INTELLIGENCE_RUN_MIGRATIONS_ON_BOOT: z.coerce.boolean().default(false),
  /** Active agents (ADR-0012). Off by default — dark deploy → opt-in. */
  INTELLIGENCE_AGENTS_ENABLED: z.coerce.boolean().default(false),
  /**
   * BullMQ scheduled-tick workers for Curator (daily) + Concierge (4×/day
   * watchlist sweep). Requires REDIS_URL. Off by default — turn on only
   * when one (and only one) instance per fleet should own scheduling,
   * to avoid duplicate ticks across machines (BullMQ dedupes on job key
   * but multiple registrants on boot still race).
   */
  AGENT_WORKERS_ENABLED: z.coerce.boolean().default(false),
  REDIS_URL: z.string().optional(),

  NEO4J_URI: z.string().optional(),
  NEO4J_USERNAME: z.string().optional(),
  NEO4J_PASSWORD: z.string().optional(),
  NEO4J_DATABASE: z.string().default('neo4j'),

  QDRANT_URL: z.string().optional(),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION: z.string().default('recome_v1'),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

  // CardScorer — opt-in LLM polish for /intelligence/score/cards reasoning.
  // Off by default so dev/test doesn't accidentally rack up LLM spend.
  // Set true + OPENAI_API_KEY to enable; falls back to deterministic scoring
  // on any LLM failure (see cloud/src/intelligence/CardScorer.ts).
  CARDSCORER_LLM_ENABLED: z.coerce.boolean().default(false),
  CARDSCORER_LLM_MODEL: z.string().default('gpt-4o-mini'),

  // ── Concierge price vendor (ADR-0017) ──────────────────────────────────────
  // Vendor selector: stub | keepa. RainforestAPI + PA-API are v1.2.
  //   - stub  : deterministic test prices. Required explicitly to run in prod
  //             (ConciergeAgent.priceVendorBlockedInProd refuses unset stub).
  //   - keepa : real Amazon prices via keepa.com. Requires KEEPA_API_KEY.
  // Telemetry plan + decision criteria documented in ADR-0017 §5.
  INTELLIGENCE_AGENTS_PRICE_VENDOR: z.enum(['stub', 'keepa']).optional(),
  KEEPA_API_KEY: z.string().optional(),

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
