#!/usr/bin/env tsx
/**
 * Seed the local cloud API with realistic demo signals so every UI surface
 * has something to render. Runs against the LIVE API (http://localhost:3001),
 * not the DB directly — that way we exercise the same code path as a real
 * user (auth, ingest, agent triggers).
 *
 * Idempotent: if the demo user already exists we sign in. Signals are
 * dedupe-keyed on signalId so re-running won't pile up duplicates.
 *
 * Called by scripts/dev-local.sh after the cloud API reports /health.
 */

const API = process.env.API_URL ?? 'http://localhost:3001';
const DEMO_EMAIL = 'demo@recome.local';
const DEMO_PASSWORD = 'demo1234!';

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
}

async function api<T>(path: string, opts: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(opts.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${opts.method ?? 'GET'} ${path} → ${res.status} ${body}`);
  }
  return (await res.json()) as T;
}

async function registerOrLogin(): Promise<AuthResponse> {
  // Try register first; on conflict (409) fall back to login.
  try {
    return await api<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        displayName: 'Demo User',
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/409|already|exists|duplicate|registered/i.test(msg)) {
      console.error('[seed] register failed, trying login:', msg);
    }
    return await api<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
    });
  }
}

// ── Demo signal fixtures ────────────────────────────────────────────────────
// Three trails of realistic browsing — distributed systems, standing desks
// (a purchase intent — fires Concierge), and climate adaptation. Spread over
// the last ~30 days so the Mind Map, Trails, and Personality Mirror all have
// time-windowed data to display.

interface SignalSeed {
  kind: 'view' | 'dwell' | 'comparison' | 'purchase';
  ageDays: number;
  pageUrl: string;
  pageTitle: string;
  platform: 'youtube' | 'reddit' | 'amazon' | 'walmart' | 'ebay' | 'twitter' | 'generic';
  topics: string[];
  entities?: Array<{ name: string; kind: 'product' | 'creator' | 'media'; platform?: string }>;
  weight?: number;
}

const SEEDS: SignalSeed[] = [
  // ── Distributed systems trail (career_craft) ────────────────────────────
  {
    kind: 'dwell',
    ageDays: 27,
    pageUrl: 'https://martin.kleppmann.com/2026/01/strong-consistency.html',
    pageTitle: 'Strong consistency in a partitioned cache',
    platform: 'generic',
    topics: ['distributed systems', 'kleppmann'],
    weight: 5,
  },
  {
    kind: 'view',
    ageDays: 24,
    pageUrl: 'https://www.youtube.com/watch?v=jepsen-etcd',
    pageTitle: 'Jepsen tests etcd 3.6',
    platform: 'youtube',
    topics: ['distributed systems', 'jepsen'],
    entities: [{ name: 'Jepsen', kind: 'creator', platform: 'youtube' }],
    weight: 4,
  },
  {
    kind: 'view',
    ageDays: 20,
    pageUrl: 'https://news.ycombinator.com/item?id=raft-paper',
    pageTitle: 'Raft consensus paper · HN discussion',
    platform: 'generic',
    topics: ['raft', 'distributed systems'],
  },
  {
    kind: 'view',
    ageDays: 18,
    pageUrl: 'https://arxiv.org/abs/2026.05-spanner-postgres',
    pageTitle: 'Spanner-style commits in vanilla Postgres',
    platform: 'generic',
    topics: ['postgres internals', 'distributed systems'],
  },
  {
    kind: 'view',
    ageDays: 14,
    pageUrl: 'https://www.reddit.com/r/programming/comments/distsys-thread',
    pageTitle: 'r/programming — favourite distributed-systems reads of 2026',
    platform: 'reddit',
    topics: ['distributed systems'],
  },
  {
    kind: 'view',
    ageDays: 6,
    pageUrl: 'https://www.youtube.com/watch?v=kleppmann-cap',
    pageTitle: 'Kleppmann on CAP-after-15-years',
    platform: 'youtube',
    topics: ['distributed systems', 'kleppmann'],
    weight: 4,
  },

  // ── Standing desk purchase intent (home_life — fires Concierge) ────────
  {
    kind: 'view',
    ageDays: 18,
    pageUrl: 'https://www.youtube.com/watch?v=uplift-v2-review',
    pageTitle: 'Uplift V2 standing desk — 1-year review',
    platform: 'youtube',
    topics: ['standing desks'],
    entities: [{ name: 'Uplift V2', kind: 'product' }],
  },
  {
    kind: 'view',
    ageDays: 16,
    pageUrl: 'https://www.reddit.com/r/standing_desks/comments/branch-vs-uplift',
    pageTitle: 'Branch Duo vs Uplift V2 — bearings',
    platform: 'reddit',
    topics: ['standing desks'],
    entities: [{ name: 'Branch Duo', kind: 'product' }],
  },
  {
    kind: 'view',
    ageDays: 14,
    pageUrl: 'https://www.theverge.com/standing-desk-roundup-2026',
    pageTitle: 'The Verge — Best standing desks 2026',
    platform: 'generic',
    topics: ['standing desks'],
    entities: [{ name: 'Uplift V2', kind: 'product' }],
  },
  {
    kind: 'comparison',
    ageDays: 9,
    pageUrl: 'https://www.amazon.com/dp/uplift-v2',
    pageTitle: 'Uplift V2 · 42" deep · bamboo',
    platform: 'amazon',
    topics: ['standing desks'],
    entities: [{ name: 'Uplift V2', kind: 'product', platform: 'amazon' }],
    weight: 6,
  },
  {
    kind: 'comparison',
    ageDays: 7,
    pageUrl: 'https://www.walmart.com/uplift-v2',
    pageTitle: 'Uplift V2 · Walmart listing',
    platform: 'walmart',
    topics: ['standing desks'],
    entities: [{ name: 'Uplift V2', kind: 'product', platform: 'walmart' }],
    weight: 5,
  },
  {
    kind: 'comparison',
    ageDays: 2,
    pageUrl: 'https://www.amazon.com/dp/uplift-v2',
    pageTitle: 'Uplift V2 — re-checking',
    platform: 'amazon',
    topics: ['standing desks'],
    entities: [{ name: 'Uplift V2', kind: 'product', platform: 'amazon' }],
    weight: 7,
  },

  // ── Climate adaptation reading (news_culture, dormant) ─────────────────
  {
    kind: 'dwell',
    ageDays: 29,
    pageUrl: 'https://example.substack.com/climate-adaptation-bonn',
    pageTitle: 'Adaptation finance after Bonn',
    platform: 'generic',
    topics: ['climate policy', 'climate adaptation'],
    weight: 4,
  },
  {
    kind: 'view',
    ageDays: 26,
    pageUrl: 'https://www.nature.com/articles/climate-2026',
    pageTitle: 'Nature: tipping points re-examined',
    platform: 'generic',
    topics: ['climate adaptation'],
  },
  {
    kind: 'view',
    ageDays: 22,
    pageUrl: 'https://www.youtube.com/watch?v=climate-podcast',
    pageTitle: 'Climate adaptation podcast — episode 41',
    platform: 'youtube',
    topics: ['climate adaptation'],
    entities: [{ name: 'Climate Pod', kind: 'creator' }],
  },
  // (intentional 22-day gap — Curator should surface this cluster as dormant)

  // ── Espresso setup (home_life, stalled) ────────────────────────────────
  {
    kind: 'view',
    ageDays: 25,
    pageUrl: 'https://www.youtube.com/watch?v=lance-mara-x',
    pageTitle: 'Lance Hedrick · Lelit Mara X long-term review',
    platform: 'youtube',
    topics: ['espresso setup'],
    entities: [{ name: 'Lelit Mara X', kind: 'product' }],
  },
  {
    kind: 'view',
    ageDays: 23,
    pageUrl: 'https://www.reddit.com/r/espresso/comments/mara-x-thread',
    pageTitle: 'r/espresso — Mara X after 18 months',
    platform: 'reddit',
    topics: ['espresso setup'],
  },

  // ── LLM ops (career_craft, fresh) ──────────────────────────────────────
  {
    kind: 'view',
    ageDays: 12,
    pageUrl: 'https://arxiv.org/abs/2026.05-agent-memory',
    pageTitle: 'Memory architectures for long-running agents',
    platform: 'generic',
    topics: ['llm ops', 'agent memory'],
  },
  {
    kind: 'dwell',
    ageDays: 4,
    pageUrl: 'https://anthropic.com/news/claude-dreaming',
    pageTitle: 'Claude Dreaming preview',
    platform: 'generic',
    topics: ['llm ops'],
    weight: 4,
  },
];

// Convert relative-day seeds into batched POST /intelligence/signals bodies.
// Spread within-day so timestamps don't collide.

interface SignalPayload {
  id: string;
  kind: SignalSeed['kind'];
  ts: number;
  weight: number;
  pageUrl: string;
  pageTitle: string;
  platform: SignalSeed['platform'];
  topics: { name: string }[];
  entities?: Array<{ name: string; kind: 'product' | 'creator' | 'media'; platform?: string }>;
}

function buildPayloads(): SignalPayload[] {
  const now = Date.now();
  return SEEDS.map((s, i) => ({
    id: `seed-${i}-${s.kind}-${s.ageDays}d`,
    kind: s.kind,
    ts: now - s.ageDays * 86_400_000 + (i % 24) * 3_600_000,
    weight: s.weight ?? 1,
    pageUrl: s.pageUrl,
    pageTitle: s.pageTitle,
    platform: s.platform,
    topics: s.topics.map((name) => ({ name })),
    entities: s.entities,
  }));
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[seed] API: ${API}`);
  // Wait briefly for /health if the orchestrator didn't already.
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${API}/health`);
      if (res.ok) break;
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log('[seed] registering / logging in demo user');
  const auth = await registerOrLogin();
  console.log(`[seed] auth ok · user=${auth.user.id}`);

  const payloads = buildPayloads();
  // Batch into groups of 10 so the request bodies stay reasonable.
  let posted = 0;
  for (let i = 0; i < payloads.length; i += 10) {
    const slice = payloads.slice(i, i + 10);
    await api(
      '/intelligence/signals',
      { method: 'POST', body: JSON.stringify({ signals: slice }) },
      auth.accessToken,
    );
    posted += slice.length;
    process.stdout.write(`  ingested ${posted}/${payloads.length}\r`);
  }
  console.log();
  console.log(
    `[seed] ingested ${posted} signals across ${new Set(SEEDS.flatMap((s) => s.topics)).size} topics`,
  );

  // Seed a Concierge watchlist item so the /ask Watchlist column renders
  // non-empty for the demo. Idempotent: dedup on label client-side.
  try {
    const existing = await api<{ items: Array<{ label: string }> }>(
      '/intelligence/agents/concierge/watchlist',
      {},
      auth.accessToken,
    );
    const hasIt = existing.items.some((i) => i.label === 'Sony WH-1000XM6 headphones');
    if (!hasIt) {
      await api(
        '/intelligence/agents/concierge/watchlist',
        {
          method: 'POST',
          body: JSON.stringify({
            label: 'Sony WH-1000XM6 headphones',
            targetPriceUsd: 300,
            retailers: ['amazon', 'walmart', 'bestbuy'],
          }),
        },
        auth.accessToken,
      );
      console.log('[seed] watchlist: added "Sony WH-1000XM6 headphones" @ $300');
    } else {
      console.log('[seed] watchlist: "Sony WH-1000XM6 headphones" already present');
    }
  } catch (err) {
    console.warn(
      '[seed] watchlist seed skipped (agent routes may not be enabled):',
      err instanceof Error ? err.message : err,
    );
  }

  // Fire Recall on-demand for a recent distributed-systems signal so the
  // inbox isn't empty on first login. The cloud's Recall agent looks for
  // older signals on the same topic — our 27-day-old Kleppmann signal +
  // the 6-day-old CAP-after-15-years signal are a perfect pair.
  try {
    await api(
      '/intelligence/agents/recall/run?trigger=event',
      {
        method: 'POST',
        body: JSON.stringify({
          event: {
            signalId: 'seed-5-view-6d',
            topicNormalizedName: 'distributed systems',
            topicName: 'distributed systems',
            ts: Date.now() - 6 * 86_400_000,
            platform: 'youtube',
          },
        }),
      },
      auth.accessToken,
    );
    console.log('[seed] recall fired on "distributed systems" — inbox should have an event');
  } catch (err) {
    console.warn(
      '[seed] recall fire skipped (agent routes may not be enabled):',
      err instanceof Error ? err.message : err,
    );
  }

  // Quick smoke that downstream surfaces have data.
  const [trails, mind, inbox] = await Promise.all([
    api<{ trails: unknown[] }>('/intelligence/trails?limit=10', {}, auth.accessToken).catch(() => ({
      trails: [],
    })),
    api<{ nodes: unknown[] }>(
      '/intelligence/mindmap?window=90d&cache=no',
      {},
      auth.accessToken,
    ).catch(() => ({ nodes: [] })),
    api<{ events: unknown[] }>('/intelligence/inbox?limit=10', {}, auth.accessToken).catch(() => ({
      events: [],
    })),
  ]);
  console.log(`[seed] /intelligence/trails  → ${trails.trails.length} cross-platform trails`);
  console.log(`[seed] /intelligence/mindmap → ${mind.nodes.length} nodes`);
  console.log(`[seed] /intelligence/inbox   → ${inbox.events.length} agent events`);
  console.log();
  console.log('[seed] demo login: demo@recome.local / demo1234!');
  console.log('[seed] visit:      recome.app/ask, recome.app/mind, recome.app/inbox');
}

main().catch((err) => {
  console.error('[seed] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
