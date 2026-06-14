# Tahaif Production Runbook

**Last updated:** 2026-06-14

---

## Service inventory

| Service | Platform | Region | URL |
|---|---|---|---|
| API | Fly.io | iad | `api.tahaif.com` |
| Web | Vercel | auto | `tahaif.com` |
| DB | Fly.io Postgres | iad | private network |
| Redis | Upstash | iad | private |
| MinIO / S3 | Fly.io volume | iad | `media.tahaif.com` |
| Meilisearch | Fly.io | iad | private |

---

## 1. Service restart

### API (Fly.io)

```bash
fly restart --app tahaif-api
fly status --app tahaif-api
fly logs --app tahaif-api --tail
```

### Web (Vercel)

Redeploy from Vercel dashboard → "Deployments" → pick latest → "Redeploy".

Or via CLI:

```bash
vercel --prod
```

---

## 2. Database backup

### Take a manual snapshot

```bash
fly postgres db backup create tahaif-db
fly postgres db backup list tahaif-db
```

### Restore from snapshot

```bash
fly postgres db restore <snapshot-id> --app tahaif-db
```

### Point-in-time restore (emergency)

Contact Fly.io support with target timestamp; they perform WAL replay.

---

## 3. Rollback procedure

### API rollback

```bash
# List recent releases
fly releases --app tahaif-api

# Roll back to a specific version
fly deploy --image registry.fly.io/tahaif-api:<version>
```

### Web rollback

Vercel dashboard → Deployments → click the previous successful deployment → "Promote to Production".

### Database migration rollback

```bash
# SSH into the Fly machine
fly ssh console --app tahaif-api

# Inside the container
cd /app
alembic downgrade <target_revision>
```

---

## 4. Key secrets and where they live

All secrets are stored in **Fly.io secrets** (for API) and **Vercel environment variables** (for web).

To view / update API secrets:

```bash
fly secrets list --app tahaif-api
fly secrets set KEY=value --app tahaif-api
```

To update web secrets: Vercel dashboard → Project → Settings → Environment Variables.

**Never commit secrets to git.** See `.env.example` for the full list of required variables.

---

## 5. On-call escalation

| Severity | Who | How |
|---|---|---|
| P0 — site down | Backend Lead | WhatsApp: +92 300 000 0001 |
| P1 — payment / order failure | Backend Lead + CEO | WhatsApp group "Tahaif Ops" |
| P2 — performance degradation | Backend Lead | Slack `#tahaif-alerts` |
| P3 — cosmetic / non-critical | Any engineer | GitHub issue |

---

## 6. Common incidents

### Duplicate orders

**Symptom:** customer receives two order confirmation emails; DB has two orders with the same idempotency key.

**Cause:** `idempotency_key` check passed twice before the first transaction committed (race condition on very high load).

**Remedy:**
1. Identify the duplicate via `SELECT * FROM orders WHERE idempotency_key = '<key>';`
2. Cancel the duplicate order (status → `cancelled`) via admin panel or direct SQL.
3. Refund if payment was captured twice.

---

### S3 proof upload failing

**Symptom:** `POST /orders/{id}/proof` returns 500.

**Check:**
```bash
fly logs --app tahaif-api | grep s3
fly secrets list --app tahaif-api | grep S3
```

**Remedy:** verify `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, and `S3_ENDPOINT_URL` are set correctly.

---

### Redis connection refused

**Symptom:** login rate-limit checks fail; auth endpoint returns 500.

**Check:**
```bash
fly redis status tahaif-redis
```

**Remedy:** restart Redis, verify `REDIS_URL` secret.

---

### Meilisearch index out of sync

**Symptom:** search returns stale or empty results.

**Remedy:** re-index from the API:

```bash
fly ssh console --app tahaif-api
python -c "import asyncio; from app.integrations.meilisearch_client import reindex_all; asyncio.run(reindex_all())"
```

---

## 7. Monitoring dashboards

- **Sentry** — errors and performance traces: `sentry.io/tahaif`
- **PostHog** — product analytics: `app.posthog.com`
- **Fly.io metrics** — CPU / memory / disk: `fly.io/apps/tahaif-api/metrics`
- **Upstash Redis** — throughput and latency: Upstash console

---

## 8. Scheduled tasks

| Task | Schedule | Where |
|---|---|---|
| FX rate refresh | Daily 00:00 UTC | `workers/fx_rate_worker.py` via arq |
| Outbox drain | Every 5 minutes | `workers/outbox_worker.py` via arq |
| DB vacuum | Weekly Sunday 03:00 UTC | Fly.io Postgres built-in |
