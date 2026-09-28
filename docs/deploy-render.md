# Dev server on Render

Free-tier dev environment:

| Piece | Service | Config |
|---|---|---|
| API | Render free web service (Docker, Singapore) | `render.yaml` |
| Web | Vercel Hobby | `apps/web` as root directory |
| Postgres 17 | Supabase free (Singapore) | session pooler URL |
| Redis | Upstash free | `rediss://` URL |
| Storage | Supabase Storage (S3 endpoint) or Cloudflare R2 | `S3_*` vars |
| Email | Resend free | `RESEND_API_KEY` |
| Jobs | GitHub Actions cron | `.github/workflows/jobs.yml` |

The free Render instance sleeps after 15 minutes idle; the first request after
that takes 30–60 s.

## 1. Domain

Login needs the web app and API on one registrable domain (the refresh cookie is
`SameSite=Lax`). Pick one, e.g.:

- web: `dev.tahaif.pk` (Vercel)
- API: `api.dev.tahaif.pk` (Render)

Without a custom domain, `*.vercel.app` + `*.onrender.com` will load pages but
login won't persist.

## 2. Supabase (Postgres + storage)

1. Project in region **Southeast Asia (Singapore)**, same as Render.
2. Project → Connect → **Session pooler** URI. Change the scheme to
   `postgresql+asyncpg://`. This is `DATABASE_URL`.
   The direct `db.<ref>.supabase.co` host is IPv6-only and unreachable from Render.
3. Storage → create bucket `tahaif-media`. Storage → Settings → S3 access keys:
   `S3_ENDPOINT_URL` = `https://<ref>.supabase.co/storage/v1/s3`, plus the key pair.

Migrations run automatically on each API start.

## 3. Upstash (Redis)

Create a Redis database in `ap-southeast-1`; copy the `rediss://` URL as `REDIS_URL`.

## 4. Render (API)

1. Render → New → **Blueprint** → select this repo. It reads `render.yaml`.
2. Fill in the prompted values from steps 2–3, `FRONTEND_URL=https://dev.tahaif.pk`,
   and the Resend key. Leave optional ones blank.
3. After the first deploy: Settings → Custom Domains → `api.dev.tahaif.pk`, then add
   the CNAME Render shows in your DNS.
4. Check `https://api.dev.tahaif.pk/api/v1/readyz` returns `{"status":"ok",...}`.
5. Seed sample data once from the service Shell: `python scripts/seed.py`.

## 5. Vercel (web)

1. New project from this repo, **Root Directory** `apps/web`.
2. Environment variables:
   - `NEXT_PUBLIC_API_URL=https://api.dev.tahaif.pk/api/v1`
   - `NEXT_PUBLIC_SITE_URL=https://dev.tahaif.pk`
3. Add domain `dev.tahaif.pk`.

## 6. Scheduled jobs

Repository → Settings → Secrets and variables → Actions:

- `JOBS_API_URL` = `https://api.dev.tahaif.pk/api/v1`
- `JOBS_TOKEN` = the `JOBS_TOKEN` value Render generated (Environment tab)

`jobs.yml` then drains the notification outbox every 15 minutes and refreshes FX
rates daily. Trigger it by hand from the Actions tab to test.
