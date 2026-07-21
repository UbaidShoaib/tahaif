# ADR 0002 — API Backend Hosted on Railway (Trial), not Fly.io/Render

**Date:** 2026-07-22
**Status:** Accepted (revisit once the project needs to move off the one-time trial credit)

## Context

ADR 0001 named Fly.io or Render as the API host. At first-deploy time, both required
a payment method on file before provisioning *any* resource — including their
free tiers (Render: `need_payment_info` on Blueprint validation; Fly.io: no
card-free tier exists at all). The requirement for this deploy was to get the
API live with no card added anywhere.

## Decision

Deploy `apps/api` to **Railway** on its Trial plan instead:
- No credit card required to sign up or provision services.
- One-time $5 usage credit (not a recurring free tier).
- Docker-based deploys (uses `infra/Dockerfile.api` directly, via `railway.json`).
- Postgres and Redis (Key Value) provisioned as Railway services in the same
  project, connected over Railway's private network.

Config lives in `railway.json` (repo root) — `build.dockerfilePath` points at
`infra/Dockerfile.api`, build context is the repo root.

`infra/fly.toml` and `infra/render.yaml` are left in the repo (fully configured,
validated) as ready-to-use alternatives if the project later moves to a paid
host — no work lost, just not the active target.

## Consequences

- **The $5 trial credit is not permanent.** Once it's exhausted, Railway will
  pause the deployment rather than silently charge a card (none is on file).
  Monitor usage via `railway usage`; moving to a paid Railway plan or back to
  Fly.io/Render will require adding a card at that point — there is no
  card-free path to a permanently-running production backend on any of these
  three platforms as of this writing.
- Railway requires an explicit `PORT` env var to know which port to
  healthcheck/route to for Docker services — it does **not** read the
  Dockerfile's `EXPOSE` directive. `PORT=8000` is set as a service variable
  to match the hardcoded `--port 8000` in the container's start command.
- Render's free plan does not support `preDeployCommand` (migrations-before-
  traffic-shift). If a future move to Render happens, `infra/render.yaml`
  already works around this via `dockerCommand` running
  `alembic upgrade head` as part of container start instead.
- `DATABASE_URL` is built manually from Railway's `PG*` variables with the
  `postgresql+asyncpg://` scheme (Railway's own `DATABASE_URL` uses the plain
  `postgresql://` scheme, which doesn't match our async SQLAlchemy engine).
