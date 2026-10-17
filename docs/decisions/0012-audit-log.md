# ADR 0012 — Back-office Audit Log Written by Services

**Date:** 2026-10-17
**Status:** Accepted

## Context

Several staff now verify payments, change order status, edit prices and toggle
coupons. When a customer disputes a price or a payment is approved by mistake we
need to know who did it, what it was before and from where.

`audit_logs` already existed (Phase 5) and an ASGI middleware wrote to it for
every mutating `/admin/*` and `/vendor/*` request. Those rows were not usable:
action was the HTTP method, entity/entity_id were guessed from URL segments,
there was no actor and no data, the write ran fire-and-forget in a separate
session (so it logged requests that failed and could miss ones that succeeded),
and errors were swallowed. Production had 9 such rows.

## Decision

1. **Services write the entry**, via `audit_service.record(db, actor, action,
   entity, entity_id, before=, after=, context=)`, in the **same transaction** as
   the change. An entry exists if and only if the change committed.
2. `before`/`after` hold **only changed fields** (`audit_service.snapshot` an ORM
   row before and after; `record` drops equal keys and is a no-op when nothing
   changed). `context` keeps a few unchanged fields for readability (e.g. the
   coupon code, the recipient).
3. Actions are `<entity>.<verb>` (`order.status_changed`, `payment.verified`,
   `product.updated` …); `ACTION_LABELS` in `audit_service` is the list.
   Delivery updates by vendors are logged against the **order** so they appear
   on the order's timeline.
4. The client IP comes from a `ContextVar` set by `ClientIPMiddleware` (using
   `client_ip()`, which honours `TRUSTED_PROXY_HOPS`). The old middleware is gone.
5. Reading the full log (`GET /admin/audit-log`, Activity tab) is **admin-only**:
   it exposes every staff member's actions and IPs. Staff see the order-scoped
   part on the order page timeline.
6. Same table, no migration. The 9 old rows stay; their `action` is an HTTP
   method and they have no actor.

## Consequences

- Every new back-office mutation must call `audit_service.record` — add it in the
  service, next to the change, not in the router. Routers that still mutate
  inline (FX override, coupons, user role) call it directly until they move to
  services.
- Writes that bypass services (SQL by hand, scripts) are not logged.
- The log grows with use; no retention policy yet (see `docs/questions.md`).
