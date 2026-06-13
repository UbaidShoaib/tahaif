# Tahaif — Gift Delivery Platform

> **تحائف** · Send cakes, flowers, perfumes and more to your loved ones anywhere in Pakistan.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [One-Command Start](#one-command-start)
- [Manual Setup (Step by Step)](#manual-setup-step-by-step)
- [Environment Variables](#environment-variables)
- [Local Service URLs](#local-service-urls)
- [Daily Development Workflow](#daily-development-workflow)
- [Database Commands](#database-commands)
- [Running Tests](#running-tests)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

---

## Overview

Tahaif is a Pakistan-first gift delivery e-commerce platform. Customers browse a catalog of cakes, flowers, perfumes and gift hampers, choose a recipient and delivery date, and pay via Cash on Delivery or Bank Transfer.

**Brand color:** `#16a34a` Emerald Green  
**Domain:** `tahaif.pk`

Full documentation: [`docs/production-roadmap.md`](docs/production-roadmap.md)

---

## Tech Stack

| Layer | Technology |
|---|---|
| API | FastAPI 0.110+, Python 3.12 |
| ORM / DB | SQLAlchemy 2 async + Alembic + PostgreSQL 16 |
| Cache | Redis 7 |
| Search | Meilisearch |
| Object Storage | MinIO (local) / S3 (production) |
| Frontend | Next.js 15, React 19, TypeScript strict |
| Styling | TailwindCSS + shadcn/ui |
| State | Zustand + TanStack Query |
| Forms | react-hook-form + Zod |
| Email | Resend (MailHog locally) |
| Payments | COD + Bank Transfer (Stripe/JazzCash via config) |
| CI | GitHub Actions |
| Deploy | Vercel (frontend) + Fly.io (API) |

---

## Prerequisites

Install these once on your machine before anything else.

### Required

| Tool | Version | Install |
|---|---|---|
| **Docker Desktop** | Latest | [docker.com/get-started](https://www.docker.com/get-started/) |
| **Node.js** | 22+ | [nodejs.org](https://nodejs.org/) |
| **pnpm** | 8+ | `npm install -g pnpm` |
| **Python** | 3.12+ | [python.org](https://www.python.org/downloads/) |
| **uv** | Latest | `pip install uv` or `curl -LsSf https://astral.sh/uv/install.sh \| sh` |

### Verify your setup

```bash
docker --version        # Docker version 24+
node --version          # v22+
pnpm --version          # 8+
python3 --version       # Python 3.12+
uv --version            # uv 0.4+
```

---

## One-Command Start

> **Fastest path** — runs everything: Docker services, DB migrations, seed data, API, and web app.

```bash
cd gift-delivery
./start.sh
```

That's it. Once complete:

| What | URL |
|---|---|
| 🌐 Web app | http://localhost:3000 |
| 📖 API docs | http://localhost:8000/api/v1/docs |
| 💚 API health | http://localhost:8000/api/v1/healthz |
| 📧 Test emails | http://localhost:8025 |
| 🪣 File storage | http://localhost:9001 |

> **Stopping:** Press `Ctrl+C` in the terminal where `start.sh` is running.  
> To stop Docker services: `docker compose -f infra/docker-compose.yml down`

---

## Manual Setup (Step by Step)

If you prefer to understand and control each step, follow this guide.

### Step 1 — Clone and enter the project

```bash
git clone <repo-url>
cd gift-delivery
```

### Step 2 — Set up environment variables

```bash
cp .env.example .env
```

Then open `.env` and set the one required value:

```bash
# Generate a secure secret key
python3 -c "import secrets; print(secrets.token_hex(32))"
# Copy the output and set it as SECRET_KEY in .env
```

All other values in `.env` have working defaults for local development. You only need to change them when integrating external services (Stripe, Twilio, etc.).

### Step 3 — Start Docker services

```bash
docker compose -f infra/docker-compose.yml up -d
```

Wait for all services to be healthy (usually ~20 seconds):

```bash
docker compose -f infra/docker-compose.yml ps
# All services should show "healthy"
```

Services started:
- **PostgreSQL 16** → `localhost:5433`
- **Redis 7** → `localhost:6380`
- **Meilisearch** → `localhost:7700`
- **MinIO** (S3-compatible storage) → `localhost:9000` (console: `localhost:9001`)
- **MailHog** (catches all dev emails) → `localhost:8025`

### Step 4 — Set up the API

```bash
cd apps/api

# Install Python dependencies
uv sync

# Apply database migrations (creates all tables)
uv run alembic upgrade head

# Seed the database with cities, vendors, and products
uv run python scripts/seed.py
```

Expected seed output:
```
Seeding cities...       9 cities
Seeding occasions...
Seeding categories...   13 categories
Seeding vendors...      10 vendors
Seeding products...     12 products seeded
✓ Seed complete
```

### Step 5 — Start the API server

```bash
# Still inside apps/api/
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Verify: open http://localhost:8000/api/v1/healthz — should return `{"status":"ok"}`.

### Step 6 — Set up the web app

Open a **new terminal**:

```bash
cd apps/web

# Install Node dependencies
pnpm install

# Start the dev server
pnpm dev
```

Verify: open http://localhost:3000 — the Tahaif home page should load.

---

## Environment Variables

The `.env` file at the repo root is read by both the API and the web app.

### Minimum required for local dev

```env
DATABASE_URL=postgresql+asyncpg://tahaif_user:tahaif_dev_password@localhost:5433/tahaif
REDIS_URL=redis://localhost:6380/0
SECRET_KEY=<generate with: python3 -c "import secrets; print(secrets.token_hex(32))">
```

### Full variable reference

| Variable | Default | Required | Description |
|---|---|---|---|
| `DATABASE_URL` | (see .env.example) | ✅ | PostgreSQL async connection string |
| `REDIS_URL` | `redis://localhost:6380/0` | ✅ | Redis connection string |
| `SECRET_KEY` | — | ✅ | JWT signing secret (32+ random bytes) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | No | JWT access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | No | Refresh token lifetime |
| `MEILISEARCH_URL` | `http://localhost:7700` | No | Meilisearch base URL |
| `MEILISEARCH_MASTER_KEY` | `dev_master_key` | No | Meilisearch API key |
| `S3_ENDPOINT_URL` | `http://localhost:9000` | No | MinIO/S3 endpoint |
| `S3_ACCESS_KEY_ID` | `minioadmin` | No | MinIO access key |
| `S3_SECRET_ACCESS_KEY` | `minioadmin` | No | MinIO secret key |
| `S3_BUCKET_NAME` | `tahaif-media` | No | S3 bucket for uploads |
| `RESEND_API_KEY` | — | No | Resend email API key (dev uses MailHog) |
| `EMAIL_FROM` | `noreply@tahaif.com` | No | Sender email address |
| `GOOGLE_CLIENT_ID` | — | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | — | No | Google OAuth client secret |
| `STRIPE_SECRET_KEY` | — | No | Stripe secret key (not needed for COD/bank transfer) |
| `SENTRY_DSN` | — | No | Sentry error tracking DSN |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api/v1` | No | API base URL for browser |

> **Never commit `.env`** — it is in `.gitignore`. Only commit `.env.example` with safe placeholder values.

---

## Local Service URLs

| Service | URL | Credentials |
|---|---|---|
| 🌐 Web app | http://localhost:3000 | — |
| 📖 API Swagger docs | http://localhost:8000/api/v1/docs | — |
| 🔄 API ReDoc | http://localhost:8000/api/v1/redoc | — |
| 💚 API healthcheck | http://localhost:8000/api/v1/healthz | — |
| 📧 MailHog (test email) | http://localhost:8025 | — |
| 🔍 Meilisearch | http://localhost:7700 | Master key: `dev_master_key` |
| 🪣 MinIO console | http://localhost:9001 | `minioadmin` / `minioadmin` |
| 🐘 PostgreSQL | `localhost:5433` | `tahaif_user` / `tahaif_dev_password` |
| 🔴 Redis | `localhost:6380` | — |

---

## Daily Development Workflow

### Starting work

```bash
# 1. Start Docker services (if not running)
docker compose -f infra/docker-compose.yml up -d

# 2. Start API (terminal 1)
cd apps/api
uv run uvicorn app.main:app --reload --port 8000

# 3. Start web (terminal 2)
cd apps/web
pnpm dev
```

Or just run `./start.sh` to do all of the above automatically.

### Stopping everything

```bash
# Stop API and web: Ctrl+C in each terminal

# Stop Docker services
docker compose -f infra/docker-compose.yml down

# Stop Docker AND delete all data (full reset)
docker compose -f infra/docker-compose.yml down -v
```

---

## Database Commands

All database commands run from `apps/api/`.

### Apply migrations

```bash
uv run alembic upgrade head
```

### Roll back one migration

```bash
uv run alembic downgrade -1
```

### Create a new migration

```bash
uv run alembic revision --autogenerate -m "add_column_to_table"
# Always review the generated file in alembic/versions/ before applying
```

### Check current migration version

```bash
uv run alembic current
```

### View migration history

```bash
uv run alembic history --verbose
```

### Re-seed the database

```bash
# Drop and recreate (development only)
uv run alembic downgrade base
uv run alembic upgrade head
uv run python scripts/seed.py
```

### Connect directly with psql

```bash
docker exec -it $(docker compose -f infra/docker-compose.yml ps -q postgres) \
  psql -U tahaif_user -d tahaif
```

---

## Running Tests

### Backend tests

```bash
cd apps/api

# Run all tests
uv run pytest

# Run with coverage report
uv run pytest --cov=app --cov-report=term-missing

# Run a specific test file
uv run pytest tests/test_auth.py -v

# Run a specific test
uv run pytest tests/test_auth.py::test_register_happy_path -v
```

> **Note:** Tests use a separate in-memory test database. Docker services must be running for integration tests.

### Frontend tests

```bash
cd apps/web

# Run unit tests (Vitest)
pnpm test

# Run tests in watch mode
pnpm test:watch

# Type-check only
pnpm typecheck

# Lint only
pnpm lint
```

### Run all checks (what CI runs)

```bash
# Backend
cd apps/api
uv run ruff check .
uv run mypy .
uv run pytest

# Frontend
cd apps/web
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

---

## Project Structure

```
gift-delivery/
│
├── apps/
│   ├── api/                        # FastAPI backend
│   │   ├── app/
│   │   │   ├── api/v1/endpoints/   # Route handlers
│   │   │   ├── core/               # Config, security, DB, rate limiting
│   │   │   ├── integrations/       # Stripe, Resend, Meilisearch, OAuth
│   │   │   ├── models/             # SQLAlchemy ORM models
│   │   │   ├── repositories/       # Database access layer
│   │   │   ├── schemas/            # Pydantic request/response schemas
│   │   │   ├── services/           # Business logic
│   │   │   ├── workers/            # Background tasks (Arq)
│   │   │   └── main.py             # App factory
│   │   ├── alembic/versions/       # Database migrations (0001–0005)
│   │   ├── scripts/
│   │   │   └── seed.py             # Seed cities, vendors, products
│   │   ├── tests/                  # Pytest test suite
│   │   └── pyproject.toml
│   │
│   └── web/                        # Next.js 15 frontend
│       ├── app/                    # App Router pages
│       │   ├── (auth)/             # Login, register, forgot/reset password
│       │   ├── p/[slug]/           # Product detail
│       │   ├── c/[...slug]/        # Category pages
│       │   ├── vendor/[slug]/      # Vendor pages
│       │   ├── cart/               # Shopping cart
│       │   ├── checkout/           # Checkout flow
│       │   ├── account/            # User dashboard
│       │   └── track/[token]/      # Order tracking (public)
│       ├── components/
│       │   ├── auth/               # Login, register, forgot/reset forms
│       │   ├── layout/             # Header, Footer, ThemeToggle
│       │   └── ui/                 # shadcn/ui base components
│       ├── hooks/                  # useAuth, etc.
│       ├── lib/                    # api.ts, utils.ts
│       ├── stores/                 # Zustand stores (auth, cart)
│       ├── styles/globals.css
│       └── middleware.ts           # Route guards
│
├── packages/
│   └── api-client/                 # Generated OpenAPI TypeScript client
│
├── infra/
│   ├── docker-compose.yml          # All local dev services
│   ├── Dockerfile.api              # Production API image
│   └── Dockerfile.web              # Production web image
│
├── docs/
│   ├── production-roadmap.md       # Master plan with all milestones
│   ├── project-spec.md             # Full product specification
│   ├── questions.md                # All product decisions (resolved)
│   ├── state.md                    # Current resume point
│   └── decisions/0001-stack.md    # Architecture Decision Record
│
├── .env.example                    # Environment variable template
├── .editorconfig
├── .pre-commit-config.yaml
├── pnpm-workspace.yaml
├── start.sh                        # ← One-command startup script
└── README.md                       # ← This file
```

### Database migration history

| Migration | Tables created |
|---|---|
| `0001_auth_users` | users, refresh_tokens, oauth_accounts, password_reset_tokens, addresses |
| `0002_catalog` | cities, vendors, categories, products, product_images, product_cities |
| `0003_catalog_extensions` | product_variants, occasions, product_occasions, product_categories, customization_fields, fx_rates |
| `0004_cart_orders` | carts, cart_items, orders, order_items, fulfillments, payments |
| `0005_notifications_loyalty_reviews` | notifications_outbox, loyalty_wallets, loyalty_ledger, reviews, coupons, banners, testimonials, audit_logs |

### API endpoints

| Group | Prefix | Description |
|---|---|---|
| Health | `/api/v1/healthz` `/api/v1/readyz` | Liveness and readiness |
| Auth | `/api/v1/auth/*` | Register, login, refresh, logout, OAuth, password reset |
| Me | `/api/v1/me` | Profile + address CRUD |
| Catalog | `/api/v1/cities` `/api/v1/vendors` `/api/v1/categories` `/api/v1/products` | Public catalog |
| Search | `/api/v1/search` | Meilisearch passthrough |

Full interactive docs: http://localhost:8000/api/v1/docs

---

## Troubleshooting

### Docker services won't start

```bash
# Check what's using the ports
lsof -i :5433    # Postgres
lsof -i :6380    # Redis
lsof -i :7700    # Meilisearch
lsof -i :9000    # MinIO

# If ports are in use, either stop the conflicting process or change ports in
# infra/docker-compose.yml and update .env accordingly
```

### "Module not found" errors in API

```bash
cd apps/api
uv sync          # reinstall dependencies
```

### Database connection refused

```bash
# Check Docker is running and postgres is healthy
docker compose -f infra/docker-compose.yml ps

# Restart just postgres
docker compose -f infra/docker-compose.yml restart postgres

# Check logs
docker compose -f infra/docker-compose.yml logs postgres
```

### Alembic migration errors

```bash
# Check current state
cd apps/api
uv run alembic current

# If the DB is corrupted or in a bad state (dev only — destroys data)
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up -d
uv run alembic upgrade head
uv run python scripts/seed.py
```

### Web app won't start — "Cannot find module"

```bash
cd apps/web
rm -rf node_modules .next
pnpm install
pnpm dev
```

### Emails not showing up

All emails in development go to MailHog. Open http://localhost:8025 — they should be there. If MailHog isn't running:

```bash
docker compose -f infra/docker-compose.yml up -d mailhog
```

### MinIO bucket not found on upload

```bash
# Create the bucket manually
docker exec -it $(docker compose -f infra/docker-compose.yml ps -q minio) \
  mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec -it $(docker compose -f infra/docker-compose.yml ps -q minio) \
  mc mb local/tahaif-media --ignore-existing
```

### Full clean reset (nuclear option — destroys all local data)

```bash
docker compose -f infra/docker-compose.yml down -v --remove-orphans
docker compose -f infra/docker-compose.yml up -d
cd apps/api
uv run alembic upgrade head
uv run python scripts/seed.py
```

---

## Next steps for contributors

1. Read [`docs/production-roadmap.md`](docs/production-roadmap.md) — understand what's built and what's next
2. Read [`docs/project-spec.md`](docs/project-spec.md) — understand the product requirements
3. Run `./start.sh` and verify everything works
4. Pick a task from the roadmap and create a branch

---

*Built with ❤️ for Pakistan.*
