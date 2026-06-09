# ADR 0001 — Technology Stack

**Date:** 2026-06-09
**Status:** Accepted

## Context

Tahaif is a gift delivery e-commerce platform serving two user groups:
1. Pakistani diaspora (UK/US/CA/AU/UAE) sending gifts to Pakistan, paying in foreign currencies.
2. Local Pakistani users ordering within Pakistan, paying in PKR.

We need a stack that can handle multi-currency transactions, city-scoped product availability,
multi-recipient carts, real-time order tracking, and eventual vendor portal — all from a small team.

## Decision

| Layer | Technology | Rationale |
|---|---|---|
| API | FastAPI 0.110+, Python 3.12 | Async-first, typed, excellent DX, fast enough |
| ORM | SQLAlchemy 2 (async) + Alembic | Industry standard, async support, proper migrations |
| DB | PostgreSQL 16 | ltree for category hierarchy, JSONB for product attrs, BIGINT for money |
| Cache / guest cart | Redis 7 | Guest cart TTL, session blacklist, rate-limit counters |
| Task queue | Arq | Lightweight async task queue; Celery if complexity grows |
| Search | Meilisearch | Typo-tolerant, fast to operate, good filters |
| Object storage | S3-compatible (MinIO locally) | Product images, greeting card uploads |
| Payments | Stripe (cross-border), JazzCash + EasyPaisa (local PKR) | Stripe for diaspora cards; local wallets for Pakistani users |
| Messaging | Twilio (WhatsApp + SMS), Resend (email) | WhatsApp penetration in Pakistan is near-universal |
| Frontend | Next.js 15 (App Router), React 19, TypeScript strict | SSR/ISR for SEO, App Router for RSC |
| Styling | TailwindCSS + shadcn/ui | Consistent, accessible, tree-shakeable |
| State / fetching | Zustand + TanStack Query | Minimal boilerplate, server-state separation |
| Forms | react-hook-form + Zod | Schema-shared with backend via OpenAPI codegen |
| i18n | next-intl | Urdu (RTL) support required for future locale |
| Animation | Framer Motion (light use only) | Hero banners only; keep bundle lean |
| E2E tests | Playwright | Cross-browser, reliable |
| CI | GitHub Actions | Free for open repos, native marketplace |
| Deploy | Vercel (frontend), Fly.io or Render (API) | Zero-config SSL, edge CDN |
| CDN / WAF | Cloudflare | DDoS protection, image optimization |
| Observability | Sentry, PostHog | Error tracking + product analytics |

## Money convention

All monetary values stored as **BIGINT in minor units** (paisa for PKR, cents for USD/GBP).
Never float. Conversion only at display layer.

## Consequences

- Python 3.12 required — no 3.10/3.11 support needed.
- `no any` TypeScript rule enforced via ESLint — OpenAPI codegen provides all types.
- Local users (PKR-only) bypass FX conversion entirely; checkout flow branches on `user.locale`.
- Alembic manages all schema changes — `Base.metadata.create_all()` is forbidden in production.
