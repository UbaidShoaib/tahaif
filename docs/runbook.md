# Tahaif Production Runbook

**Last updated:** 2026-07-22

---

## Service inventory

| Service | Platform | Region | URL |
|---|---|---|---|
| API | Railway (Trial — no card; see ADR 0002) | Singapore (`sfo` builder, service region auto) | `tahaif-api-production.up.railway.app` |
| Web | Vercel | auto | `tahaif-web.vercel.app` (Preview; production cutover pending) |
| DB | Railway Postgres | same project | private network (`postgres.railway.internal`) |
| Redis | Railway Key Value | same project | private network (`redis.railway.internal`) |
| MinIO / S3 | **not yet provisioned** | — | proof-of-payment upload is non-functional until set up |
| Meilisearch | **not yet provisioned** | — | search works through the database fallback until set up |

`infra/fly.toml` and `infra/render.yaml` are kept in the repo, fully configured
and validated, as ready alternatives if the project moves to a paid host later.

---

## 1. Service restart

### API (Railway)

```bash
railway redeploy --service tahaif-api --yes   # restart without rebuilding
railway logs --service tahaif-api --deployment --latest
railway status --json
```

### Web (Vercel)

Redeploy from Vercel dashboard → "Deployments" → pick latest → "Redeploy".

Or via CLI:

```bash
vercel --prod
```

---

## 2. Database backup

Railway's free Postgres plugin does not include managed automated backups.
Take manual snapshots via `pg_dump` against the public connection string
(`railway variable list --service Postgres --kv` for `DATABASE_PUBLIC_URL`):

```bash
pg_dump "$DATABASE_PUBLIC_URL" -Fc -f tahaif-backup-$(date +%F).dump
```

Restore:

```bash
pg_restore -d "$DATABASE_PUBLIC_URL" --clean tahaif-backup-<date>.dump
```

---

## 3. Rollback procedure

### API rollback

```bash
railway deployment list --service tahaif-api --json   # find a prior SUCCESS deployment id
railway redeploy --service tahaif-api --yes            # re-runs the latest; for an older
                                                        # deployment, use the dashboard's
                                                        # "Redeploy" on that specific deployment
```

### Web rollback

Vercel dashboard → Deployments → click the previous successful deployment → "Promote to Production".

### Database migration rollback

```bash
railway ssh --service tahaif-api
# Inside the container
cd /app/apps/api
alembic downgrade <target_revision>
```

---

## 4. Key secrets and where they live

All secrets are stored in **Railway service variables** (for API) and **Vercel environment variables** (for web).

To view / update API variables:

```bash
railway variable list --service tahaif-api --kv
railway variable set KEY=value --service tahaif-api
```

To update web variables: Vercel dashboard → Project → Settings → Environment Variables,
or `vercel env add KEY <environment>`.

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

**Status:** expected until S3/MinIO is provisioned — `S3_*` variables are currently unset.

**Check:**
```bash
railway logs --service tahaif-api --filter "s3"
railway variable list --service tahaif-api --kv | grep S3
```

**Remedy:** provision an S3-compatible bucket (AWS S3 or Cloudflare R2) and set
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `S3_ENDPOINT_URL`, `S3_PUBLIC_URL`.

---

### Redis connection refused

**Symptom:** login rate-limit checks fail; auth endpoint returns 500.

**Check:**
```bash
railway logs --service Redis --deployment --latest
railway variable list --service tahaif-api --kv | grep REDIS_URL
```

**Remedy:** restart the Redis service (`railway redeploy --service Redis --yes`), verify `REDIS_URL`.

Note: Railway's free Key Value plan is in-memory only — data (including rate-limit
counters) is lost on any restart. Not an issue for correctness, only for state continuity.

---

### Meilisearch index out of sync

**Symptoms:** a product is missing from search, or deactivated products still
match. `/search` never shows inactive products (results are re-read from the
database), so stale entries only cost ranking, not correctness.

**Fallback:** if Meilisearch is unset, unreachable or rejects the key, `/search`
logs `search_fallback_to_db` and matches name, description and vendor name in
Postgres. Search keeps working, with simpler ranking.

**Remedy:** rebuild the index. It is idempotent: it applies the index settings
(searchable and filterable attributes) and upserts every active product.

```bash
railway ssh --service tahaif-api
uv run python scripts/reindex_search.py     # prints "Indexed N products"
```

Locally, `start.sh` runs the same script on every start. If it warns that the
index was not built, check that `MEILISEARCH_MASTER_KEY` in `.env` matches the
container (Compose is started with `--env-file .env` for this reason).

---

## 7. Monitoring dashboards

- **Sentry** — not yet configured (`SENTRY_DSN` unset)
- **PostHog** — not yet configured (`NEXT_PUBLIC_POSTHOG_KEY` unset on web)
- **Railway metrics** — CPU / memory / network per service: `railway.com` project dashboard, or `railway metrics --service tahaif-api`
- **Railway usage** — trial credit remaining: `railway usage`

---

## 8. Scheduled tasks

| Task | Schedule | Where |
|---|---|---|
| FX rate refresh | Daily 00:00 UTC | `workers/fx_rate_worker.py` via arq — **not yet scheduled on Railway; needs a cron-triggered job or always-on worker** |
| Outbox drain | Every 5 minutes | `workers/outbox_worker.py` via arq — **same; not yet scheduled** |
| DB vacuum | Managed by Postgres | Railway Postgres template handles autovacuum by default |
