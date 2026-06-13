#!/usr/bin/env bash
# start.sh — Start the Tahaif development environment with a single command.
# Usage: ./start.sh [--no-seed] [--no-install]
set -euo pipefail

# ── Colours ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}▶${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✗${NC} $*" >&2; }
header()  { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${NC}"; }

# ── Flags ──────────────────────────────────────────────────────────────────────
SEED=true
INSTALL=true

for arg in "$@"; do
  case "$arg" in
    --no-seed)    SEED=false ;;
    --no-install) INSTALL=false ;;
    --help|-h)
      echo "Usage: ./start.sh [--no-seed] [--no-install]"
      echo ""
      echo "  --no-seed      Skip database seeding (useful after first run)"
      echo "  --no-install   Skip npm/pip install (faster restarts)"
      exit 0
      ;;
  esac
done

# ── Resolve project root ───────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo -e "${BOLD}${GREEN}تحائف Tahaif — Development Environment${NC}"
echo -e "  $(pwd)"
echo ""

# ── Cleanup on exit ────────────────────────────────────────────────────────────
API_PID=""
WEB_PID=""

cleanup() {
  echo ""
  info "Shutting down..."

  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    success "API server stopped"
  fi

  if [[ -n "$WEB_PID" ]] && kill -0 "$WEB_PID" 2>/dev/null; then
    kill "$WEB_PID" 2>/dev/null || true
    success "Web server stopped"
  fi

  echo ""
  echo -e "${BOLD}Docker services are still running.${NC} To stop them:"
  echo "  docker compose -f infra/docker-compose.yml down"
  echo ""
}

trap cleanup EXIT INT TERM

# ══════════════════════════════════════════════════════════════════════════════
header "1/6  Prerequisites"
# ══════════════════════════════════════════════════════════════════════════════

MISSING=()

check_cmd() {
  local cmd="$1"
  local name="${2:-$cmd}"
  local install_hint="$3"
  if command -v "$cmd" &>/dev/null; then
    success "$name found ($(${cmd} --version 2>&1 | head -1))"
  else
    error "$name not found — $install_hint"
    MISSING+=("$name")
  fi
}

check_cmd docker    "Docker"  "Install from https://www.docker.com/get-started/"
check_cmd node      "Node.js" "Install from https://nodejs.org/"
check_cmd pnpm      "pnpm"    "Run: npm install -g pnpm"
check_cmd python3   "Python"  "Install from https://www.python.org/downloads/ (3.12+)"
check_cmd uv        "uv"      "Run: pip install uv OR curl -LsSf https://astral.sh/uv/install.sh | sh"

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo ""
  error "Missing prerequisites: ${MISSING[*]}"
  error "Install them and re-run ./start.sh"
  exit 1
fi

# Node version check
NODE_MAJOR="$(node --version | sed 's/v//' | cut -d. -f1)"
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  warn "Node.js $NODE_MAJOR detected — recommend Node 22+"
fi

# Python version check
PYTHON_VERSION="$(python3 --version 2>&1 | awk '{print $2}')"
PYTHON_MAJOR="$(echo "$PYTHON_VERSION" | cut -d. -f1)"
PYTHON_MINOR="$(echo "$PYTHON_VERSION" | cut -d. -f2)"
if [[ "$PYTHON_MAJOR" -lt 3 ]] || { [[ "$PYTHON_MAJOR" -eq 3 ]] && [[ "$PYTHON_MINOR" -lt 12 ]]; }; then
  warn "Python $PYTHON_VERSION detected — recommend Python 3.12+"
fi

# ══════════════════════════════════════════════════════════════════════════════
header "2/6  Environment"
# ══════════════════════════════════════════════════════════════════════════════

if [[ ! -f ".env" ]]; then
  info "Creating .env from .env.example..."
  cp .env.example .env

  # Auto-generate SECRET_KEY
  SECRET="$(python3 -c "import secrets; print(secrets.token_hex(32))")"
  # Replace the placeholder (handles both macOS and GNU sed)
  if sed --version 2>&1 | grep -q GNU; then
    sed -i "s/^SECRET_KEY=.*/SECRET_KEY=${SECRET}/" .env
  else
    sed -i '' "s/^SECRET_KEY=.*/SECRET_KEY=${SECRET}/" .env
  fi

  success ".env created with auto-generated SECRET_KEY"
else
  success ".env already exists — skipping"
fi

# ══════════════════════════════════════════════════════════════════════════════
header "3/6  Docker Services"
# ══════════════════════════════════════════════════════════════════════════════

COMPOSE="docker compose -f infra/docker-compose.yml"

info "Starting Docker services (postgres, redis, meilisearch, minio, mailhog)..."
$COMPOSE up -d

info "Waiting for services to be healthy..."

wait_healthy() {
  local service="$1"
  local max_wait=60
  local elapsed=0

  while true; do
    local health
    health="$($COMPOSE ps "$service" --format json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Health','') if isinstance(d,dict) else '')" 2>/dev/null || echo "")"

    if [[ "$health" == "healthy" ]]; then
      success "$service is healthy"
      return 0
    fi

    if [[ $elapsed -ge $max_wait ]]; then
      warn "$service health check timed out after ${max_wait}s — continuing anyway"
      return 0
    fi

    printf "  Waiting for %-20s (%ds)\r" "$service..." "$elapsed"
    sleep 2
    elapsed=$((elapsed + 2))
  done
}

wait_healthy "postgres"
wait_healthy "redis"

# Meilisearch and MinIO don't always report Docker health, just wait a moment
sleep 3
success "meilisearch, minio, mailhog — started"

# ══════════════════════════════════════════════════════════════════════════════
header "4/6  Backend"
# ══════════════════════════════════════════════════════════════════════════════

cd apps/api

if [[ "$INSTALL" == "true" ]]; then
  info "Installing Python dependencies (uv sync)..."
  uv sync --quiet
  success "Python dependencies installed"
else
  info "Skipping Python install (--no-install)"
fi

info "Running database migrations (alembic upgrade head)..."
# Export vars from root .env so alembic env.py picks up DATABASE_URL
set -a; [ -f "../../.env" ] && source "../../.env"; set +a
if uv run alembic upgrade head 2>&1 | tail -5; then
  success "Migrations applied"
else
  error "Migration failed — check logs above"
  exit 1
fi

if [[ "$SEED" == "true" ]]; then
  info "Seeding database..."
  if uv run python scripts/seed.py; then
    success "Database seeded"
  else
    warn "Seed failed or data already exists — continuing"
  fi
else
  info "Skipping seed (--no-seed)"
fi

info "Starting API server (uvicorn, port 8000)..."
# Free the port in case a previous server is still running
fuser -k 8000/tcp 2>/dev/null || true
uv run uvicorn app.main:app \
  --reload \
  --host 0.0.0.0 \
  --port 8000 \
  --log-level info \
  > ../../logs/api.log 2>&1 &
API_PID=$!

cd ../..

# Wait for API to respond
info "Waiting for API to be ready..."
API_READY=false
for i in {1..30}; do
  if curl -sf http://localhost:8000/api/v1/healthz >/dev/null 2>&1; then
    API_READY=true
    break
  fi
  sleep 1
done

if [[ "$API_READY" == "true" ]]; then
  success "API is ready"
else
  warn "API did not respond in 30s — check logs/api.log for errors"
fi

# ══════════════════════════════════════════════════════════════════════════════
header "5/6  Frontend"
# ══════════════════════════════════════════════════════════════════════════════

cd apps/web

if [[ "$INSTALL" == "true" ]]; then
  info "Installing Node dependencies (pnpm install)..."
  if pnpm install --ignore-scripts --reporter=silent 2>&1; then
    success "Node dependencies installed"
  else
    warn "pnpm install had warnings — check output above"
  fi
else
  info "Skipping Node install (--no-install)"
fi

mkdir -p ../../logs

info "Starting Next.js dev server (port 3000)..."
fuser -k 3000/tcp 2>/dev/null || true
pnpm dev > ../../logs/web.log 2>&1 &
WEB_PID=$!

cd ../..

# Wait for Next.js to compile
info "Waiting for web app to be ready (this takes ~15s on first run)..."
WEB_READY=false
for i in {1..60}; do
  if curl -sf http://localhost:3000 >/dev/null 2>&1; then
    WEB_READY=true
    break
  fi
  sleep 2
done

if [[ "$WEB_READY" == "true" ]]; then
  success "Web app is ready"
else
  warn "Web app did not respond in 120s — check logs/web.log for errors"
fi

# ══════════════════════════════════════════════════════════════════════════════
header "6/6  Ready"
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}${GREEN}Everything is running!${NC}"
echo ""
echo -e "  ${BOLD}🌐 Web app${NC}            http://localhost:3000"
echo -e "  ${BOLD}📖 API docs${NC}           http://localhost:8000/api/v1/docs"
echo -e "  ${BOLD}💚 API health${NC}         http://localhost:8000/api/v1/healthz"
echo -e "  ${BOLD}📧 Test emails${NC}        http://localhost:8025"
echo -e "  ${BOLD}🪣 MinIO console${NC}      http://localhost:9001  (minioadmin / minioadmin)"
echo -e "  ${BOLD}🔍 Meilisearch${NC}        http://localhost:7700"
echo ""
echo -e "  ${BOLD}Logs:${NC}"
echo -e "    API → logs/api.log"
echo -e "    Web → logs/web.log"
echo ""
echo -e "  ${BOLD}Press Ctrl+C to stop all servers.${NC}"
echo ""

# ── Keep running and tail both logs ───────────────────────────────────────────
# Monitor both background processes — exit if either crashes
while true; do
  if [[ -n "$API_PID" ]] && ! kill -0 "$API_PID" 2>/dev/null; then
    error "API server crashed! Check logs/api.log"
    exit 1
  fi
  if [[ -n "$WEB_PID" ]] && ! kill -0 "$WEB_PID" 2>/dev/null; then
    error "Web server crashed! Check logs/web.log"
    exit 1
  fi
  sleep 5
done
