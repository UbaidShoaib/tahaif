# ADR 0010 — Card Note Safety: Consent, Reports, Rate Limit, Expiry

**Date:** 2026-10-17
**Status:** Accepted

## Context

Buyers can attach a voice/video note to a gift's card, and the recipient plays
it from a QR code (`/note/{note_token}`), now recorded in the browser too.
That is user content we host. Under PECA 2016 (amended 2025) and PTA blocking
rules, an intermediary is expected to show reasonable steps against abuse and
act quickly when told. Recipients (often elderly parents) can't be asked to
log in.

## Decision

1. **No login to play or report.** The `note_token` (random UUID) is the only
   permission. It unlocks only the note, never the order (ADR 0004 pattern).
2. **Consent before upload.** `POST /orders/by-token/{t}/items/{id}/note`
   requires form field `accepted_terms=true` (else 422). The time and client IP
   are stored on `order_items.note_consent_at` / `note_consent_ip` and cleared
   with the note. The rules live at `/terms#card-notes`.
3. **Reports.** `POST /notes/{note_token}/report` with `reason`
   (`abusive|threatening|sexual|hateful|unwanted|other`) and optional `details`.
   Rows go into `card_note_reports`, one per (item, reporter IP), with repeats a
   no-op. Reports are kept even if the note is removed. Each report logs
   `card_note_reported` (warning).
4. **Rate limits** (per client IP, Redis-backed slowapi): play `60/hour`,
   report `5/hour`, attach `10/hour` (unchanged).
5. **Admin review** (admin "Reported notes" tab, `GET /admin/note-reports?status=open|all`).
   Staff listen to the note, see the reports and the buyer's consent record, then
   `POST /admin/note-reports/{item_id}/disable` (sets `order_items.note_disabled_at/_by`;
   QR 404s; the file is kept as evidence; a buyer re-upload doesn't lift it) or `/dismiss`.
   Both close the open reports (`status` `note_disabled` / `dismissed`, `resolved_by/_at`).
   `/restore` undoes a take-down. Only items that have a report can be acted on.
6. **Expiry.** A note returns 404 `NOTE_EXPIRY_DAYS` (default 90) after its
   fulfillment's `delivered_at`. Undelivered gifts never expire. The object
   stays in storage; deleting it is a later retention job.

## Consequences

- Anyone holding the printed card can play the note until expiry. That's
  accepted, the same as reading a paper card.
- Staff can only act on notes someone reported. The next step is automatic
  screening (speech-to-text + moderation) that holds flagged notes before the
  QR is printed.
- The content rules text needs review by a Pakistani lawyer (docs/questions.md).
