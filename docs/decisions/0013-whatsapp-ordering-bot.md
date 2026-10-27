# ADR 0013 — Shopping Inside WhatsApp: Catalog, Checkout and Payment (Cloud API Bot)

**Date:** 2026-10-19
**Status:** Accepted

## Context

Most of our customers already talk to businesses on WhatsApp. Since ADR 0009 they
can message us there, but a person still has to ask every question, type the
order into the admin panel and send the link back, and the customer still has to
open the website to pay. We want the whole website flow inside the chat:
browse the catalog, check out, pay and hear that the payment was confirmed.

Meta's WhatsApp Cloud API receives messages through a webhook, replies with buttons
and lists, shows products from a Meta Commerce catalog (with photos and a native
cart), and delivers photos customers send. WhatsApp payments aren't available in
Pakistan, so payment is by bank transfer (receipt photo) or cash on delivery.

## Decision

1. **A bot on the Cloud API, called directly** (`app/integrations/whatsapp_cloud.py`,
   no Twilio). Meta posts every customer message to `POST /api/v1/whatsapp/webhook`;
   the call must carry a valid `X-Hub-Signature-256` (HMAC of the body with the app
   secret) or it's refused. `GET` on the same path answers Meta's one-time verification.
   Everything is off until `WHATSAPP_BOT_ENABLED=true` (404 otherwise).
2. **Our catalog in WhatsApp.** `GET /api/v1/whatsapp/catalog.csv` is a data feed for
   Meta Commerce Manager: one item per product option (grouped by product with
   `item_group_id`), or per product without options; price in PKR, photo, link,
   in/out of stock. Only active products with a public photo that some city can get
   are listed. With `WHATSAPP_CATALOG_ID` set, after the city the bot sends a product
   list of what that city can get (up to 30 items); the customer opens photos and
   details, adds gifts and quantities to the **WhatsApp cart** and sends it. Without
   a catalog the bot falls back to a plain list, one gift at a time.
3. **The website's checkout, as a chat** (`app/services/whatsapp_bot_service.py`):
   city → gifts (cart, list, or a typed name) → option → date (the next 10 dates from
   the earliest every gift's lead time and cutoff allow) → card message (or *No card*;
   one card per order, on the first gift) → recipient name → phone → address (typed,
   or a shared location pin) → landmark → surprise? → "from" name → payment (COD
   hidden for surprises) → full summary with the totals from `checkout_service.quote`
   → **Place order**. Placing uses a guest cart and `checkout_service.place_order`, so
   prices, availability, cutoffs, stock and the duplicate warning are the website's.
   Gifts from a cart that can't go to the chosen city are named and another city is
   asked for. The order has `source=whatsapp`, `source_ref` "WhatsApp bot · name ·
   number", and `contact_phone` = their WhatsApp number.
4. **Confirmation happens in the chat.** The summary is followed by the terms and
   refund-policy links and *Place order*; tapping it sets `customer_confirmed_at`, the
   record the order link page asks for in ADR 0009. The `order_summary` row in
   `order_messages` is written too, so the staff queue doesn't ask for it again.
5. **Payment in the chat.** Bank-transfer customers get the amount and our account
   (`BANK_ACCOUNT_NAME`, `BANK_IBAN`) in the chat and are asked to send the receipt as
   a photo or PDF. The bot downloads it from Meta and attaches it to their latest bot
   order still waiting for one (`checkout_service.attach_transfer_proof`, the same as
   the order page upload), which moves the payment to *awaiting verification*.
   **A person still verifies every payment** against the bank app (SOP §3; a
   screenshot alone is not proof). When staff press *Verify payment* in the admin,
   the customer is told in the chat: approved ("payment received", and the staff
   queue's "payment received" message is ticked off) or rejected (asked for a clearer
   receipt). If Meta refuses the message because the customer's last message is more
   than 24 hours old, nothing is ticked off and the staff queue still lists it.
6. **State in Postgres.** `whatsapp_conversations` (one row per number: step and
   answers so far, row-locked while a message is handled) and
   `whatsapp_inbound_messages` (message ids already handled: Meta retries
   deliveries, so a repeat is a no-op). An order left half-done for 24 hours
   starts over. *menu* restarts, *cancel* clears, *help* hands over to a person.
7. **People stay reachable.** *help* sends a `wa.me` link to `WHATSAPP_TEAM_NUMBER`
   when it's set; otherwise the bot stays quiet so staff can answer in the same chat
   until the customer types *menu* or the chat has been idle for 12 hours.
8. **The website's "Order on WhatsApp" message works with the bot**: a product link
   (`/p/<slug>`) starts with that gift, and the city, option, card message and
   `(ref: …)` campaign are taken from the message.

## Consequences

- Customers can browse, order and send the receipt at any hour; staff only verify
  payments, run deliveries and answer customers who ask for a person.
- **Cost.** Meta charges per message delivered. From 1 October 2026 the first 1,000
  service messages (replies inside the 24-hour window) per number per month are free,
  then roughly USD 0.015 each in Pakistan (reported; check Meta's rate card). A
  catalog order is about 14–16 bot messages, so roughly USD 0.20–0.25 an order after
  the free 1,000. Chats from Click-to-WhatsApp ads are free for 72 hours.
- Needs a Meta Business account, a WhatsApp Business Account with a number on the
  Cloud API, a permanent access token, the app secret and, for the catalog, a Commerce
  Manager catalog connected to the WhatsApp account. See `runbook.md`.
- The product list shows at most 30 items per city; customers can type a name for the
  rest. Coupons and loyalty points stay on the website.
- English only for now; the texts are in one module, ready for Urdu.
- Delivery updates (dispatched, delivered…) still go through the outbox (Twilio,
  `WHATSAPP_API_ENABLED`) or the staff queue. Sending them through the bot's number
  needs approved utility templates for messages outside the 24-hour window: next step.
