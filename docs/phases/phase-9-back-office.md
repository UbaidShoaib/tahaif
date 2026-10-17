# Phase 9 — Back Office (evaluation & plan)

Status: **P0 in progress** · Written 2026-10-17

The admin panel grew one tab per feature (Phases 3–8). It handles single tasks,
but nobody can run the business from it day to day. This doc evaluates it from
four angles (engineering, UI/UX, operations, sales) and suggests a staged plan.

---

## 1. What exists today

`apps/web/app/admin/page.tsx` is one client page with 8 tab buttons:

| Tab | What it does | Gaps |
|---|---|---|
| Orders | Last 50 orders, filter by status, change status, verify payment proof, WhatsApp log | No search, pagination, date range, order detail page, notes, refunds, edits, or bulk actions. You can set any status without checks |
| New DM order | Assisted (Instagram/WhatsApp) order | — (Phase 8) |
| Messages to send | Manual `wa.me` queue | — |
| Sales by campaign | UTM/source report | The only report there is |
| Shop applications | Approve/reject vendors | No vendor list or vendor edits after approval |
| Add product | Create a product | — |
| Hidden products | Lists `is_active=false`, publish | **No way to see, search, or edit live products** |
| Reported notes | Moderate card notes | — |

**Backend endpoints that have no UI:** `PATCH /catalog/products/{slug}`,
`PUT /products/{slug}/cities`, image upload/delete, cities, vendors,
categories and occasions CRUD, coupons (`/admin/coupons`), FX override
(`/admin/fx-rates`), users and roles (`/admin/users`). Banners and testimonials
are read-only even in the API.

**Bottom line:** the API handles about 60% of back-office work, but staff can
only use about 25% of it without Postman or SQL. Managing existing products is
the biggest gap: to fix a price, photo, city fee or stock count today you need
a developer.

---

## 2. What the business needs today (Pakistan-first, low order volume, a small team)

In order of how much they hurt each day:

1. **Fix a product fast.** Price, photos, out of stock, "not in Karachi this week", Eid price changes.
2. **Find an order fast.** A customer phones with a name, phone number or order code. Today staff scroll through the last 50 orders.
3. **Know what to do today.** Deliveries due today and tomorrow, by city, slot and vendor. Payments waiting for verification. Orders at risk of missing their slot.
4. **Handle a problem.** Cancel, refund (bank transfer back), reschedule, change the address, add an internal note, contact the vendor.
5. **Pay vendors.** What each vendor is owed for the week, minus commission. Mark it paid. Bank details are already stored (`Vendor.bank_iban`).
6. **Run promotions.** Coupons, occasion banners, featured products (Eid, Valentine's, Mother's Day bring most of the revenue).
7. **See the numbers.** Revenue, AOV, orders by city/source/occasion, conversion, top products.

---

## 3. Evaluation by role

### Engineer
- **Information architecture:** one 311-line `"use client"` page that switches on `section` state. Move to App Router routes (`/admin/orders`, `/admin/orders/[id]`, `/admin/products/[id]`, …) so pages can be deep-linked, bookmarked and opened in new tabs, the back button works, and the code is split per page.
- **Data access:** raw `fetch` with a copied `API_URL` and token in every component. Use the generated `packages/api-client` with TanStack Query, as CLAUDE.md requires. The admin list endpoints return untyped `dict[str, Any]`; give them Pydantic response models so codegen covers them.
- **Lists:** add one generic server-side pattern for every list endpoint: `q`, filters, `cursor`/`limit`, `sort`, and a total count.
- **Audit log (missing):** add an `admin_audit_log` table (actor, action, entity, before/after JSONB, ip, at). This is required once more than one person verifies payments or changes prices. Write to it from the service layer.
- **Permissions:** `AdminUser = require_roles(admin, staff)` treats staff exactly like admin, except for role changes. Staff can override FX rates, create coupons and verify payments. Add permission scopes (e.g. `orders.write`, `catalog.write`, `finance.write`, `settings.write`) mapped to roles, starting with three roles: admin, ops, catalog.
- **Order state machine:** enforce the allowed transitions in `OrderService` (e.g. not `delivered → pending_payment`) and record a status-history row with the actor and reason. Right now it is a free-form PATCH.
- **Exports:** add CSV export for orders, payouts and products. Accountants will ask for it on day one.
- **Bulk import/update:** add product CSV import/export. `docs/catalog-template.md` already describes the shape.

### UI/UX
- Use a layout with a **left sidebar** (Today · Orders · Catalog · Vendors · Customers · Marketing · Finance · Reports · Settings) instead of a row of buttons.
- Make **Today** the home page instead of the orders list. It shows tiles for: proofs to verify, deliveries today by slot, late or at-risk orders, messages to send, and low stock.
- Use **data tables** (shadcn DataTable) with search, filter chips, saved views and keyboard navigation (`/` to search, `j/k` to move between rows).
- Add an **order detail page** with a timeline (status history, payments, messages, notes), per-item recipient and slot, vendor fulfillment state, delivery photo, and action buttons (only the actions allowed from the current state).
- Add a **product editor** with tabs (Basics · Images (drag to reorder) · Variants & stock · Cities & fees · Occasions/categories · Customization · SEO) and a live storefront preview.
- Put a **global search** (⌘K) in the header that finds orders, phone numbers, products and vendors.
- Make it work on mobile. Owners will check it on their phones, and "verify proof" and "mark dispatched" must work at 375px.
- Confirm destructive actions with in-page dialogs, not browser alerts. Show undo toasts for publish/hide.

### Operations
- **Dispatch board:** tomorrow's deliveries grouped by city → vendor → slot, printable or shared to the vendor on WhatsApp.
- **Cutoff and capacity:** per-vendor daily capacity and blackout dates (Eid, strikes, load-shedding days). Today a vendor can only be on or off.
- **Exceptions queue:** failed delivery, recipient unreachable, wrong address, vendor rejected the order. Each has an owner and an SLA.
- **Refunds and adjustments:** partial refunds, store credit (loyalty points already exist), and recording the bank-transfer refund reference.
- **Payment reconciliation:** match bank-transfer proofs to statement lines, and track COD collected vs remitted by rider or vendor.
- **Vendor payouts:** weekly statements with commission %, adjustments, a paid marker and a downloadable PDF/CSV.
- **Customer service view:** a customer page with their order history, recipients, notes, and a "VIP / fraud risk" flag.

### Sales / growth
- **Merchandising:** featured or sorted products per home section and per occasion, scheduled occasion launches (`Occasion.starts_at` already exists), and banner CRUD.
- **Coupons UI:** the API exists. Add usage stats and per-campaign codes for influencers.
- **Occasion reminders:** a campaign view for Phase 7 reminders, showing who has an upcoming occasion and who to nudge.
- **Abandoned carts:** list with a one-click `wa.me` follow-up. This fits the manual queue pattern from ADR 0009.
- **Reports:** a revenue dashboard by day, city, source, occasion and vendor, plus repeat-buyer rate and diaspora vs local split.
- **Vendor acquisition pipeline:** applications plus a performance scorecard for each vendor (on-time %, ratings, cancellations).

---

## 4. Proposed staged plan

| Stage | Scope | Why first |
|---|---|---|
| **P0 — Run the shop** (≈2 wks) | Sidebar shell + routes · **Catalog: product list (search/filter/active toggle) + full product editor** using existing endpoints · Orders: search by code/phone/name, pagination, date filter, order detail page with notes · Audit log · state-machine guard on status changes | Removes daily developer dependency; mostly UI over existing API |
| **P1 — Operate** (≈2 wks) | Today dashboard · dispatch board · cancel/refund/reschedule flows · coupons + FX + users UI · vendor list/edit · CSV exports | Covers the second most common daily tasks |
| **P2 — Money** | Vendor payouts & statements · payment reconciliation · COD remittance | Needed once more than a handful of vendors are active |
| **P3 — Grow** | Merchandising/banners · abandoned-cart queue · reports dashboard · vendor scorecard · bulk CSV import · permission scopes | Do after the operations side is stable |

Each stage follows the Definition of Done in CLAUDE.md (tests, OpenAPI examples, responsive, dark mode).

---

## 4a. Progress

**P0 · Catalog — done (2026-10-17)**
- Products tab (`components/admin/ProductList.tsx`): search, shop filter, All/Live/Hidden, publish/hide, thumbnails.
- Editor `/admin/products/[id]` (`components/admin/ProductEditor.tsx`): details/price/category, photos
  (upload, make main, remove with confirm), delivery cities. Each section saves on its own and reloads from the server.
- Cities are never deleted from a product, only switched off (`is_available=false`) — the upsert API has no delete,
  and past orders reference the row's fees.
- URL name (slug) is read-only in the editor: changing it would break shared links and WhatsApp messages.
- `hooks/use-staff-session.ts` is the auth guard for new admin routes; `/admin` itself still has its own copy
  until the sidebar/routes refactor.

**P0 · Order search — done (2026-10-17)**
- `components/admin/OrderList.tsx` (moved out of `app/admin/page.tsx`): one search box, status chips, placed-date
  range, 25 per page, 30 s polling kept. Logic in `services/admin_order_service.py`; the router no longer queries
  the DB for this list.
- Search is one box, split server-side (`parse_query`): phone-looking input matches the **last 10 digits** of every
  buyer/recipient phone with formatting stripped (so 0300…, +92 300… and 92300… all hit); hex-looking input also
  matches the order-code prefix; anything else matches names/emails (ILIKE). No index yet — fine at today's volume;
  add pg_trgm if the list gets slow.
- Date filters are whole days in Asia/Karachi, `placed_to` inclusive.

**P0 · Order page + staff notes — done (2026-10-17)**
- `/admin/orders/[id]` (`components/admin/OrderDetail.tsx`), data from `GET /admin/orders/{id}`
  (`AdminOrderDetail` extends the buyer-facing `OrderRead`, so both stay in step).
- Staff notes (`order_staff_notes`, migration 0018) are **append-only**: no edit or delete, a correction is a new
  note. They will feed the audit log later, and a note is a record of what staff were told.
- The timeline is built from timestamps already stored (placed, confirmed, payment checked, dispatched,
  delivered, WhatsApp sent). Status changes made in the admin are **not** on it yet — that needs the
  status-history table from the state-machine item.

**Still open in P0:** variants & stock, occasions on a product (no API yet), photo reordering, sidebar shell,
audit log, status state machine with status history.

## 5. Open questions (defaults in brackets)

- Vendor commission model: flat % per vendor or per category? **[flat % per vendor, stored on `Vendor`]**
- Who issues refunds: ops or admin only? **[admin only until permission scopes ship]**
- Should vendors edit their own prices, or must admin approve? **[vendor edits go live; audit log + admin can revert]**
- Is stock tracked for made-to-order items (cakes, bouquets)? **[no — use daily capacity; stock only for perfumes/hampers]**
