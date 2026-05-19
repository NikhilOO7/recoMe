#!/usr/bin/env bash
# Local-dev orchestrator for the Recome stack.
#
# Brings up Postgres + Neo4j + Qdrant in Docker, pushes the Prisma schema,
# starts the cloud API (port 3001), starts the web app (port 3000), and
# tees both logs to the terminal. Ctrl+C tears everything down.
#
# Usage:
#   scripts/dev-local.sh                   # idempotent start (docker DBs)
#   scripts/dev-local.sh --use-existing-env # use your cloud/.env as-is — no docker
#   scripts/dev-local.sh --reset           # wipe docker volumes first
#   scripts/dev-local.sh --no-seed         # skip the seed step
#   scripts/dev-local.sh --no-web          # cloud only (backend-focused dev)
#
# What it does NOT do:
#   - Touch your existing cloud/.env if it isn't ours (we refuse to clobber
#     a real Supabase/AuraDB config). Move it aside if you want full local.
#   - Install npm deps — run `npm install` in each package the first time.

set -euo pipefail

# ── Args ──────────────────────────────────────────────────────────────────
RESET=0
SEED=1
RUN_WEB=1
USE_EXISTING_ENV=0
for arg in "$@"; do
  case "$arg" in
    --reset)            RESET=1 ;;
    --no-seed)          SEED=0 ;;
    --no-web)           RUN_WEB=0 ;;
    --use-existing-env) USE_EXISTING_ENV=1 ;;
    -h|--help)
      sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ── Pretty output ─────────────────────────────────────────────────────────
say()   { printf '\033[1;36m▸\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die()   { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── Tool checks ───────────────────────────────────────────────────────────
command -v node >/dev/null || die "node not found — install Node 20+"
command -v npm  >/dev/null || die "npm not found"

DC=""
if [ "$USE_EXISTING_ENV" = "0" ]; then
  command -v docker >/dev/null || die "docker not found — install Docker Desktop (or rerun with --use-existing-env)"
  if docker compose version >/dev/null 2>&1; then
    DC="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    DC="docker-compose"
  else
    die "docker compose plugin not found"
  fi
fi

# ── env file management ───────────────────────────────────────────────────
# Refuse to clobber an existing cloud/.env that isn't ours, but otherwise
# write a local-dev one that points at the docker services.

ENV_MARKER="# RECOME_LOCAL_DEV_AUTO=1"
LOCAL_ENV="cloud/.env"

if [ -f "$LOCAL_ENV" ] && ! grep -q "$ENV_MARKER" "$LOCAL_ENV" && [ "$USE_EXISTING_ENV" = "0" ]; then
  die "cloud/.env exists and isn't a managed local-dev file.
    Two ways forward:
      1. Use what's there as-is (cloud DBs, no docker):
           ./scripts/dev-local.sh --use-existing-env
      2. Or switch to full local docker (we won't touch your real .env):
           mv cloud/.env cloud/.env.bak && ./scripts/dev-local.sh"
fi

if [ "$USE_EXISTING_ENV" = "1" ]; then
  if [ ! -f "$LOCAL_ENV" ]; then
    die "--use-existing-env but cloud/.env doesn't exist. Create one first
    (cp cloud/.env.example cloud/.env, then fill it in)."
  fi
  ok "using existing $LOCAL_ENV (skipping write + docker)"
else

say "writing $LOCAL_ENV (local-dev config)"
cat > "$LOCAL_ENV" <<EOF
$ENV_MARKER
# Local-dev config managed by scripts/dev-local.sh. Edit by hand only after
# moving this aside or removing the RECOME_LOCAL_DEV_AUTO marker above.

# ── Postgres (docker) ────────────────────────────────────────────────────
DATABASE_URL="postgresql://recome:recome@localhost:5432/recome?schema=public"
DIRECT_URL="postgresql://recome:recome@localhost:5432/recome?schema=public"

# ── Auth ─────────────────────────────────────────────────────────────────
JWT_SECRET="local-dev-jwt-secret-not-for-prod-not-for-prod-not-for-prod"
JWT_ACCESS_TTL="15m"
JWT_REFRESH_TTL="30d"

# ── Server ───────────────────────────────────────────────────────────────
PORT=3001
NODE_ENV="development"
LOG_LEVEL="info"
# Permissive CORS for local dev — both the web app and the extension can hit us.
CORS_ORIGINS="http://localhost:*,chrome-extension://*"

# ── Intelligence stack ON (Neo4j, Qdrant, OpenAI embeddings) ─────────────
INTELLIGENCE_ENABLED="true"
INTELLIGENCE_AGENTS_ENABLED="true"
INTELLIGENCE_RUN_MIGRATIONS_ON_BOOT="true"
INTELLIGENCE_AGENTS_PRICE_VENDOR="stub"
INTELLIGENCE_AGENTS_CONTENT_SOURCE="stub"

NEO4J_URI="bolt://localhost:7687"
NEO4J_USERNAME="neo4j"
NEO4J_PASSWORD="recomeneo4jdev"
NEO4J_DATABASE="neo4j"

QDRANT_URL="http://localhost:6333"
QDRANT_API_KEY=""
QDRANT_COLLECTION="recome_v1_dev"

# OpenAI — required by the intelligence stack on boot. If you don't have a
# key, set INTELLIGENCE_ENABLED=false above and most surfaces won't render.
# Embeddings ARE best-effort per signal — without a key, signals still land
# in the graph; only vector search degrades.
OPENAI_API_KEY="${OPENAI_API_KEY:-}"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
EOF
ok "wrote $LOCAL_ENV"

if [ -z "${OPENAI_API_KEY:-}" ] && ! grep -E '^OPENAI_API_KEY=".+"' "$LOCAL_ENV" >/dev/null; then
  warn "OPENAI_API_KEY is empty in your shell. The cloud API will refuse to boot."
  warn "Export OPENAI_API_KEY=sk-... and re-run, or edit cloud/.env."
  die  "set OPENAI_API_KEY then re-run"
fi
fi  # end of docker-mode env-write branch

# ── Web env — points the Next.js app at the local cloud API ──────────────
WEB_ENV="web/.env.local"
say "writing $WEB_ENV"
cat > "$WEB_ENV" <<EOF
$ENV_MARKER
NEXT_PUBLIC_API_URL=http://localhost:3001
EOF
ok "wrote $WEB_ENV"

if [ "$USE_EXISTING_ENV" = "0" ]; then
  # ── Reset volumes if asked ─────────────────────────────────────────────
  if [ "$RESET" = "1" ]; then
    warn "--reset: nuking docker volumes (data will be lost)"
    $DC down --volumes --remove-orphans || true
  fi

  # ── Bring up docker services ───────────────────────────────────────────
  say "bringing up postgres / neo4j / qdrant"
  $DC up -d
  ok "containers running"

  # Wait for healthy. docker compose v2 has --wait but it's not in v1; poll manually.
  wait_healthy() {
    local svc=$1 timeout=${2:-90} elapsed=0
    while [ $elapsed -lt $timeout ]; do
      status=$($DC ps --format json "$svc" 2>/dev/null | sed -n 's/.*"Health":"\([^"]*\)".*/\1/p' | head -1)
      [ -z "$status" ] && status=$(docker inspect -f '{{.State.Health.Status}}' "recome-$svc" 2>/dev/null || echo unknown)
      case "$status" in
        healthy) ok "$svc is healthy"; return 0 ;;
        unhealthy) die "$svc went unhealthy. Check: docker logs recome-$svc" ;;
      esac
      sleep 2
      elapsed=$((elapsed + 2))
      printf '  waiting for %s [%ds]\r' "$svc" "$elapsed"
    done
    echo
    warn "$svc didn't go healthy in ${timeout}s — proceeding anyway"
  }
  wait_healthy postgres
  wait_healthy neo4j 120
  wait_healthy qdrant 30
else
  say "skipping docker — using cloud DBs from your existing cloud/.env"
fi

# ── Prisma: generate client + push schema ────────────────────────────────
say "syncing Prisma schema (db push) and regenerating client"
(cd cloud && npx prisma generate >/dev/null)
(cd cloud && npx prisma db push --skip-generate >/dev/null)
ok "Postgres schema in sync"

# ── Seed (optional) ──────────────────────────────────────────────────────
# Seed needs the cloud API running. We launch cloud first, wait for /health,
# then run the seed in a subshell, then attach to the dev servers.

mkdir -p .dev-logs
CLOUD_LOG=".dev-logs/cloud.log"
WEB_LOG=".dev-logs/web.log"
: > "$CLOUD_LOG"; : > "$WEB_LOG"

say "starting cloud (logs → $CLOUD_LOG)"
(cd cloud && npm run dev >>"../$CLOUD_LOG" 2>&1) &
CLOUD_PID=$!

cleanup() {
  echo
  say "shutting down…"
  [ -n "${WEB_PID:-}" ] && kill "$WEB_PID" 2>/dev/null || true
  [ -n "${CLOUD_PID:-}" ] && kill "$CLOUD_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  if [ -n "$DC" ]; then
    warn "data stores (docker) left running — run '$DC down' to stop them"
  fi
  exit 0
}
trap cleanup INT TERM

# Wait for /health to return 200.
wait_for_cloud() {
  local timeout=60 elapsed=0
  while [ $elapsed -lt $timeout ]; do
    if curl -sf "http://localhost:3001/health" >/dev/null 2>&1; then
      ok "cloud API healthy"
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
    printf '  waiting for cloud /health [%ds]\r' "$elapsed"
  done
  echo
  warn "cloud /health did not come up — tail $CLOUD_LOG"
  return 1
}
wait_for_cloud || true

if [ "$SEED" = "1" ]; then
  say "seeding demo data"
  if (cd cloud && npx tsx ../scripts/seed-local.ts); then
    ok "seed complete"
  else
    warn "seed failed — see output above (you can still use the app, just empty)"
  fi
fi

# ── Web ───────────────────────────────────────────────────────────────────
if [ "$RUN_WEB" = "1" ]; then
  say "starting web (logs → $WEB_LOG)"
  (cd web && npm run dev >>"../$WEB_LOG" 2>&1) &
  WEB_PID=$!
  # Give Next a moment to bind.
  sleep 2
fi

# ── Summary ──────────────────────────────────────────────────────────────
echo
ok "all services up"
echo
printf '  \033[1mWeb app\033[0m   http://localhost:3000\n'
printf '  \033[1mCloud API\033[0m http://localhost:3001/health\n'
printf '  \033[1mNeo4j\033[0m     http://localhost:7474  (neo4j / recomeneo4jdev)\n'
printf '  \033[1mQdrant\033[0m    http://localhost:6333/dashboard\n'
echo
printf '  Surfaces to try once you sign in:\n'
printf '    /inbox        agent events\n'
printf '    /mind         interest graph + clusters\n'
printf '    /personality  opt-in mirror\n'
printf '    /audit-log    everything we know about you\n'
printf '    /agents       pause / resume / budgets\n'
echo
printf '  Demo user (seeded):  \033[1mdemo@recome.local\033[0m / \033[1mdemo1234!\033[0m\n'
echo
say "tailing cloud + web logs. Ctrl+C to stop."
echo
# Tail with prefixes so two streams stay readable.
( tail -F "$CLOUD_LOG" | sed -u 's/^/\x1b[35m[cloud]\x1b[0m /' ) &
TAIL_CLOUD=$!
if [ "$RUN_WEB" = "1" ]; then
  ( tail -F "$WEB_LOG" | sed -u 's/^/\x1b[36m[web]\x1b[0m   /' ) &
  TAIL_WEB=$!
fi

# Wait on cloud/web — Ctrl+C fires the trap.
wait "$CLOUD_PID" 2>/dev/null || true
kill "$TAIL_CLOUD" 2>/dev/null || true
[ -n "${TAIL_WEB:-}" ] && kill "$TAIL_WEB" 2>/dev/null || true
