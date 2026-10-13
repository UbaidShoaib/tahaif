# ADR 0007 — Whole Stack on One VPS (Docker Compose + Caddy)

**Date:** 2026-10-10
**Status:** Accepted (supersedes ADR 0002 as the active deploy target)

## Context

ADR 0002 put the API on Railway's one-time trial credit and the web app on a
Vercel preview. That left object storage and Meilisearch unprovisioned (proof
upload broken, search on the database fallback) and the API on a host that
pauses when the credit runs out. A VPS is now available.

## Decision

Run everything on a single VPS with Docker Compose
(`infra/docker-compose.prod.yml`): Caddy, web, API + worker, Postgres, Redis,
Meilisearch and MinIO.

- **One origin.** Caddy serves `https://$DOMAIN` and routes `/api/*` to the
  API, `/$S3_BUCKET_NAME/*` to MinIO and everything else to Next.js. No CORS,
  the `SameSite=Lax` refresh cookie stays first-party, and the web app's
  `default-src 'self'` CSP already allows the signed image/audio/video links.
  One DNS record is enough.
- **Caddy** terminates TLS (Let's Encrypt, automatic renewal). It is the only
  service that publishes ports; the data services are reachable only on the
  Compose network.
- **Media links are signed for the public host.** `S3_ENDPOINT_URL` is
  `https://$DOMAIN`, because a SigV4 link is only valid for the host it was
  signed for. The Caddy container carries `$DOMAIN` as a network alias so the
  API's own uploads stay on the Docker network.
- **Build on the server.** `infra/deploy.sh user@host` ships a git ref with
  rsync and runs `docker compose up -d --build`. No registry.
- **One settings file**, `/opt/tahaif/.env.prod` (template:
  `infra/env.prod.example`), lives only on the server. The web build reads its
  `NEXT_PUBLIC_*` lines through a BuildKit secret mount and keeps only those
  (Next copies `.env.production` into the standalone output), so no secret
  lands in an image.
- **MinIO image** comes from `ghcr.io/coollabsio/minio` (pinned). MinIO stopped
  publishing to Docker Hub in 2025; `minio/minio` can no longer be pulled.
- **Meilisearch is pinned** to an exact version; it will not open a data
  directory written by a different one.

`railway.json`, `infra/fly.toml` and `infra/render.yaml` stay in the repo as
alternatives.

## Consequences

- Single point of failure: one machine holds the app and its data. Backups are
  our job now (runbook §2) and must be copied off the server.
- Deploys rebuild in place, so there are a few seconds of downtime while
  containers restart, and the web build needs about 2 GB of memory
  (`infra/vps-setup.sh` adds swap on small machines).
- `NEXT_PUBLIC_*` changes need a rebuild (re-run the deploy), not just a restart.
- `TRUSTED_PROXY_HOPS` is 1 (Caddy). Set it to 2 in `.env.prod` if Cloudflare
  is put in front as a proxy.
- Upgrading Meilisearch means changing the pinned tag and rebuilding the index
  on a fresh volume (`scripts/reindex_search.py`); the index is derived data.
