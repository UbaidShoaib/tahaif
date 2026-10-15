# ADR 0008 — Shops Open by Application, With Staff Approval

**Date:** 2026-10-14
**Status:** Accepted

## Context

Sign-up is public, so every new account is a buyer. There was no way for a
shop to join except by hand on the server, and `POST /vendors` let any
signed-in user create a shop they owned and list products with no review.

## Decision

A shop joins by applying, and nothing an applicant does alone becomes public.

- **Application = a hidden vendor row.** `POST /vendor/application` (any
  signed-in user; web page `/sell`) creates a `vendors` row owned by the
  applicant with `is_active = false` and `approval_status = 'pending'`. No
  separate applications table: an approved application *is* the shop, so there
  is nothing to copy across and one status to read.
- **Staff decide.** Admin panel → "Shop applications" lists pending ones;
  approve sets `approved` + `is_active = true` and raises the owner from
  customer to vendor (staff and admins keep their role); reject records an
  optional note shown to the applicant, who may edit and resend the same row.
  A decision is final for that submission (409 on a second one).
- **`approval_status` is text, not a Postgres enum** (`pending`, `approved`,
  `rejected`), default `approved` so shops created by staff need no review.
- **Owners cannot approve themselves.** Only staff may create a vendor
  directly, change a vendor's `is_active`, or publish a product.
- **Vendor products start hidden.** A product created by a vendor is
  `is_active = false` until staff publish it (admin panel → "Hidden
  products"). A vendor may hide their own product but not re-publish it.
  Default chosen for safety; see `docs/questions.md` Q26.
- **Admin and staff roles are never self-service.** They are granted only by
  an existing admin (`PATCH /admin/users/{id}/role`).
- A pending or rejected shop has no public page (`GET /vendors/{slug}` → 404)
  and no vendor-portal access.

## Consequences

- The applicant learns the outcome by returning to `/sell`; there is no email
  or WhatsApp notice yet (those providers are not configured).
- On approval the applicant's open session still says "customer"; `/sell`
  refreshes the session so the vendor portal opens without a new login.
- "Hidden products" also lists products staff took down; the two are not
  distinguished. Add a product approval status if that becomes confusing.
- Vendors still have no screen to add products; they use the API until one is
  built.

## Amendment (2026-10-16): verification before approval

- An application must carry **payout bank details** (account title, bank,
  Pakistani IBAN, validated as `PK` + 2 digits + 4-letter bank code + 16
  digits and stored without spaces) — required by the form and the API.
- Applicants upload **documents** after applying (`POST /vendor/application/documents`,
  multipart `kind` + `file`; JPEG/PNG/WebP/PDF ≤ 10 MB). Kinds: `cnic_front`,
  `cnic_back` (both **required**), `business_registration`, `shop_photo`
  (optional). Sending a kind again replaces it; documents can change only
  while the application is pending or rejected.
- **Approve returns 409** until bank details and both CNIC sides exist; the
  admin queue disables the button and lists what is missing.
- Files live in the private bucket under `vendor-docs/{vendor_id}/`, rows in
  `vendor_documents`. Only staff get signed links (15 min); the owner sees
  file names only. Bank details are never on public vendor endpoints.
- Phone OTP is still not done (needs Twilio).
