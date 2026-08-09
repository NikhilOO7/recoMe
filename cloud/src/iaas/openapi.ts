/**
 * Hand-rolled OpenAPI 3.0 spec for /v1/* (P4.2).
 *
 * Why hand-rolled instead of zod-to-openapi:
 *   - The Zod schemas in intelligence/schemas.ts use a few shapes that don't
 *     map cleanly (z.record(z.union(...)), partial union narrowing) and
 *     auto-generated output for those is misleading.
 *   - Maintaining the spec by hand is a low-cost forcing function: every
 *     /v1 route change must update this file, which keeps the public
 *     contract conscious — exactly the right friction for a public surface
 *     versioned as "we treat schema changes here as breaking" (V1Controller
 *     header comment).
 *
 * The spec is the authoritative client contract — same shape served at
 * /v1/openapi.json and rendered via Swagger UI at /v1/docs.
 */

export const OPENAPI_SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'Recome IaaS — /v1',
    version: '1.0.0',
    description:
      'Personal interest graph as infrastructure. Tenant-scoped, API-key authenticated. ' +
      'Mirrors the consumer surface at /intelligence/* but with quota gates and per-tenant usage tracking.',
    contact: { name: 'Recome', url: 'https://recome.app' },
    license: { name: 'Proprietary' },
  },
  servers: [
    { url: 'https://api.recome.app', description: 'Production' },
    { url: 'http://localhost:3001', description: 'Local dev' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'rk_live_… | rk_test_… (28 url-safe base64 chars)',
      },
    },
    parameters: {
      ExternalUserId: {
        name: 'X-User-Id',
        in: 'header',
        required: true,
        schema: { type: 'string', maxLength: 256 },
        description:
          "Your tenant's external identifier for this end-user. Recome namespaces " +
          "it into a tenant-scoped userId internally; you never see another tenant's users.",
      },
    },
    schemas: {
      Platform: {
        type: 'string',
        enum: [
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
        ],
      },
      SignalKind: {
        type: 'string',
        enum: ['view', 'dwell', 'like', 'block', 'boost', 'purchase', 'comparison', 'search'],
      },
      EntityKind: {
        type: 'string',
        enum: ['product', 'brand', 'creator', 'category', 'media', 'place', 'person'],
      },
      Signal: {
        type: 'object',
        required: ['kind'],
        properties: {
          id: { type: 'string', maxLength: 64 },
          kind: { $ref: '#/components/schemas/SignalKind' },
          ts: { type: 'integer', description: 'ms epoch' },
          weight: { type: 'number', minimum: 0, maximum: 100 },
          pageUrl: { type: 'string', format: 'uri' },
          pageTitle: { type: 'string', maxLength: 500 },
          platform: { $ref: '#/components/schemas/Platform' },
          topics: {
            type: 'array',
            maxItems: 20,
            items: {
              type: 'object',
              required: ['name'],
              properties: { name: { type: 'string', maxLength: 120 } },
            },
          },
          entities: {
            type: 'array',
            maxItems: 20,
            items: {
              type: 'object',
              required: ['name', 'kind'],
              properties: {
                name: { type: 'string', maxLength: 200 },
                kind: { $ref: '#/components/schemas/EntityKind' },
                platform: { $ref: '#/components/schemas/Platform' },
              },
            },
          },
          sessionId: { type: 'string', maxLength: 64 },
        },
      },
      SignalBatch: {
        type: 'object',
        required: ['signals'],
        properties: {
          signals: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: { $ref: '#/components/schemas/Signal' },
          },
        },
      },
      SignalIngestResponse: {
        type: 'object',
        description:
          'Per-item ingestion outcome. Signals in `rejected` failed validation and must not be ' +
          'resent. Signals in `retryable` hit a transient error and may be resent safely — ' +
          'ingestion is idempotent on the signal `id`. Usage is metered on `accepted` only.',
        properties: {
          ok: { type: 'boolean' },
          tenantId: { type: 'string' },
          externalUserId: { type: 'string' },
          count: { type: 'integer', description: 'Alias of accepted' },
          accepted: { type: 'integer' },
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                signalId: { type: 'string' },
                topicsCreated: { type: 'integer' },
                entitiesCreated: { type: 'integer' },
              },
            },
          },
          rejected: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'integer', description: 'Position in the submitted batch' },
                id: { type: 'string', nullable: true },
                code: { type: 'string', enum: ['invalid_signal'] },
                issues: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          retryable: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'integer', description: 'Position in the submitted batch' },
                id: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
      Trail: {
        type: 'object',
        properties: {
          topicDisplayName: { type: 'string' },
          topicNormalizedName: { type: 'string' },
          platforms: { type: 'array', items: { $ref: '#/components/schemas/Platform' } },
          signalCount: { type: 'integer' },
          strength: { type: 'number' },
          firstSeenAt: { type: 'integer', description: 'ms epoch' },
          lastSeenAt: { type: 'integer', description: 'ms epoch' },
        },
      },
      Intent: {
        type: 'object',
        properties: {
          topicName: { type: 'string' },
          strength: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
      UsageSnapshot: {
        type: 'object',
        properties: {
          period: { type: 'string', example: '2026-05' },
          signalsIngested: { type: 'integer' },
          queriesServed: { type: 'integer' },
          embeddingsBilled: { type: 'integer' },
        },
      },
      QuotaExceeded: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'quota_exceeded' },
          metric: { type: 'string', enum: ['signals', 'queries'] },
          used: { type: 'integer' },
          limit: { type: 'integer' },
          resetsAt: { type: 'string', format: 'date-time' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/v1/signals': {
      post: {
        summary: 'Ingest a batch of signals for one external user',
        tags: ['Ingest'],
        parameters: [{ $ref: '#/components/parameters/ExternalUserId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/SignalBatch' } },
          },
        },
        responses: {
          '200': {
            description: 'Signals accepted; counts of created topics + entities returned.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SignalIngestResponse' },
              },
            },
          },
          '400': { description: 'Invalid signals', content: errorContent() },
          '429': { description: 'Monthly quota exceeded', content: quotaContent() },
          '500': { description: 'Ingest failed', content: errorContent() },
        },
      },
    },
    '/v1/users/{externalUserId}/trails': {
      get: {
        summary: "List a user's cross-platform research trails",
        tags: ['Query'],
        parameters: [
          { $ref: '#/components/parameters/ExternalUserId' },
          {
            name: 'externalUserId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Must match the X-User-Id header value.',
          },
          { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 50, default: 10 } },
          {
            name: 'minPlatforms',
            in: 'query',
            schema: { type: 'integer', minimum: 1, default: 2 },
            description: 'Only return trails touching at least this many platforms.',
          },
        ],
        responses: {
          '200': {
            description: 'Trails for the user.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tenantId: { type: 'string' },
                    externalUserId: { type: 'string' },
                    trails: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Trail' },
                    },
                  },
                },
              },
            },
          },
          '403': { description: 'User-id mismatch', content: errorContent() },
          '429': { description: 'Monthly quota exceeded', content: quotaContent() },
        },
      },
    },
    '/v1/users/{externalUserId}/trails/{topic}': {
      get: {
        summary: 'Single trail with related-topic suggestions',
        tags: ['Query'],
        parameters: [
          { $ref: '#/components/parameters/ExternalUserId' },
          { name: 'externalUserId', in: 'path', required: true, schema: { type: 'string' } },
          {
            name: 'topic',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'URL-encoded topic display name.',
          },
        ],
        responses: {
          '200': {
            description: 'Trail + related topics + strength explanation.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    trail: { $ref: '#/components/schemas/Trail' },
                    related: { type: 'array', items: { type: 'object' } },
                    explain: { type: 'string' },
                  },
                },
              },
            },
          },
          '404': { description: 'Trail not found', content: errorContent() },
        },
      },
    },
    '/v1/users/{externalUserId}/intents': {
      get: {
        summary: "List a user's top intents (used for personalization)",
        tags: ['Query'],
        parameters: [
          { $ref: '#/components/parameters/ExternalUserId' },
          { name: 'externalUserId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 50, default: 10 } },
        ],
        responses: {
          '200': {
            description: 'Top intents by strength.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tenantId: { type: 'string' },
                    externalUserId: { type: 'string' },
                    intents: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Intent' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/v1/users/{externalUserId}': {
      delete: {
        summary: 'GDPR-delete an external user (graph + vectors + audit log)',
        tags: ['Privacy'],
        parameters: [
          { $ref: '#/components/parameters/ExternalUserId' },
          { name: 'externalUserId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Delete summary (nodes/edges/vectors removed).',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        },
      },
    },
    '/v1/usage': {
      get: {
        summary: 'Current-period usage for this tenant',
        tags: ['Account'],
        responses: {
          '200': {
            description: 'Usage snapshot for the current month.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UsageSnapshot' },
              },
            },
          },
        },
      },
    },
  },
} as const;

function errorContent() {
  return { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } };
}
function quotaContent() {
  return { 'application/json': { schema: { $ref: '#/components/schemas/QuotaExceeded' } } };
}

/** Tiny self-contained Swagger UI HTML served at /v1/docs. */
export function swaggerUiHtml(specUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Recome IaaS — API Reference</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css">
  <style>body{margin:0;background:#0a0a0a;}.swagger-ui .topbar{display:none;}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: ${JSON.stringify(specUrl)},
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis],
        layout: 'BaseLayout',
        docExpansion: 'list',
      });
    };
  </script>
</body>
</html>`;
}
