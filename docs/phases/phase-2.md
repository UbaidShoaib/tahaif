# Phase 2 — Catalog

**Status:** In Progress  
**Depends on:** Phase 1 (Auth & Users)

---

## Goal

Deliver the full read/write catalog API: cities, vendors, categories, products,
product images, and city-scoped availability. Meilisearch integration for full-text
product search. Vendor and staff roles can manage their own data; buyers get
read-only access.

---

## Domain Entities

| Entity | Key fields |
|---|---|
| `City` | name, slug, timezone, is_active |
| `Vendor` | name, slug, city_id, owner_user_id, logo_url, is_active |
| `Category` | name, slug, parent_id (self-ref), sort_order |
| `Product` | vendor_id, category_id, name, slug, description, base_price_pkr (BIGINT paisa), is_active |
| `ProductImage` | product_id, url, alt_text, sort_order, is_primary |
| `ProductCity` | product_id, city_id, price_override_pkr, delivery_fee_pkr, lead_time_hours, same_day_cutoff (TIME), is_available |

---

## API Endpoints

### Public (no auth)
- `GET /cities` — list active cities
- `GET /cities/{slug}` — city detail
- `GET /vendors` — list vendors (filter by city)
- `GET /vendors/{slug}` — vendor detail with products preview
- `GET /categories` — tree of categories
- `GET /products` — paginated list (filter: city, category, vendor, price range, search)
- `GET /products/{slug}` — product detail with city availability
- `GET /search?q=` — Meilisearch full-text (proxied)

### Vendor (role=vendor, owns the vendor record)
- `POST /vendors` — create vendor (owner = current user)
- `PATCH /vendors/{slug}` — update own vendor
- `POST /products` — create product for own vendor
- `PATCH /products/{slug}` — update own product
- `DELETE /products/{slug}` — soft-delete (sets is_active=False)
- `POST /products/{slug}/images` — upload image to MinIO/S3
- `DELETE /products/{slug}/images/{id}` — remove image
- `PUT /products/{slug}/cities` — set city availability for product

### Staff/Admin
- All vendor endpoints above, unrestricted by ownership
- `POST /cities` / `PATCH /cities/{slug}`
- `POST /categories` / `PATCH /categories/{slug}`

---

## DB Migration

Single migration `0002_catalog.py`:
- Add `city_name` FK on `addresses.city_id` → `cities.id` (replacing VARCHAR stub)
- Create: `cities`, `vendors`, `categories`, `products`, `product_images`, `product_cities`

---

## Meilisearch

Index `products` with fields:
`id, name, slug, description, vendor_name, category_name, city_slugs, base_price_pkr, is_active`

Sync strategy: write-through in `ProductService` on create/update/delete.
Background re-index task available via Arq worker for full re-sync.

---

## Test Plan

- 80%+ coverage on all service files
- Repository tests for complex queries (filter combos, city availability join)
- Meilisearch calls mocked via `unittest.mock`
- Image upload mocked (S3 client injected as dependency)

---

## Definition of Done

- [ ] Migration runs clean (`alembic upgrade head`)
- [ ] All endpoints documented in OpenAPI with examples
- [ ] Seed data: 2 cities, 3 vendors, 5 categories, 10 products with city availability
- [ ] Meilisearch index created and synced from seed
- [ ] `ruff check && mypy && pytest` all green with ≥ 80% coverage
