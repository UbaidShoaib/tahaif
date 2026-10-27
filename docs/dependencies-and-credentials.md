# Tahaif — Dependencies, Credentials & Setup Guide

**Last updated:** 2026-06-15

This document covers every external service, credential, and environment variable the platform needs — including how to obtain each one, whether it's free or paid, and the account creation procedure.

---

## Quick Reference: Cost Summary

| Service | Free Tier | Paid? | Notes |
|---|---|---|---|
| PostgreSQL (Docker) | Free | No | Self-hosted |
| Redis (Docker) | Free | No | Self-hosted |
| Meilisearch (Docker) | Free | No | Self-hosted |
| MinIO (Docker) | Free | No | Self-hosted (dev) |
| MailHog (Docker) | Free | No | Dev-only email sink |
| Stripe | Free account | Transaction fees | 2.9% + $0.30/transaction |
| JazzCash | Free account | Per-transaction | Pakistan only; merchant agreement required |
| EasyPaisa | Free account | Per-transaction | Pakistan only; merchant agreement required |
| Twilio | Free trial ($15 credit) | Yes after trial | ~$0.0075/SMS, ~$0.005/WhatsApp msg |
| Meta WhatsApp Cloud API | Free to set up | Per message after 1,000 free a month | Shopping bot (ADR 0013); about USD 0.015 a message in Pakistan (check Meta's rate card) |
| Resend | Free up to 3,000/month | Yes above free tier | Free tier sufficient for dev/small prod |
| Google OAuth | Free | No | Google Cloud project required |
| Open Exchange Rates | Free (1,000 req/month) | Yes above free tier | Free tier sufficient |
| Sentry | Free up to 5,000 errors/month | Yes above free tier | Free tier sufficient for early prod |
| PostHog | Free up to 1M events/month | Yes above free tier | Free tier sufficient for early prod |
| AWS S3 (prod) | Free 5GB first year | Yes after free tier | ~$0.023/GB/month |

---

## Part 1 — Self-Hosted Services (Docker)

These run locally via `docker compose up` — no accounts or credentials needed beyond what's already set in `.env.example`.

### PostgreSQL 16

- **Purpose:** Primary relational database
- **Local port:** `5433` (mapped from container `5432`)
- **Cost:** Free (open source)
- **Setup:** Already configured in `infra/docker-compose.yml`. No action needed.
- **Env vars:**
  ```
  DATABASE_URL=postgresql+asyncpg://tahaif_user:tahaif_dev_password@localhost:5433/tahaif
  ```
- **Production:** Use a managed service (Supabase, Neon, Railway, RDS). They provide a `DATABASE_URL` in their dashboard.

---

### Redis 7

- **Purpose:** Session cache, guest cart storage, rate-limit counters, arq task queue
- **Local port:** `6380` (mapped from container `6379`)
- **Cost:** Free (open source)
- **Setup:** Already configured. No action needed.
- **Env vars:**
  ```
  REDIS_URL=redis://localhost:6380/0
  ```
- **Production:** Use Upstash Redis (free tier: 10,000 commands/day) or Redis Cloud.

---

### Meilisearch

- **Purpose:** Full-text product search with typo tolerance and filters
- **Local port:** `7700`
- **Cost:** Free (open source; Meilisearch Cloud is paid)
- **Setup:** Already configured. Set any random string as the master key.
- **Env vars:**
  ```
  MEILISEARCH_URL=http://localhost:7700
  MEILISEARCH_MASTER_KEY=any_random_string_you_choose
  ```
- **Search-only key:** After starting Meilisearch, generate a search-only key for the frontend:
  ```bash
  curl -X POST 'http://localhost:7700/keys' \
    -H 'Authorization: Bearer YOUR_MASTER_KEY' \
    -H 'Content-Type: application/json' \
    --data '{"description":"Search key","actions":["search"],"indexes":["*"],"expiresAt":null}'
  ```
  Copy the `key` value from the response into:
  ```
  NEXT_PUBLIC_MEILISEARCH_SEARCH_KEY=the_key_from_above
  ```
- **Production:** Deploy Meilisearch on a VPS or use Meilisearch Cloud.

---

### MinIO (Object Storage)

- **Purpose:** S3-compatible local object storage for product images and media
- **Local ports:** `9000` (API), `9001` (MinIO Console web UI)
- **Cost:** Free (open source)
- **Setup:** Already configured. Default credentials are `minioadmin` / `minioadmin`.
- **Create the bucket manually** (one-time, after first `docker compose up`):
  1. Open `http://localhost:9001` in your browser
  2. Login with `minioadmin` / `minioadmin`
  3. Go to **Buckets → Create Bucket**
  4. Name it `tahaif-media`
  5. Set **Access Policy** to `public` (so uploaded images are served publicly)
- **Env vars:**
  ```
  S3_ENDPOINT_URL=http://localhost:9000
  S3_ACCESS_KEY_ID=minioadmin
  S3_SECRET_ACCESS_KEY=minioadmin
  S3_BUCKET_NAME=tahaif-media
  S3_PUBLIC_URL=http://localhost:9000/tahaif-media
  ```
- **Production:** Replace with real AWS S3 (see Part 3 — AWS S3).

---

### MailHog (Dev Email Sink)

- **Purpose:** Catches all outbound emails locally so nothing real is sent during development
- **Local ports:** `1025` (SMTP), `8025` (Web UI to read caught emails)
- **Cost:** Free
- **Setup:** Already configured. Open `http://localhost:8025` to read emails.
- **Production:** Replace with Resend (see Part 2).

---

## Part 2 — Third-Party Services

### Stripe (Card Payments)

- **Purpose:** International card payments (Visa, Mastercard) for diaspora buyers
- **Cost:** No monthly fee. Transaction fee: **2.9% + $0.30** per successful charge (varies by country)
- **Free to sign up:** Yes
- **Account creation:**
  1. Go to [dashboard.stripe.com/register](https://dashboard.stripe.com/register)
  2. Create account with your email
  3. You can use test mode immediately — no business verification needed for testing
  4. For live payments, complete identity verification and provide business details
- **Getting credentials:**
  1. In the Stripe Dashboard, go to **Developers → API keys**
  2. Copy **Publishable key** (`pk_test_...` in test mode, `pk_live_...` in production)
  3. Copy **Secret key** (`sk_test_...` or `sk_live_...`) — click "Reveal live key" for production
  4. For the webhook secret: go to **Developers → Webhooks → Add endpoint**
     - URL: `https://yourdomain.com/api/v1/payments/stripe/webhook`
     - Events to listen for: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
     - After creating, click the webhook → **Signing secret** → copy it
- **Env vars:**
  ```
  STRIPE_SECRET_KEY=sk_test_...
  STRIPE_PUBLISHABLE_KEY=pk_test_...
  STRIPE_WEBHOOK_SECRET=whsec_...
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
  ```
- **Local webhook testing:** Use the Stripe CLI to forward webhooks to localhost:
  ```bash
  stripe listen --forward-to localhost:8000/api/v1/payments/stripe/webhook
  ```

---

### JazzCash (Pakistan Mobile Wallet)

- **Purpose:** Pakistan-local payment via JazzCash mobile wallet and debit cards
- **Cost:** Per-transaction fee (negotiated with JazzCash; typically 1–2%)
- **Free to sign up:** No — requires a formal merchant agreement
- **Account creation:**
  1. Visit [jazzcash.com.pk](https://jazzcash.com.pk) → **Business Solutions**
  2. Submit a merchant application form (requires: business registration, CNIC, bank account)
  3. JazzCash team reviews and approves (can take 5–10 business days)
  4. Upon approval you receive merchant credentials via email
- **Getting credentials:** Provided by JazzCash after merchant account approval
- **Env vars:**
  ```
  JAZZCASH_MERCHANT_ID=your_merchant_id
  JAZZCASH_PASSWORD=your_merchant_password
  JAZZCASH_INTEGRITY_SALT=your_integrity_salt
  ```
- **Development:** JazzCash provides a sandbox environment — request sandbox credentials from your JazzCash account manager.

---

### EasyPaisa (Pakistan Mobile Wallet)

- **Purpose:** Pakistan-local payment via EasyPaisa mobile wallet
- **Cost:** Per-transaction fee (negotiated; typically 1–1.5%)
- **Free to sign up:** No — requires a formal merchant agreement
- **Account creation:**
  1. Visit [easypaisa.com.pk](https://easypaisa.com.pk) → **Business / Merchant Services**
  2. Fill the merchant onboarding form (requires: NTN, CNIC, bank account)
  3. Telenor / EasyPaisa team reviews and approves (5–15 business days)
  4. Credentials sent after approval
- **Getting credentials:** Provided by EasyPaisa after merchant approval
- **Env vars:**
  ```
  EASYPAISA_STORE_ID=your_store_id
  EASYPAISA_STORE_PASSWORD=your_store_password
  ```
- **Development:** Request sandbox/staging credentials from your EasyPaisa account manager.

---

### Twilio (WhatsApp & SMS Notifications)

- **Purpose:** Order confirmation, status updates, and OTPs via WhatsApp and SMS
- **Cost:** Free trial with ~$15 credit. After that: ~$0.0075/SMS, ~$0.005/WhatsApp message. Phone numbers: ~$1/month.
- **Free to sign up:** Yes (trial credit included)
- **Account creation:**
  1. Go to [twilio.com/try-twilio](https://www.twilio.com/try-twilio)
  2. Sign up with email and verify your phone number
  3. You're on the free trial immediately
  4. For production: add billing details and upgrade
- **Getting credentials:**
  1. In the Twilio Console dashboard, your **Account SID** and **Auth Token** are shown on the home screen
  2. For an SMS number: go to **Phone Numbers → Manage → Buy a number** → search for a Pakistani number or US number
  3. For WhatsApp (dev sandbox): go to **Messaging → Try it out → Send a WhatsApp message** — you get a sandbox number (`+14155238886`) and a join code
  4. For WhatsApp (production): apply for a WhatsApp Business Account via Twilio — goes through Meta approval (can take 1–4 weeks)
- **Env vars:**
  ```
  TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  TWILIO_AUTH_TOKEN=your_auth_token
  TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
  TWILIO_SMS_FROM=+1234567890
  ```

---

### Meta WhatsApp Cloud API (Ordering bot)

- **Purpose:** Customers browse the catalog, order and send bank receipts inside WhatsApp (ADR 0013)
- **Cost:** No setup or monthly fee. From 1 October 2026 the first 1,000 service messages (replies
  within 24 hours of the customer's last message) per number per month are free, then about
  USD 0.015 each in Pakistan; templates outside that window are charged per message. About
  USD 0.20–0.25 per bot order after the free allowance. Check Meta's pricing page before budgeting
- **Account creation and credentials:** step by step in [runbook.md](runbook.md), "WhatsApp ordering bot"
- **Env vars:**
  ```
  WHATSAPP_BOT_ENABLED=true
  WHATSAPP_PHONE_NUMBER_ID=123456789012345
  WHATSAPP_ACCESS_TOKEN=EAAG...            # system user token, never expiring
  WHATSAPP_APP_SECRET=abc123...            # App settings → Basic
  WHATSAPP_VERIFY_TOKEN=any-long-random-string
  WHATSAPP_TEAM_NUMBER=+923001234567       # optional: sent when a customer types "help"
  WHATSAPP_CATALOG_ID=123456789012345      # optional: Commerce Manager catalog fed from /api/v1/whatsapp/catalog.csv
  BANK_ACCOUNT_NAME="Tahaif Gifts, MCB Bank"
  BANK_IBAN=PK36MUCB0000001234567890
  ```

---

### Resend (Transactional Email)

- **Purpose:** Order confirmation emails, password resets, vendor notifications
- **Cost:** Free up to **3,000 emails/month** and 100/day. Paid plans start at $20/month for 50,000 emails.
- **Free to sign up:** Yes
- **Account creation:**
  1. Go to [resend.com](https://resend.com) → **Get Started**
  2. Sign up with GitHub or email
  3. Verify your email
- **Getting credentials:**
  1. In the Resend Dashboard, go to **API Keys → Create API Key**
  2. Give it a name (e.g. `tahaif-production`) and set permissions to **Full Access**
  3. Copy the key — it starts with `re_`
  4. **Verify your sending domain:** go to **Domains → Add Domain** → enter `tahaif.com`
     - Add the DNS records shown (SPF, DKIM, DMARC) to your domain registrar
     - Without this, emails go to spam or are blocked
- **Env vars:**
  ```
  RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  EMAIL_FROM=noreply@tahaif.com
  ```
- **Development:** Use any email address — emails are caught by MailHog locally and never actually sent.

---

### Google OAuth (Social Login)

- **Purpose:** "Sign in with Google" for buyers
- **Cost:** Completely free
- **Account creation:** Requires a Google account (personal or workspace)
- **Setup procedure:**
  1. Go to [console.cloud.google.com](https://console.cloud.google.com)
  2. Click **Select a project → New Project** → name it `tahaif`
  3. In the left sidebar: **APIs & Services → OAuth consent screen**
     - User Type: **External**
     - Fill in App name (`Tahaif`), support email, developer email
     - Scopes: add `email` and `profile`
     - Save
  4. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
     - Application type: **Web application**
     - Name: `Tahaif API`
     - Authorized redirect URIs:
       - `http://localhost:8000/api/v1/auth/oauth/google/callback` (development)
       - `https://api.tahaif.com/api/v1/auth/oauth/google/callback` (production)
     - Click **Create**
  5. Copy the **Client ID** and **Client Secret** from the dialog
- **Env vars:**
  ```
  GOOGLE_CLIENT_ID=xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
  GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx
  GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/oauth/google/callback
  ```

---

### Open Exchange Rates (FX / Multi-Currency)

- **Purpose:** Daily foreign exchange rates for USD/GBP/EUR/CAD/AUD/AED/SAR → PKR conversion
- **Cost:** Free tier: **1,000 API calls/month** (more than enough — we fetch once per day). Paid plans from $12/month.
- **Free to sign up:** Yes
- **Account creation:**
  1. Go to [openexchangerates.org/signup/free](https://openexchangerates.org/signup/free)
  2. Enter name and email, verify email
  3. You get an App ID immediately
- **Getting credentials:**
  1. Log in → Dashboard shows your **App ID** directly on the home screen
- **Env vars:**
  ```
  OPENEXCHANGERATES_APP_ID=your_app_id_here
  ```

---

### Sentry (Error Monitoring)

- **Purpose:** Tracks runtime errors, exceptions, and performance issues in both API and frontend
- **Cost:** Free up to **5,000 errors/month** and 10,000 performance transactions. Paid from $26/month.
- **Free to sign up:** Yes
- **Account creation:**
  1. Go to [sentry.io/signup](https://sentry.io/signup)
  2. Sign up with GitHub or email
  3. Create an **Organization** (e.g. `tahaif`)
- **Getting credentials:**
  1. Create a **Project** for the backend: **Projects → Create Project → Python (FastAPI)**
  2. Create a second **Project** for the frontend: **Next.js**
  3. After creating each project, Sentry shows a **DSN** — copy it
     - The DSN format is: `https://xxxxxxxx@oXXXXXX.ingest.sentry.io/XXXXXXX`
  4. Use the **backend DSN** for `SENTRY_DSN` in the API
  5. Use the **frontend DSN** in your Next.js Sentry config (if adding frontend Sentry separately)
- **Env vars:**
  ```
  SENTRY_DSN=https://xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@oXXXXXX.ingest.sentry.io/XXXXXXX
  ENVIRONMENT=development
  ```
- **Note:** Leave `SENTRY_DSN` empty in development to avoid noise.

---

### PostHog (Product Analytics)

- **Purpose:** User event tracking, funnel analysis, feature flags, session replay
- **Cost:** Free up to **1,000,000 events/month**. Paid above that.
- **Free to sign up:** Yes
- **Account creation:**
  1. Go to [app.posthog.com/signup](https://app.posthog.com/signup)
  2. Sign up with email or GitHub
  3. Create an **Organization** and **Project** (e.g. `tahaif-production`)
- **Getting credentials:**
  1. In the PostHog dashboard: **Project Settings → Project API key**
  2. Copy the key (starts with `phc_`)
- **Env vars:**
  ```
  NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
  ```

---

## Part 3 — Production-Only Services

### AWS S3 (Production Object Storage)

- **Purpose:** Replaces MinIO in production for storing product images and media files
- **Cost:** Free tier: 5 GB for 12 months. After that: ~$0.023/GB/month storage + $0.09/GB data transfer out.
- **Free to sign up:** Yes (requires credit card for identity verification)
- **Account creation:**
  1. Go to [aws.amazon.com](https://aws.amazon.com) → **Create an AWS Account**
  2. Enter email, account name, credit card (won't be charged during free tier)
  3. Choose **Basic Support** (free)
- **Setup procedure:**
  1. In the AWS Console: go to **S3 → Create bucket**
     - Bucket name: `tahaif-media` (must be globally unique — append a random suffix if taken)
     - Region: choose closest to Pakistan, e.g. `ap-south-1` (Mumbai)
     - Uncheck **Block all public access** for the media bucket
     - Create bucket
  2. Set a bucket policy to allow public read (for serving images publicly)
  3. Go to **IAM → Users → Create user**
     - Username: `tahaif-s3-uploader`
     - Attach policy: **AmazonS3FullAccess** (or a custom scoped policy — recommended for prod)
     - Go to **Security credentials → Create access key** → select **Application running outside AWS**
     - Copy the **Access Key ID** and **Secret Access Key** — shown only once
- **Env vars:**
  ```
  S3_ENDPOINT_URL=                          # Leave blank for real AWS S3
  S3_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxxxxx
  S3_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  S3_BUCKET_NAME=tahaif-media
  S3_PUBLIC_URL=https://tahaif-media.s3.ap-south-1.amazonaws.com
  ```

---

## Part 4 — Internal Secrets

These are not from external services — you generate them yourself.

### SECRET_KEY (JWT Signing Key)

- **Purpose:** Signs and verifies JWT access/refresh tokens
- **Generate:**
  ```bash
  openssl rand -hex 32
  ```
- **Env var:**
  ```
  SECRET_KEY=<64-character-hex-string>
  ```
- **Rules:** Must be unique per environment. Never reuse between dev/staging/prod. Rotate if leaked.

### Token Expiry Settings

These are tunable — defaults are reasonable:

```
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
```

---

## Part 5 — Full `.env` Template

Copy this to `.env` at the repo root and fill in your values:

```bash
# ── Database ──────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql+asyncpg://tahaif_user:tahaif_dev_password@localhost:5433/tahaif

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6380/0

# ── Security ──────────────────────────────────────────────────────────────────
SECRET_KEY=                           # openssl rand -hex 32
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# ── Google OAuth ──────────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/oauth/google/callback

# ── Meilisearch ───────────────────────────────────────────────────────────────
MEILISEARCH_URL=http://localhost:7700
MEILISEARCH_MASTER_KEY=              # Any random string

# ── Object Storage (MinIO locally / S3 in prod) ───────────────────────────────
S3_ENDPOINT_URL=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET_NAME=tahaif-media
S3_PUBLIC_URL=http://localhost:9000/tahaif-media

# ── Stripe ────────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_
STRIPE_PUBLISHABLE_KEY=pk_test_
STRIPE_WEBHOOK_SECRET=whsec_

# ── JazzCash ──────────────────────────────────────────────────────────────────
JAZZCASH_MERCHANT_ID=
JAZZCASH_PASSWORD=
JAZZCASH_INTEGRITY_SALT=

# ── EasyPaisa ─────────────────────────────────────────────────────────────────
EASYPAISA_STORE_ID=
EASYPAISA_STORE_PASSWORD=

# ── Twilio ────────────────────────────────────────────────────────────────────
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_SMS_FROM=

# ── WhatsApp ordering bot (Meta Cloud API) ────────────────────────────────────
WHATSAPP_BOT_ENABLED=false
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_TEAM_NUMBER=
WHATSAPP_CATALOG_ID=
BANK_ACCOUNT_NAME=
BANK_IBAN=

# ── Resend (Email) ────────────────────────────────────────────────────────────
RESEND_API_KEY=re_
EMAIL_FROM=noreply@tahaif.com

# ── FX Rates ──────────────────────────────────────────────────────────────────
OPENEXCHANGERATES_APP_ID=

# ── Observability ─────────────────────────────────────────────────────────────
SENTRY_DSN=
ENVIRONMENT=development

# ── Frontend (Next.js public vars — never put secrets here) ──────────────────
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_
NEXT_PUBLIC_MEILISEARCH_URL=http://localhost:7700
NEXT_PUBLIC_MEILISEARCH_SEARCH_KEY=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_BANK_IBAN=
NEXT_PUBLIC_BANK_ACCOUNT_NAME=Tahaif Gifts — MCB Bank
```

---

## Part 6 — What's Required vs Optional

### Required to start the app at all

| Variable | Why required |
|---|---|
| `DATABASE_URL` | API won't boot without a database connection |
| `SECRET_KEY` | JWT auth won't work |
| `REDIS_URL` | Session cache and task queue depend on it |

### Required for core features to work

| Variable | Feature it enables |
|---|---|
| `MEILISEARCH_MASTER_KEY` | Product search |
| `NEXT_PUBLIC_MEILISEARCH_SEARCH_KEY` | Frontend search input |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | Card payments |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Google social login |
| `RESEND_API_KEY` | Confirmation emails |
| `S3_*` | Image uploads |

### Optional (degrade gracefully)

| Variable | What breaks without it |
|---|---|
| `TWILIO_*` | WhatsApp/SMS notifications silently skipped |
| `WHATSAPP_*` (bot) | No ordering inside WhatsApp; the webhook returns 404 |
| `JAZZCASH_*` | JazzCash payment option hidden |
| `EASYPAISA_*` | EasyPaisa payment option hidden |
| `OPENEXCHANGERATES_APP_ID` | Multi-currency FX disabled; PKR only |
| `SENTRY_DSN` | No error reporting; logs still work |
| `NEXT_PUBLIC_POSTHOG_KEY` | No analytics |

---

## Part 7 — Minimum Local Dev Setup Checklist

```
[ ] Docker Desktop installed and running
[ ] Run: cd gift-delivery && docker compose up -d
[ ] Copy .env.example to .env
[ ] Generate SECRET_KEY: openssl rand -hex 32
[ ] Set MEILISEARCH_MASTER_KEY to any string
[ ] Open MinIO Console (http://localhost:9001) and create bucket: tahaif-media
[ ] Generate Meilisearch search-only key and set NEXT_PUBLIC_MEILISEARCH_SEARCH_KEY
[ ] Run DB migrations: cd apps/api && uv run alembic upgrade head
[ ] (Optional) Set up Google OAuth for social login
[ ] (Optional) Set up Stripe test keys for payment testing
```
