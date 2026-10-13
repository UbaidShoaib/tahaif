#!/usr/bin/env bash
# Ship a git ref to the VPS and (re)build the stack there (ADR 0007).
#   infra/deploy.sh user@host [git-ref]      # ref defaults to HEAD
# Only committed code is shipped. The server keeps its own .env.prod.
set -euo pipefail

HOST=${1:?usage: infra/deploy.sh user@host [git-ref]}
REF=${2:-HEAD}
APP_DIR=${APP_DIR:-/opt/tahaif}
COMPOSE="docker compose --env-file .env.prod -f infra/docker-compose.prod.yml"

cd "$(git rev-parse --show-toplevel)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "==> Exporting $(git rev-parse --short "$REF")"
git archive "$REF" | tar -x -C "$tmp"

echo "==> Syncing to $HOST:$APP_DIR"
rsync -az --delete --exclude='/.env.prod' "$tmp"/ "$HOST:$APP_DIR/"

echo "==> Building and starting"
ssh "$HOST" "set -e; cd '$APP_DIR'
  test -f .env.prod || { echo 'Missing $APP_DIR/.env.prod (see infra/env.prod.example)' >&2; exit 1; }
  $COMPOSE up -d --build --remove-orphans
  docker image prune -f >/dev/null
  $COMPOSE ps"
