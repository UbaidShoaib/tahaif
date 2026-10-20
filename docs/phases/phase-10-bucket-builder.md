# Phase 10 — Build-Your-Own Buckets

Design and rationale: ADR 0014. Status: **implemented (backend, web), not yet deployed.**

## What's in it

| Slice | Where |
|---|---|
| Models + migration `0021` + seed (one bouquet and one hamper builder at Premium Florist Karachi) | `app/models/bucket.py`, `scripts/seed.py` |
| Bucket service and REST | `app/services/bucket_service.py`, `app/api/v1/endpoints/buckets.py` |
| WebSocket + Redis fan-out and presence | `app/core/realtime.py`, `buckets.py` (`bucket_socket`) |
| Cart/checkout pricing; contents on buyer, vendor and admin order views | `cart_service.bucket_extra_pkr` / `bucket_contents`, `checkout_service` |
| Web builder | `/build/[slug]` (start), `/build/b/[id]?t=` (shared editing), `components/builder/`, `stores/bucket.store.ts`, `hooks/useBucketSocket.ts` |

## API

- `GET /builders/{slug}`: base + components
- `POST /buckets` `{builder_slug}`: returns `share_token` once
- `GET /buckets/{id}?t=` · `POST /buckets/{id}/edits?t=` `{edit}` · `POST /buckets/{id}/cart?t=`
- `WS /buckets/{id}/ws?t=&name=`: message types in the endpoint docstring

## Not yet

- Playwright two-browser flow (needs the web + API stack running in CI)
- Admin UI to set up builders and their components (seed or SQL for now)
- Link from the home page / occasion pages to `/build/build-your-own-bouquet`
