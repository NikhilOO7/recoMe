import { z } from 'zod';

// ── Shared Zod schemas ───────────────────────────────────────────────────────
// Used by /intelligence (consumer, user-auth) AND /v1 (IaaS, key-auth).
// Single source of truth so the two surfaces cannot drift in validation shape.

// Contract law (docs/PRODUCT.md §3): this enum MUST be a superset of the
// client Platform union in extension/src/shared/types.ts — a platform the
// client can emit but the cloud rejects silently loses signals.
export const platformEnum = z.enum([
  'youtube',
  'reddit',
  'amazon',
  'walmart',
  'ebay',
  'twitter',
  'facebook',
  'instagram',
  'tiktok',
  'linkedin',
  'indeed',
  'glassdoor',
  'udemy',
  'coursera',
  'edx',
  'generic',
  'unknown',
]);

export const signalKindEnum = z.enum([
  'view',
  'dwell',
  'like',
  'block',
  'boost',
  'purchase',
  'comparison',
  'search',
]);

export const entityKindEnum = z.enum([
  'product',
  'brand',
  'creator',
  'category',
  'media',
  'place',
  'person',
]);

export const signalSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  kind: signalKindEnum,
  ts: z.number().int().positive().optional(),
  weight: z.number().min(0).max(100).optional(),
  pageUrl: z.string().url().optional(),
  pageTitle: z.string().max(500).optional(),
  platform: platformEnum.optional(),
  topics: z
    .array(z.object({ name: z.string().min(1).max(120) }))
    .max(20)
    .optional(),
  entities: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        kind: entityKindEnum,
        platform: platformEnum.optional(),
      }),
    )
    .max(20)
    .optional(),
  sessionId: z.string().max(64).optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const signalBatchSchema = z.object({ signals: z.array(signalSchema).min(1).max(100) });

// Loose envelope for per-item validation: the batch shape is enforced here,
// while each signal is validated individually in ingestBatch() so one bad
// signal can never reject (or silently drop) its 99 valid neighbors.
export const signalBatchEnvelopeSchema = z.object({
  signals: z.array(z.unknown()).min(1).max(100),
});

export type SignalInput = z.infer<typeof signalSchema>;
