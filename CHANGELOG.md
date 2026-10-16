# Changelog

All notable changes to Tahaif are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Dates reflect commit
history; the project has not yet cut a versioned release (still pre-1.0,
pre-production-cutover).

## [Unreleased]

### Added
- Admin "Add product" tab: create a live product (house vendor preselected) with a photo upload
  and delivery cities. API: `POST /products/{slug}/images/upload` (JPEG/PNG/WebP, 10 MB);
  photos live under the public `products/` prefix of the media bucket (ADR 0011).
- Urdu versions of all hand-sent WhatsApp messages (buyer and recipient), with an
  English/اردو toggle in "Messages to send" and on each order; API adds `text_ur`/`url_ur`.
- Order tracking items include `product_image_url` (the product's primary photo); the tracking
  page shows a thumbnail per line. API contract snapshot at `docs/api/openapi.json`.
- Card voice notes can be recorded in the browser ("Record a voice note", up to 2 minutes);
  uploading a file still works.
- Card-note safety (ADR 0010): buyers tick the content rules (`/terms#card-notes`) before adding
  a note, and the API stores when and from which IP they agreed. A "Report this message" link on
  the note page writes to `card_note_reports`. Playing a note is rate-limited (60/hour/IP) and
  notes stop playing 90 days after delivery (`NOTE_EXPIRY_DAYS`). Migration `0017`.
- Admin "Reported notes" tab: listen to a reported note, see the reports and the buyer's consent
  record, then take the note down (QR stops playing, recording kept), dismiss, or restore.
- Recipient WhatsApp messages in the manual "Messages to send" queue while
  `WHATSAPP_API_ENABLED=false`: "on its way" (skipped for surprises) and "delivered" /
  surprise reveal with the thank-you link. Messages now say who they go to (`to`, `phone`).
- Admin "Sales by campaign" report (`GET /admin/reports/campaigns?days=7|30|90`): orders,
  paid orders, revenue and average order per channel and reel/campaign. Website checkout now
  records the visit's `utm_campaign` on the order; campaign names are normalised.
- "Order on WhatsApp" on product pages: opens the business chat with the product, option,
  price, city, card message and link filled in, plus `(ref: <utm_campaign>)` when the visitor
  came from a tagged Instagram link. Needs `NEXT_PUBLIC_SUPPORT_WHATSAPP`.
- Instagram/WhatsApp orders (ADR 0009). Admin panel **New DM order** places an order for a
  chat customer through normal checkout (`POST /admin/orders/assisted`): email optional,
  phones normalised to E.164, duplicate guard (409 / `allow_duplicate`), no COD for
  surprises, `Idempotency-Key`. Orders record `source`, `source_ref`, `campaign`,
  `created_by_staff_id`. The buyer confirms on `/track/{token}`
  (`POST /orders/by-token/{token}/confirm`): accepts terms, can fix recipient details,
  optional marketing opt-in. Bank-transfer orders show bank details and receipt upload there.
  **Messages to send** queue (`GET /admin/whatsapp/queue`) and per-order WhatsApp buttons
  open prefilled `wa.me` chats and record the send (`order_messages`). Migration `0016`.
  SOP, compliance note and integration options in `docs/`.

### Changed
- Homepage and product cards redesigned. Cards are image-led and borderless (4:5 photo, serif
  name, price in ink). Homepage: hero with a photo collage instead of the gradient and crosshair
  graphic, photo category tiles taken from each category's products (tinted tile when none), text
  occasion pills without emoji, open "How it works" with gold numerals, trust row in brand colours
  (no green), and a thin gold "zari" rule under section headings.
- "My orders" redesigned to match the tracking page: each order is a row with the gift photo,
  "<gift> for <recipient>", and its status in words ("Arriving Mon 19 Oct", "Delivered Sat 17 Oct",
  on the delivery city's calendar); hairline rows instead of bordered boxes, whole row clickable.
- Order tracking page redesigned: one status hero that answers "where is my gift?" in a sentence
  ("Layers Bakeshop is preparing your gift for Ammi", "Delivered to Ammi") with the delivery photo
  on top once delivered; the greeting card styled like the printed card; progress, delivery and
  summary as open sections instead of a stack of bordered boxes. The summary now lists the
  delivery fee and discount so lines add up to the total; the no-op "Refresh Status" button is gone.
- Backend tests refuse to run against a database whose name doesn't end in `_test` (they drop all tables).
- Order progress shows "Delivered" as done (ticked) rather than as the current step.
- Automatic WhatsApp is off unless `WHATSAPP_API_ENABLED=true` (the Twilio sandbox
  sender can't reach real customers); email and the tracking page are unaffected.
- Shops join by application (ADR 0008): a signed-in user applies at `/sell`
  (`POST /vendor/application`, status at `GET /vendor/application`); the shop stays hidden
  until staff approve it in the admin panel's new "Shop applications" section
  (`GET /admin/vendor-applications`, `POST …/{id}/approve`, `POST …/{id}/reject` with an
  optional reason shown to the applicant, who can resend). Approval opens the shop and makes
  its owner a vendor. Migration `0014` adds `vendors.approval_status`, `contact_phone`,
  `review_note` and `reviewed_at`. Footer link "Sell with us".
- Admin panel "Hidden products" section (`GET /admin/products?is_active=false`) with a
  Publish button.
- Catalog loader: `apps/api/scripts/load_catalog.py` fills the shop from a `catalog.json`
  (vendors, categories, products with options, photos, occasions, personalisation and
  per-city delivery; format in `docs/catalog-template.md`). It validates the whole file
  and lists every problem before writing anything, takes prices in whole rupees, and is
  safe to re-run: rows are matched by slug and options are never deleted. The admin
  account is created only when `ADMIN_PASSWORD` is set.
- Single-VPS deployment (ADR 0007): `infra/docker-compose.prod.yml` runs web, API +
  worker, Postgres, Redis, Meilisearch and MinIO behind Caddy with automatic HTTPS, all
  on one origin (`/api/*` to the API, `/<bucket>/*` to private media). `infra/vps-setup.sh`
  prepares a fresh server, `infra/deploy.sh user@host` ships a git ref and rebuilds;
  settings live in the server's `.env.prod` (`infra/env.prod.example`). Adds a
  `.dockerignore` so local `.env` files and `node_modules` stay out of image builds.
- Delivery-status notifications for buyers (diaspora Release A, `docs/diaspora-experience.md`):
  when a vendor moves a fulfillment to preparing, dispatched, out for delivery, delivered
  or failed, the buyer gets a warm, recipient-named email plus a WhatsApp message (when a
  phone is known) with a live tracking link. The internal `ready` step and same-status
  tracking edits send nothing. Enqueueing is best-effort in a SAVEPOINT, so an outbox error
  never blocks the vendor's update.
- Proof of delivery (diaspora Release A): vendors can "Deliver with photo" from the
  vendor portal, attaching a doorstep photo and who received the gift
  (`POST /vendor/fulfillments/{id}/delivery-photo`, migration `0008`). It marks the
  fulfillment delivered, so the buyer's "delivered" message points to the photo, and
  the tracking page shows it through a 1-hour signed link (the bucket stays private).
  JPEG/PNG/WebP up to 10 MB; on a delivered fulfillment it replaces the photo.
- Dual-timezone times (diaspora Release A): the same-day cutoff on product pages
  now shows the clock time in the city and, for buyers abroad, their own time
  ("Order by 2:00 pm Lahore time (10:00 am your time)"). Tracking shows dispatch
  and delivery times as "28 Sep, 2:30 pm PKT (10:30 am your time)". API:
  fulfillments carry `city_timezone`.
- Measured on-time rate (diaspora Release A): `GET /stats/on-time[?vendor_id=]`
  returns the share of deliveries in the last 90 days that arrived on or before the
  chosen day (judged by the city's calendar day). The product page leads its trust
  list with the shop's rate and the home trust strip shows the overall rate. It's a
  measured fact, not a guarantee (Q17), and stays hidden below 20 deliveries.
- Vendor story on the product page: "Made by …", the shop's city and its own
  description, linking to its other gifts, so buyers abroad know which local maker
  prepares the gift. Hidden when the vendor has no description.
- WhatsApp support: a "Chat with us on WhatsApp" button in the footer, on the
  contact page and on tracking (pre-filled with the order number), with opening
  hours in PKT and, for buyers abroad, in their own time. Configured with
  `NEXT_PUBLIC_SUPPORT_WHATSAPP` and `NEXT_PUBLIC_SUPPORT_HOURS`; hidden when no
  number is set.
- Rich greeting card (diaspora Release B): message ideas in English, Urdu and
  Roman Urdu, and a live preview of the printed card (Urdu laid out right-to-left)
  on the product page and in the cart.
- Voice/video note on the greeting card (diaspora Release B): from the tracking page
  the buyer attaches a recording (audio or video, up to 25 MB) to any gift's card until
  it's dispatched. The vendor's print view adds a QR code; scanning it opens
  `/note/{token}`, which plays the note with the card message. The note token is
  separate from the order's, so the recipient can't see the order. API:
  `POST`/`DELETE /orders/by-token/{token}/items/{item_id}/note`, `GET /notes/{token}`;
  migration `0009`.
- Recipient messages and surprise mode (diaspora Release B): at checkout the buyer
  can set the name the recipient sees ("A gift from Ali (London)", defaulting to the
  account name) and choose "Keep it a surprise". Normal orders send the recipient a
  WhatsApp heads-up when the rider sets out; surprise orders send nothing beforehand
  and a reveal after delivery (mentioning the card's QR note if there is one). The
  vendor portal flags surprise gifts: don't call ahead, no receipt or price. Messages
  to the recipient carry no prices or links. Migration `0010`.
- Thank-you loop (diaspora Release B): the recipient can thank the sender from
  `/thanks/{token}`, reached by a "Scan to say thank you" QR on the printed card or
  a link in their WhatsApp message (normal orders now also get a "hope you love it"
  message after delivery). They send words and/or one photo, voice note or video;
  the buyer gets an email/WhatsApp and sees it on the tracking page. The link shows
  only who the gift is from. API: `GET`/`POST /thanks/{token}`; migration `0011`.
- Family address book (diaspora Release C): saved addresses become "Family &
  friends". Each can say who they are to the buyer ("Ammi", with suggestion chips)
  and hold a birthday and anniversary (month and day, no year; 29 Feb allowed). Cards
  flag an occasion coming up in the next 30 days ("Birthday in 5 days"), and checkout's
  saved-address cards lead with the relationship. API: `relationship`, `birthday` and
  `anniversary` on `/me/addresses` (an explicit null clears an occasion); migration `0012`.

- Occasion reminders (diaspora Release C): a daily job emails/WhatsApps buyers 7 and
  2 days before family birthdays and anniversaries, and 7 days before Eid ul-Fitr,
  Eid ul-Adha and Mother's Day (on their country's date: Mothering Sunday in the UK,
  second Sunday of May in the US/Canada/Australia/Pakistan, 21 March in the Gulf).
  Personal reminders link to `/send/{person}`, which sets the delivery city, opens
  the occasion's gifts and preselects that person at checkout. Buyers set their
  country and can turn reminders off on the account page. Each reminder is sent
  once. Migration `0013`.

### Fixed
- Security: `POST /vendors` was open to any signed-in user, who became the owner of the new
  shop and could then list products with no review. It is now staff/admin only, and a
  staff-created shop has no owner until one is assigned.
- The GDPR data export listed addresses with only id and street lines (and a
  non-existent `label`); it now includes every saved field, including recipient
  name, phone, city, relationship and occasions.

### Fixed
- Vendors couldn't see the buyer's card message, so nothing told them what to
  print. Fulfillments now list their items with each card message
  (`items[]` on `/vendor/fulfillments`, plus `GET /vendor/fulfillments/{id}`), the
  vendor portal shows them, and a print view lays out one card per message.

### Fixed
- Delivery dates showed the previous day for buyers west of UTC (e.g. Toronto,
  New York): date-only values were parsed as UTC midnight and formatted in the
  viewer's zone. Tracking times were rendered in the server's zone (UTC) instead
  of Pakistan time.

### Changed
- After signing in with no page to return to, admins and staff land on `/admin` and vendors on
  `/vendor/dashboard` instead of the home page; signed-in admins, staff and vendors also get
  an "Admin" / "Vendor portal" link in the header and mobile menu. `callbackUrl` is now only
  followed when it is a path on this site.
- A product created by a vendor now starts hidden until staff publish it, and a shop owner
  can no longer change their shop's `is_active` or re-publish a hidden product (ADR 0008,
  `docs/questions.md` Q26). A pending or rejected shop has no public page.
- Rebrand to the Anaar berry (`#9f1f50`) + Zari gold palette (ADR 0003), replacing
  emerald `#16a34a`, which failed WCAG AA contrast (3.30:1) on every primary
  button, price and link. All hard-coded brand hex values now use tokens.
- Storefront accessibility quick wins (`docs/ui-ux-redesign-plan.md`, Phase 0):
  the cart drawer is inert when closed and supports Escape, focus trapping and
  focus return; a mobile menu and header search were added; add-to-cart failures
  are shown to the user; variant, city and payment choices expose `aria-pressed`;
  checkout uses native validation instead of a silently disabled Place Order,
  and adds `autocomplete`/`tel` inputs and an announced error; 44px tap targets
  in the header and cart rows; readable error, input-border and rating-star
  colors; a single `<main>` landmark on category pages; breadcrumb labels;
  global `prefers-reduced-motion` support; `/cart` sign-in now returns to the
  cart (`callbackUrl`).
- Redesign phase 1 (foundations): light/dark design tokens for neutrals, brand,
  gold and semantic colors; Inter + Fraunces fonts; fluid heading sizes; radius
  and shadow scales; stronger default field borders. Ad-hoc Tailwind palette
  colors were replaced with semantic tokens, and password strength now has a
  text label. In dark mode the primary CTA is pink with a dark label.
- Redesign phase 2 (base components): FormField, Input/Textarea/Select,
  RadioGroup (RadioCard/RadioChip), Badge, OrderStatusBadge, Sheet, Toast,
  Breadcrumb, Rating/RatingInput, QuantityStepper, Skeleton and EmptyState.
  Order status badges now show an icon and text. Removing a cart item offers
  Undo. Adding to cart shows a toast with a "View cart" action.
- Redesign phase 3: the cart drawer and a new slide-in mobile menu (search,
  Deliver to, shop, occasions, account, currency) are proper modal dialogs.
  The header has a search box and a "Deliver to" city picker. The chosen city
  is remembered and pre-fills search and checkout. The header no longer
  overflows at any width from 320px up.
- Redesign phase 4: checkout rebuilt. Fields are validated with messages that
  explain the fix, and a focused error summary links to each problem.
  Saved addresses and payment method are radio cards, with the default address
  preselected. Each gift's card message appears in the summary. On phones the
  total and Place Order stay pinned to the bottom. Retrying a failed order
  reuses its Idempotency-Key so it can't be placed twice. Delivery time slots
  are deferred (docs/questions.md Q15).
- Redesign phase 6: the product page has a swipeable image gallery. Sizes are
  radio chips. The price, delivery fee and earliest delivery day follow the
  chosen city, with a same-day countdown only when it's genuinely possible.
  Add to Cart is pinned with the price on phones. The average rating links to
  reviews and ratings show half stars. A trust list is limited to promises the
  service actually makes.
- Redesign phase 7: search, category, occasion and vendor pages share one
  listing. City and price filters and sort live in the URL. The first page is
  server-rendered, "Load more" adds 24 at a time, and a filter sheet is used on
  phones. Cards show "From" correctly and the earliest delivery day. API:
  `GET /products` accepts `sort` (recommended, price_asc, price_desc, newest)
  and `min_price_pkr` / `max_price_pkr`, using the city's price when `city_id`
  is given. With no city chosen, all prices show the base price.
- Redesign phase 5, guest checkout (ADR 0004): buyers can add to the cart and
  place an order without an account. Guest carts use an `X-Cart-Token` header
  and merge into the account cart on sign-in. Guests give an email and phone at
  checkout (stored on the order; migration `0007`) and can upload bank-transfer
  receipts with the order's tracking link. Coupons work for guests; loyalty
  points need an account. Placing orders is rate limited. Also fixed: the
  checkout city select could show "Select city…" while a city was already chosen.
- Redesign phase 8: new home page with a "Deliver to" city finder, a same-day
  rail for the chosen city (honest cutoff countdown), icon category tiles,
  "How it works" and a trust strip. Footer and home copy no longer promise a
  money-back guarantee or on-time delivery, since no refund policy is
  published yet (docs/questions.md Q17).
- Redesign phase 9: the confirmation page leads with bank-transfer details
  (with copy buttons) and receipt upload, explains what happens next, and lets
  buyers share the tracking link. Order timeline fixed: completed orders showed
  no progress and cancelled ones an empty bar. Short order numbers everywhere.
  Branded 404, error and loading screens.
- Redesign phase 10: product images on known hosts are optimised (AVIF/WebP,
  resized). Other hosts still render. New `NEXT_PUBLIC_IMAGE_HOSTS`.
- Redesign phase 11 (ADR 0005): Urdu/RTL readiness. next-intl with a cookie
  locale, `<html lang dir>`, logical CSS throughout, Urdu font fallback, and the
  site chrome translated. Urdu stays behind `NEXT_PUBLIC_ENABLE_URDU` (off).
- E2E suite run against the real stack (8 passed, 1 skipped, stable over 8 runs).
  It exposed and fixed three bugs:
  - A 422 validation error crashed the login, register and checkout pages.
  - Input typed, or a tap on Add to Cart, before the page hydrated was lost.
  - Every add to cart opened the modal cart drawer on top of the confirmation toast.

### Added
- Production dependency audit: bumped `next` 15.5.19 → 15.5.26 (fixes two
  critical unauthenticated RCE advisories), and backend `anyio`,
  `cryptography`, `h2`, `pyasn1`, `pydantic-settings`, `starlette` to their
  latest patched versions (28 known CVEs closed; see `docs/production-gaps.md`
  for the pre-fix audit and `docs/runbook.md` for outstanding infra items).
- Fixed `pnpm-workspace.yaml`'s `allowBuilds` block, which had been left with
  literal placeholder strings (`"set this to true or false"`) instead of
  booleans — this silently made every `pnpm install` block native builds for
  `sharp`/`esbuild`/`core-js`/`unrs-resolver` and would fail CI-adjacent
  installs going forward.
- This `CHANGELOG.md`, reconstructed from git history (Definition of Done
  requires one; none existed previously).

### Fixed
- Web CSP `connect-src` now lists the API origin instead of the full
  `/api/v1` URL. A path without a trailing slash matches only that exact URL,
  so browsers were blocking every API call (sign-in, cart, checkout).
- Vendors can no longer fulfil unpaid orders: non-COD legs are rejected with
  409 until payment is verified, and the vendor queue shows "Awaiting payment".
- Fulfilment status is forward-only (stages may be skipped, never reversed);
  delivered and failed are final; cancelled, refunded and on-hold orders are
  frozen; completed orders are no longer overwritten by the fulfilment sync.
  The vendor queue now shows the API's reason when an update is rejected.
- Order confirmations are queued again: the outbox insert used
  `:payload::jsonb`, which broke bind parsing, and the error was swallowed.
  It now uses `CAST(... AS jsonb)` and failures are logged.
- Bank-transfer receipt upload sends the in-memory access token instead of
  reading a cookie that never existed. Storage failures return 503 instead of
  500, and `start.sh` creates the private MinIO bucket.
- Search works: `/search` queries Meilisearch through the service layer, loads
  results from the database (so inactive products never appear), and falls back
  to a database match when Meilisearch is down. The search page uses it instead
  of filtering the first 48 products in the browser. `start.sh` now passes
  `--env-file .env` to Compose (the Meilisearch key never matched) and rebuilds
  the index with the new `scripts/reindex_search.py`.
- The public vendor storefront (`/vendor/[slug]`) no longer requires a vendor
  login; only the portal routes are protected.
- Reloading `/admin` no longer bounces admins to the login page.
- Deactivated products return 404 on their public page, and the admin toggle
  keeps the search index in step.
- Missing FX rates no longer default to 1: that recorded rupee totals as
  pounds (a Rs 5,850 order as £5,850). Without a rate the charge is in PKR, and
  COD and bank transfers are always charged in PKR.
- Loyalty points are worth PKR 1 each at checkout, as decided in
  docs/questions.md Q9. They were worth PKR 100 (100% cashback).
- A blank greeting message now clears the card instead of storing "".
- The "Shop cakes" hero button was white text on a white fill; it is now
  transparent over the green hero.
- The role cookie that page routing relies on is cleared on logout and when a
  refresh fails, and re-synced on every successful refresh.
- Guest page loads no longer call /auth/refresh (which logged a 401 in the
  console on every page); the session check only runs when a session cookie
  exists. Added a site icon, which removes the remaining favicon 404.
- Rate-limit counters live in Redis under a `tahaif-rl` prefix, so limits are
  shared by all API workers and survive restarts; if Redis is down the limiter
  falls back to per-process counting instead of failing requests.
- Deleting an account also deletes the buyer's saved addresses.
- The database session now commits before the response is sent. FastAPI's
  default dependency scope committed after the response was on the wire, so a
  refresh sent right after login could miss the new token, and a failed commit
  would still have reached the client as a success.
- Login keeps working when Redis is down: the brute-force IP ban fails open and
  logs a warning instead of returning 500.
- Admins open bank-transfer receipts through 15-minute signed links; the stored
  object URL was refused by the private bucket (403). S3 requests now use SigV4
  with a configurable `S3_REGION`.
- Behind a proxy every request looked like it came from the proxy, so login
  rate limits and the IP ban applied to all buyers at once; the ban also
  trusted a client-supplied X-Forwarded-For. Client IPs now come from the
  entry appended by `TRUSTED_PROXY_HOPS` trusted proxies.
- Nothing ran the background jobs, so queued confirmations were never sent and
  FX rates never refreshed. New arq worker (`app.workers.main`) runs from the
  container start script and `start.sh`; the Docker image now includes
  `scripts/` (also needed for the search reindex).
- The outbox sends and commits one message at a time, so a restart never
  re-sends mail, and failures retry on later runs instead of burning all
  attempts at once. Unconfigured Twilio now fails instead of marking SMS sent.

### Added
- North-Star checkout: greeting-card message on the product page and editable
  in the cart; coupon box and loyalty-points toggle at checkout, previewed by
  `POST /checkout/quote` (new `coupon_code`, `use_loyalty_points`,
  `payment_method` parameters and discount fields); send to a saved address.
- Currency choice in the header with approximate prices, saved to the profile;
  public `GET /fx-rates`; orders expose `total_charged`.
- My Account page (profile, currency, data export, account deletion) and
  Addresses page (add, edit, delete, default), replacing "Coming soon".

## 2026-07-22 — Deploy hardening & infra fixes
- CI: added Playwright e2e job for the 5 critical flows.
- Fixed pnpm workspace build context and API health-check path.
- Fixed API Dockerfile `WORKDIR` bug; added Render Blueprint and Railway config
  as alternate deploy targets.
- Tightened mypy/ruff compliance across endpoints and workers.
- Added checkout test coverage: coupons, loyalty burn, variant stock,
  idempotency.
- Fixed a checkout bug: notification-outbox enqueue now guarded with a
  SAVEPOINT so a failed notification write can't roll back the order.
- Fixed admin dashboard reading the wrong auth-store field for the access
  token.
- Documented the Railway backend deploy decision; updated `docs/runbook.md`.
- `.env`/`.vercel/` local files properly gitignored at both repo root and
  `apps/web`.

## 2026-06-14/15 — Phases 1–6 (full build-out)
This was the primary build phase; all six planned phases landed in rapid
succession:
- **Phase 1** — auth & users backend (JWT, OAuth, register/login).
- **Phase 2** — catalog, cart & order backend + Next.js 15 frontend scaffold;
  occasions API, city filter, 81% backend test coverage.
- **Phase 3** — cart, checkout, order tracking; 85% test coverage.
- **Phase 4** — vendor portal (fulfillments, profile, products).
- **Phase 5** — loyalty points, reviews, coupons, banners, testimonials.
- **Phase 6** — hardening pass: perf, a11y, security headers, load-test
  config, deploy config.

Follow-up fixes closing gaps found in the 2026-06-14 production-readiness
audit (`docs/production-gaps.md`):
- Idempotency key enforcement on order placement (migration 0006).
- Stock validation and decrement at checkout; delivery lead-time validation;
  FX conversion and coupon/loyalty-burn wired into checkout.
- S3 proof-of-payment upload endpoint + idempotency key wiring.
- Admin backend API: orders, payment verification, products, FX overrides,
  coupons, users — and the admin frontend replaced its "Coming soon" stub
  with a live order-management dashboard.
- Twilio client, notification outbox worker, and daily FX-rate worker.
- Security: CSP header, HSTS `preload` directive, audit log, brute-force IP
  ban, GDPR export/delete endpoints.
- Newsletter subscribe/confirm with double opt-in.
- Bank IBAN moved out of source into env vars; proof upload added to the
  checkout success page.
- PostHog analytics (pageview, cart, checkout events); JSON-LD, dynamic
  sitemap, and robots.txt for SEO.
- Playwright e2e specs for the 5 critical user flows.
- `docs/runbook.md` (production operations runbook).

## 2026-06-09 — Phase 0
- Monorepo scaffold: Docker Compose, CI skeleton, FastAPI + Next.js
  hello-world.
