#!/usr/bin/env bash
set -euo pipefail

# ── RecoMe Cloud Deploy Script ──────────────────────────────────────────────
# Usage:
#   ./deploy.sh              # Full deploy (migrate + deploy)
#   ./deploy.sh --skip-db    # Deploy only (skip database migration)
#   ./deploy.sh --db-only    # Run database migration only
#   ./deploy.sh --status     # Check current deployment status

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

APP_NAME="recome-api"
REGION="sjc"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()   { echo -e "${CYAN}[deploy]${NC} $1"; }
ok()    { echo -e "${GREEN}[  ok  ]${NC} $1"; }
warn()  { echo -e "${YELLOW}[ warn ]${NC} $1"; }
fail()  { echo -e "${RED}[FAIL!]${NC} $1"; exit 1; }

# ── Preflight checks ────────────────────────────────────────────────────────

check_deps() {
  command -v fly >/dev/null 2>&1 || fail "flyctl not installed. Run: brew install flyctl"
  command -v npx >/dev/null 2>&1 || fail "npx not found. Install Node.js >= 20"
  fly auth whoami >/dev/null 2>&1 || fail "Not logged in to Fly.io. Run: fly auth login"
  log "Authenticated as $(fly auth whoami 2>/dev/null)"
}

# ── Database migration ──────────────────────────────────────────────────────

run_db_migrate() {
  log "Running Prisma schema push to production database..."

  # Get DATABASE_URL from Fly secrets
  local db_url
  db_url=$(fly secrets list -a "$APP_NAME" 2>/dev/null | grep DATABASE_URL | awk '{print "set"}')
  if [ -z "$db_url" ]; then
    fail "DATABASE_URL not set in Fly secrets. Run: fly secrets set DATABASE_URL=..."
  fi

  # Use Fly proxy to connect to the database through the app
  # Or use the direct URL if available locally
  if [ -f ".env" ] && grep -q "DIRECT_URL" .env 2>/dev/null; then
    log "Using local .env for database URL"
    npx dotenv -e .env -- npx prisma db push --skip-generate
  else
    warn "No local .env with DIRECT_URL found."
    warn "To run migrations, create .env with your Supabase DIRECT_URL"
    warn "Or run manually: DATABASE_URL=... DIRECT_URL=... npx prisma db push"
    return 1
  fi

  ok "Database schema is up to date"
}

# ── Build check ─────────────────────────────────────────────────────────────

run_build_check() {
  log "Running local build check..."
  npm run build 2>&1 | tail -3
  if [ -f "dist/index.js" ]; then
    ok "Build output verified (dist/index.js exists)"
  else
    fail "Build failed — dist/index.js not found"
  fi
}

# ── Deploy to Fly.io ────────────────────────────────────────────────────────

run_deploy() {
  log "Deploying to Fly.io ($APP_NAME in $REGION)..."
  echo ""
  fly deploy --app "$APP_NAME" --remote-only
  echo ""
  ok "Deployment complete"
}

# ── Health check ────────────────────────────────────────────────────────────

run_health_check() {
  log "Running health check..."
  local url="https://${APP_NAME}.fly.dev/health"

  # Wait for the app to wake up (auto-stop may have it sleeping)
  local attempts=0
  local max_attempts=10

  while [ $attempts -lt $max_attempts ]; do
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")

    if [ "$response" = "200" ]; then
      local body
      body=$(curl -s "$url" 2>/dev/null)
      ok "Health check passed: $body"
      ok "Live at: https://${APP_NAME}.fly.dev"
      return 0
    fi

    attempts=$((attempts + 1))
    if [ $attempts -lt $max_attempts ]; then
      log "Waiting for app to start (attempt $attempts/$max_attempts)..."
      sleep 3
    fi
  done

  fail "Health check failed after $max_attempts attempts (last status: $response)"
}

# ── Status ──────────────────────────────────────────────────────────────────

show_status() {
  log "App status for $APP_NAME:"
  echo ""
  fly status -a "$APP_NAME" 2>&1
  echo ""
  fly machines list -a "$APP_NAME" 2>&1
  echo ""
  log "Checking health..."
  curl -s "https://${APP_NAME}.fly.dev/health" 2>/dev/null && echo ""
}

# ── Main ────────────────────────────────────────────────────────────────────

main() {
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}  RecoMe Cloud Deploy${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  case "${1:-}" in
    --status)
      check_deps
      show_status
      ;;
    --skip-db)
      check_deps
      run_build_check
      run_deploy
      run_health_check
      ;;
    --db-only)
      check_deps
      run_db_migrate
      ;;
    *)
      check_deps
      run_db_migrate || warn "Skipping DB migration (see above)"
      run_build_check
      run_deploy
      run_health_check
      ;;
  esac

  echo ""
  ok "Done!"
  echo ""
}

main "$@"
