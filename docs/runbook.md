# Tahaif Production Runbook

**Last updated:** 2026-10-14

---

## Service inventory

Everything runs on one VPS with Docker Compose (ADR 0007).

| Service | Where | Notes |
|---|---|---|
| VPS | DigitalOcean droplet `139.59.80.229` — Ubuntu 24.04, 2 vCPU / 2 GB RAM (+2 GB swap) / 58 GB | SSH as `root`; firewall (ufw) allows only 22, 80, 443 |
| Site (brand: Bouquet Bar, set in `.env.prod`) | `https://139-59-80-229.sslip.io` | **Temporary hostname** until `bouquetbar.pk` resolves — see §1 "Changing the domain" |
| Caddy | container `caddy` | TLS (Let's Encrypt), routes `/api/*` → api, `/tahaif-media/*` → minio, rest → web |
| Web | container `web` | Next.js standalone |
| API + worker | container `api` | migrations run on start; arq worker runs inside (`RUN_WORKER_IN_API=1`) |
| DB | container `postgres` (16) | volume `tahaif_postgres_data` |
| Redis | container `redis` (7, AOF on) | volume `tahaif_redis_data` |
| Meilisearch | container `meilisearch` (pinned `v1.46.1`) | volume `tahaif_meilisearch_data` |
| Object storage | container `minio` | private bucket `tahaif-media`, volume `tahaif_minio_data` |

Code lives in `/opt/tahaif` on the server; settings in `/opt/tahaif/.env.prod`
(mode 600, never in git; template `infra/env.prod.example`).

All commands below run on the server from `/opt/tahaif`, with:

```bash
alias dc='docker compose --env-file .env.prod -f infra/docker-compose.prod.yml'
```

`railway.json`, `infra/fly.toml` and `infra/render.yaml` are kept as alternatives
(ADR 0002); the Railway and Vercel deployments are no longer the active target.

---

## 1. Deploy, restart, logs

Deploy from a workstation (ships a git ref, rebuilds, restarts; only committed code):

```bash
infra/deploy.sh root@139.59.80.229          # HEAD
infra/deploy.sh root@139.59.80.229 <ref>    # any commit or tag
```

A fresh server needs `ssh root@host 'bash -s' < infra/vps-setup.sh` and an
`.env.prod` first.

```bash
dc ps                          # health of every service
dc logs -f --tail=100 api      # or web, caddy, postgres, ...
dc restart api                 # restart without rebuilding
dc up -d                       # apply .env.prod changes to the API
```

`NEXT_PUBLIC_*` values (brand name, site URL, ...) are baked into the web image.
After changing them, re-run `infra/deploy.sh`, or on the server:

```bash
WEB_ENV_HASH=$(grep '^NEXT_PUBLIC_' .env.prod | sha256sum | cut -c1-16) dc up -d --build
```

A plain `dc up -d --build` reuses the cached web build and keeps the old values.

### Changing the domain

1. Point the new domain's A record at the server and wait until it resolves.
2. In `.env.prod` set `DOMAIN`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL` (and `EMAIL_FROM`).
3. Rebuild with the `WEB_ENV_HASH=… dc up -d --build` command above — Caddy fetches the new certificate on start.

Links already stored for uploaded proofs keep working: they are re-signed from the object key.

---

## 2. Database backup

Nothing is backed up automatically yet. Take a dump and **copy it off the server**:

```bash
mkdir -p /opt/tahaif-backups
dc exec -T postgres pg_dump -U tahaif -Fc tahaif > /opt/tahaif-backups/tahaif-$(date +%F).dump
```

Nightly at 21:00 UTC, keeping 14 days (`crontab -e` as root):

```cron
0 21 * * * cd /opt/tahaif && docker compose --env-file .env.prod -f infra/docker-compose.prod.yml exec -T postgres pg_dump -U tahaif -Fc tahaif > /opt/tahaif-backups/tahaif-$(date +\%F).dump && find /opt/tahaif-backups -name '*.dump' -mtime +14 -delete
```

Restore:

```bash
dc exec -T postgres pg_restore -U tahaif -d tahaif --clean < /opt/tahaif-backups/tahaif-<date>.dump
```

Uploaded media lives in the `tahaif_minio_data` volume; back it up with the droplet
(DigitalOcean backups/snapshots) or `docker run --rm -v tahaif_minio_data:/d -v /opt/tahaif-backups:/b alpine tar czf /b/media-$(date +%F).tgz -C /d .`

---

## 3. Rollback procedure

Redeploy the last good commit:

```bash
infra/deploy.sh root@139.59.80.229 <good-commit>
```

Database migration rollback (before rolling the code back past the migration):

```bash
dc exec api alembic downgrade <target_revision>
```

---

## 4. Key secrets and where they live

Everything is in `/opt/tahaif/.env.prod` on the server. `SECRET_KEY`,
`POSTGRES_PASSWORD`, `MEILISEARCH_MASTER_KEY` and `MINIO_ROOT_PASSWORD` were generated
on the server and exist nowhere else — include the file in off-server backups.

Changing `POSTGRES_PASSWORD` or `MINIO_ROOT_PASSWORD` in the file does not change an
existing volume's password; change it inside the service first.

**Never commit secrets to git.**

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
dc logs --tail=200 api | grep s3_
dc ps minio caddy
```

**Remedy:** the API uploads through Caddy at `https://$DOMAIN` (the same host the
signed links use), so both `minio` and `caddy` must be up and the certificate valid.
`dc up -d minio-init` recreates the bucket if it is missing.

---

### Redis connection refused

**Symptom:** readiness probe fails and the API logs `ip_ban_check_skipped` /
`failed_login_not_recorded` warnings. Login keeps working: the brute-force IP ban
fails open while Redis is down, and request rate limits fall back to per-process
counters, so limits are temporarily per worker rather than shared.

**Check:**
```bash
dc ps redis
dc logs --tail=50 redis
```

**Remedy:** `dc restart redis`. Redis runs with append-only persistence, so guest
carts and rate-limit counters (key prefix `tahaif-rl`) survive a restart.

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
dc exec api python scripts/reindex_search.py     # prints "Indexed N products"
```

Run it once after the first products are added, and after a Meilisearch upgrade.

Locally, `start.sh` runs the same script on every start. If it warns that the
index was not built, check that `MEILISEARCH_MASTER_KEY` in `.env` matches the
container (Compose is started with `--env-file .env` for this reason).

---

### Background worker (notifications, FX rates)

The container start script (`apps/api/scripts/start-api.sh`) runs migrations,
starts `arq app.workers.main.WorkerSettings` in the background (restarting it if
it exits), then serves the API. The worker:

- sends queued order confirmations every 15 seconds; each message is claimed,
  sent and committed on its own, failures retry on later runs, and after 3
  attempts the row is marked `failed` with `last_error`;
- refreshes FX rates daily at 01:00 UTC and once on start (needs
  `OPEN_EXCHANGE_RATES_APP_ID`).

Cron jobs take a Redis lock, so one worker per replica never double-sends. To run
it as its own service, set `RUN_WORKER_IN_API=0` on the API and start a second
service from the same image with `arq app.workers.main.WorkerSettings`.

Stuck messages:

```sql
SELECT channel, status, attempts, left(last_error, 80), count(*)
FROM notifications_outbox GROUP BY 1,2,3,4;
```

Unconfigured providers fail loudly (e.g. `Twilio credentials are not configured`)
rather than being marked sent.

### Client IPs behind the proxy

Set `TRUSTED_PROXY_HOPS` to the number of proxies that append to
`X-Forwarded-For`: **1 on the VPS** (Caddy; the Compose file's default), 2 if
Cloudflare proxies in front (set `TRUSTED_PROXY_HOPS=2` in `.env.prod`). Wrong values either lump every buyer into one
rate-limit bucket (too low) or let clients spoof their IP (too high).

---

## 7. Monitoring dashboards

- **Sentry** — not yet configured (`SENTRY_DSN` unset)
- **PostHog** — not yet configured (`NEXT_PUBLIC_POSTHOG_KEY` unset on web)
- **Server** — `docker stats` for per-container CPU/memory, `df -h /` for disk; DigitalOcean's droplet graphs for history
- No uptime alerting yet: nothing notifies anyone if the site goes down

---

## 8. Scheduled tasks

| Task | Schedule | Where |
|---|---|---|
| FX rate refresh | Daily 01:00 UTC and on start | arq worker inside the `api` container (needs `OPEN_EXCHANGE_RATES_APP_ID`) |
| Outbox drain | Every 15 seconds | same worker |
| DB backup | Nightly, once the cron line in §2 is installed | root crontab on the VPS |
| DB vacuum | Managed by Postgres | autovacuum defaults |

---

## 9. Loading or updating the catalog

Products come from a `catalog.json` (format and rules: `docs/catalog-template.md`).
The loader validates the whole file first, matches everything by slug and updates in
place, so re-running it is safe. It never deletes: to retire a product, deactivate it.

```bash
docker cp catalog.json tahaif-api-1:/tmp/catalog.json
dc exec api python scripts/load_catalog.py /tmp/catalog.json --check   # validate only
dc exec api python scripts/load_catalog.py /tmp/catalog.json
dc exec api python scripts/reindex_search.py
```

Listing pages are cached for about a minute, so new products appear shortly after.
To create the admin named in the file, add `-e ADMIN_PASSWORD=...` to the `exec`;
an existing account with that email is promoted and keeps its password.

The live shop currently holds the **sample** catalog
(`apps/api/scripts/examples/catalog.sample.json`, 65 products named "SAMPLE …").
Before launch, deactivate them: `update products set is_active = false where slug like 'sample-%';`
then reindex.

---

## 10. Running the E2E suite locally

The Playwright specs in `apps/web/tests/` need the real stack; they don't mock the API.

```bash
docker compose -f infra/docker-compose.yml up -d
cd apps/api
uv run alembic upgrade head && uv run python scripts/seed.py
# TESTING=1 turns off the rate limiter. Without it, registration is capped at
# 10/hour per IP and a few runs start failing with "Too many requests".
TESTING=1 uv run uvicorn app.main:app --port 8000

cd ../web
pnpm build && pnpm start -p 3000     # a production build; `next dev` is slower and flakier
pnpm exec playwright install chromium  # once; or run with channel "chrome" to use installed Chrome
pnpm exec playwright test
```

Expect 8 passed and 1 skipped: "vendor can mark fulfillment as dispatched" skips
unless the seed has a pending fulfilment and a vendor login (`E2E_VENDOR_EMAIL` /
`E2E_VENDOR_PASSWORD`).

Never run the API with `TESTING=1` outside local testing.

## Email (Resend)

Signup verification codes, password resets and order emails go through Resend.
Without `RESEND_API_KEY` the API only logs codes (`email_verification_code`) — fine
locally, but in production nobody can verify, and signed-in checkout is blocked
while `REQUIRE_VERIFIED_EMAIL_FOR_CHECKOUT=true`.

1. Create an account at resend.com.
2. **Domains → Add domain** — use a domain you own (e.g. `mail.bouquetbar.pk`). Resend
   cannot send from `*.sslip.io`.
3. Add the DNS records Resend shows (SPF `TXT`, DKIM `TXT`/`CNAME`, MX for bounces;
   DMARC `TXT` recommended) at your DNS host / Cloudflare (DNS only, not proxied),
   then click **Verify**.
4. **API Keys → Create** with *Sending access*, limited to that domain.
5. On the server, edit `/opt/tahaif/.env.prod`:
   `RESEND_API_KEY=re_…` and `EMAIL_FROM="Bouquet Bar <noreply@mail.bouquetbar.pk>"`.
6. Recreate the API container so it re-reads env (`infra/deploy.sh`, or
   `docker compose -f infra/docker-compose.prod.yml up -d api worker`).
7. Test: register a throwaway address, confirm the code arrives, check Resend → Logs.

Until a domain is verified, `REQUIRE_VERIFIED_EMAIL_FOR_CHECKOUT=false` keeps
signed-in checkout open.

## WhatsApp ordering bot

Customers order inside WhatsApp (ADR 0013). One-time setup, about an hour plus Meta's review:

1. **Meta Business account** (business.facebook.com), verified with the business documents.
2. **App**: developers.facebook.com → Create app → *Business* → add the **WhatsApp** product.
3. **Phone number**: WhatsApp → API Setup → add the number the bot will use. It must
   not be registered in the WhatsApp phone app, unless you onboard the Business app
   number with Meta's coexistence option so staff keep the app on the same number.
   Copy its **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
4. **Permanent token**: Business settings → System users → add an admin system user →
   assign the app and the WhatsApp account → *Generate token* with
   `whatsapp_business_messaging` and `whatsapp_business_management`, never expiring →
   `WHATSAPP_ACCESS_TOKEN`. (The 24-hour token on the API Setup page is for testing only.)
5. **App secret**: App settings → Basic → App secret → `WHATSAPP_APP_SECRET`.
6. **Webhook**: pick any long random string → `WHATSAPP_VERIFY_TOKEN`, set
   `WHATSAPP_BOT_ENABLED=true`, deploy, then WhatsApp → Configuration → Webhook:
   callback URL `https://<api-domain>/api/v1/whatsapp/webhook`, the same verify token,
   *Verify and save*, then subscribe to the **messages** field.
7. Optional: `WHATSAPP_TEAM_NUMBER` = the team's WhatsApp Business app number, sent to
   customers who type *help*.
8. **Bank details in the chat**: `BANK_ACCOUNT_NAME` and `BANK_IBAN` (the same account as
   the website's `NEXT_PUBLIC_BANK_*`). Without them the bot points to the order page.
9. **Catalog** (optional but recommended):
   1. business.facebook.com → Commerce Manager → *Add catalog* → *E-commerce* → upload
      product info yourself.
   2. Catalog → *Data sources* → *Data feed* → *Scheduled feed*, URL
      `https://<api-domain>/api/v1/whatsapp/catalog.csv`, **hourly**, currency PKR.
      Prices, stock and new products then follow the admin within an hour.
   3. WhatsApp Manager → your number → *Catalog* → choose this catalog and turn on
      *Show catalog* and *Show cart*.
   4. Copy the catalog's ID (Commerce Manager → Settings) → `WHATSAPP_CATALOG_ID`, deploy.
   Products need a photo to be listed (Meta requires one). Meta reviews new items; a
   rejected item shows in Commerce Manager → *Issues*.
10. Test: message the number "hi" from your phone, add two gifts to the cart, place a
    bank-transfer order, send a photo as the receipt, then approve it in the admin and
    check the "payment received" message arrives. Cancel the order afterwards.

Point the website's `NEXT_PUBLIC_SUPPORT_WHATSAPP` at the bot number so "Order on
WhatsApp" on product pages starts the bot with that gift already chosen.

**Receipts in WhatsApp:** a photo or PDF the customer sends is attached to their latest
bot order still waiting for a receipt, and the order shows *awaiting verification* in
the admin as for website uploads. Verify it against the bank app as usual (SOP §3); the
customer is told the result in the chat.

**Bot not replying:** check API logs for `whatsapp_send_failed` (bad or expired
token: status 401; number not registered: 400) and `whatsapp_message_failed`
(an error in the bot; the customer was told to try again). A 401 on the webhook
itself means `WHATSAPP_APP_SECRET` doesn't match the app. Turn the bot off with
`WHATSAPP_BOT_ENABLED=false`; orders already placed are unaffected.

## Card note reports

Reported voice/video notes appear in **Admin → Reported notes** (log event `card_note_reported`).
For each note, listen to it and read the reports, then:

- **Take note down**: the card's QR link stops playing it. The recording and reports are kept as evidence, and
  the buyer can't undo it by uploading again. **Restore note** reverses it.
- **Nothing wrong, dismiss**: closes the reports; the note keeps playing.

Aim to act within 24 hours. Treat PTA/FIA requests as urgent: take the note down first, then send them the
recording, the reports and the buyer's consent record (time and IP, shown on the card).
