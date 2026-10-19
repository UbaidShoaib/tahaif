# ADR 0013 — Ordering Inside WhatsApp (Cloud API Bot)

**Date:** 2026-10-19
**Status:** Accepted

## Context

Most of our customers already talk to businesses on WhatsApp. Since ADR 0009 they
can message us there, but a person still has to ask every question, type the
order into the admin panel and send the link back. The website's checkout
(gift → city → option → date → card → recipient → payment) needs none of that.
We want the same flow, inside the WhatsApp chat, working any time of day.

Meta's WhatsApp Cloud API can receive messages through a webhook and reply with
buttons and lists. Replies within 24 hours of the customer's last message need no
approved template, and service conversations the customer starts are free
(see `whatsapp-integration-options.md`). Twilio would add a markup on every message.

## Decision

1. **A bot on the Cloud API, called directly** (`app/integrations/whatsapp_cloud.py`,
   no Twilio). Meta posts every customer message to `POST /api/v1/whatsapp/webhook`;
   the call must carry a valid `X-Hub-Signature-256` (HMAC of the body with the app
   secret) or it's refused. `GET` on the same path answers Meta's one-time verification.
   Everything is off until `WHATSAPP_BOT_ENABLED=true` (404 otherwise).
2. **The website's checkout, as a chat** (`app/services/whatsapp_bot_service.py`):
   city (list) → gift (list, 9 per page + "More", or type its name) → photo and
   price → option (list; sold-out ones hidden) → date (the next 10 dates from the
   earliest the city's lead time and cutoff allow) → card message (or *No card*)
   → recipient name → phone → address (typed, or a shared location pin) →
   landmark (or *Skip*) → surprise? → "from" name → payment (COD hidden for
   surprises) → full summary with the total from `checkout_service.quote` →
   **Place order**. Placing uses a guest cart and `checkout_service.place_order`,
   so prices, availability, cutoffs, stock and the duplicate warning are the
   website's. The order has `source=whatsapp`, `source_ref` "WhatsApp bot · name ·
   number", and `contact_phone` = their WhatsApp number.
3. **Confirmation happens in the chat.** The summary message is followed by the
   terms and refund-policy links and the *Place order* button; tapping it sets
   `customer_confirmed_at`, the record the order link page asks for in ADR 0009.
   The `order_summary` row in `order_messages` is written too, so the staff
   queue doesn't ask anyone to send it again. Payment reminders, "payment
   received" and delivery updates still appear in the staff queue as before.
4. **Payment stays on the order link page.** WhatsApp payments aren't available
   in Pakistan. Bank-transfer customers get the link to see our account details
   and upload the receipt; COD customers get the tracking link.
5. **State in Postgres.** `whatsapp_conversations` (one row per number: step and
   answers so far, row-locked while a message is handled) and
   `whatsapp_inbound_messages` (message ids already handled: Meta retries
   deliveries, so a repeat is a no-op). An order left half-done for 24 hours
   starts over. *menu* restarts, *cancel* clears, *help* hands over to a person.
6. **People stay reachable.** *help* sends a `wa.me` link to `WHATSAPP_TEAM_NUMBER`
   (the team's WhatsApp Business app phone, ADR 0009) when it's set; otherwise the bot
   stays quiet so staff can answer in the same chat (Business app coexistence or
   an inbox on the Cloud API number) until the customer types *menu* or the chat
   has been idle for 12 hours.
7. **The website's "Order on WhatsApp" message works with the bot.** When a message
   contains a product link (`/p/<slug>`), the bot starts with that gift, and takes the
   city, option, card message and `(ref: …)` campaign from the message.

## Consequences

- Customers can order at any hour without waiting for staff; staff only handle
  payments, delivery and the cases where a customer asks for a person.
- Needs a Meta Business account, a WhatsApp Business Account with a phone number on
  the Cloud API, a permanent (system user) access token and the app secret. See
  `runbook.md` → "WhatsApp ordering bot".
- One gift per chat order (quantity 1), like most chat orders. Several gifts, coupons
  and loyalty points stay on the website.
- English only for now. The texts are in one module, ready for an Urdu version like
  `message_texts_ur.py`.
- Automatic order updates (dispatched, delivered…) still go through the outbox
  (Twilio, `WHATSAPP_API_ENABLED`) or the staff queue. Sending them through the Cloud API
  needs approved utility templates for messages outside the 24-hour window: next step.
