# ADR 0009 — Instagram/WhatsApp Orders in the System, WhatsApp Sent by Hand

**Date:** 2026-10-17
**Status:** Accepted

## Context

Most sales start on Instagram (reels → DMs) and are closed on WhatsApp. Those
orders lived in chats and notebooks: no tracking link, no vendor portal
entry, no attribution, and nothing stopping lost or duplicate orders. The
system could only *send* WhatsApp through Twilio, which needs a paid account
and approved templates outside the 24-hour window. The default sender was the
Twilio sandbox, which real customers can't receive from. A paid WhatsApp API
is too expensive at the current stage.

## Decision

1. **Staff enter chat orders through normal checkout.** `POST /admin/orders/assisted`
   fills a throwaway guest cart and calls `checkout_service.place_order`, so
   prices, city availability, cutoffs, stock and coupons are the website's.
   Email is optional (`require_contact_email=False`), and phones are stored as E.164
   (`app/core/phone.py`). COD is refused for surprise gifts. A live order from the same
   buyer to the same recipient on the same day returns 409 unless `allow_duplicate`.
   An `Idempotency-Key` header is honoured.
2. **Attribution on `orders`:** `source` (`web|instagram|whatsapp|phone|walk_in`,
   text not a PG enum), `source_ref`, `campaign`, `created_by_staff_id`.
3. **The buyer confirms on the order link page** (`/track/{token}`,
   `POST /orders/by-token/{token}/confirm`). They accept the terms and refund policy, can fix
   recipient name, phone and address while the order awaits payment, and can opt in to offers
   (separate, unticked). `customer_confirmed_at` is the record of what was agreed;
   `marketing_opt_in_at` is consent for promotions (PECA / UK PECR).
4. **WhatsApp is sent by hand via `wa.me` links.** The API writes each message
   (order summary, payment reminder, payment received, dispatched, out for delivery,
   delivered) and a `wa.me/<digits>?text=…` link. The admin panel opens it and records it
   in `order_messages` (one row per order and kind). `GET /admin/whatsapp/queue` lists
   what's due: a summary not yet sent, one reminder 6 h after the summary if the buyer
   hasn't confirmed or uploaded a receipt, "payment received" for verified non-COD
   payments, and only the *latest* delivery step reached.
5. **Automatic WhatsApp off by default:** `WHATSAPP_API_ENABLED=false` drops
   WhatsApp rows at the outbox insert (`notification_tasks._insert`). Email and the
   tracking page still run automatically.

## Consequences

- Zero messaging cost. Staff need the WhatsApp Business app on one company phone (SOP).
- Messages depend on staff working the queue (SOP §4: 10:00/14:00/18:00 PKT).
- Moving to Meta's Cloud API later is one adapter: the queue's "due" logic and texts
  stay; a worker sends them instead of a person. See `docs/whatsapp-integration-options.md`.
- Recipient messages (on-the-way / surprise reveal) are no longer sent automatically
  while the API is off. Follow-up: add them to the queue, addressed to the recipient.
- Inbound messages still don't reach the system (needs the Cloud API webhook; P1).
