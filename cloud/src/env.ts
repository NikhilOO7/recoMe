/**
 * Side-effect env loader. Must be the first import in src/index.ts so it
 * populates process.env before any module reads it (e.g. config.ts).
 *
 * Load order (later overrides earlier):
 *   1. process.env        — set by shell, docker, Fly secrets
 *   2. cloud/.env         — managed by scripts/dev-local.sh for local dev
 *   3. cloud/.env.local   — sidecar for user secrets (gitignored)
 *
 * Production note: on Fly there is no .env or .env.local file in the
 * container, so this is a local-dev convenience — env vars come from
 * `fly secrets` directly into process.env and survive untouched.
 */

import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Resolve relative to the cwd (cloud/) — the same path Prisma uses.
const ENV = resolve(process.cwd(), '.env');
const ENV_LOCAL = resolve(process.cwd(), '.env.local');

if (existsSync(ENV)) {
  loadEnv({ path: ENV });
}
if (existsSync(ENV_LOCAL)) {
  // override: true is what makes the sidecar pattern work — keys present in
  // .env.local replace the same keys from .env. Without this flag, dotenv
  // refuses to overwrite an already-set key.
  loadEnv({ path: ENV_LOCAL, override: true });
}
