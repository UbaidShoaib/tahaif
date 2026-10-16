# WhatsApp + Our Platform — Free and Low-Cost Options, Market Practice

**Date:** 2026-10-17 · Related: ADR 0009, `whatsapp-order-sop.md`

## 1. The options, cheapest first

| # | Option | Cost | What it can do | Limits |
|---|---|---|---|---|
| 1 | **WhatsApp Business app + `wa.me` links** (what we built, ADR 0009) | Free | Staff send prefilled messages from the admin queue; customers tap "WhatsApp us" on the site; a catalog inside the app; quick replies, labels, away/greeting messages | Human sends every message; nothing reaches our system automatically; one phone (+ up to 4 linked devices) |
| 2 | **WhatsApp Business app features** (no code) | Free | **Catalog** (mirror top products), **labels** (New / Awaiting payment / Paid / Dispatched), **quick replies** (`/summary`, `/bank`), greeting and away messages, **broadcast lists** (only to people who saved our number) | Manual; not linked to orders |
| 3 | **Meta WhatsApp Cloud API, directly** (no Twilio) | Free to set up. Replies within 24 h of the customer's last message are free; utility templates (order updates) sent in that window are free; templates outside it are paid per message, at low rates in Pakistan | Automatic order updates, **inbound messages into our system**, buttons ("Confirm", "Track"), shared inbox for several agents | Business verification; template approval; the number can't also be used in the phone app; check Meta's pricing page — a third-party blog claims in-window messages become paid from Oct 2026, which Meta's docs don't confirm |
| 4 | Twilio / 360dialog / Gupshup and other BSPs | Meta fee + markup | Same as 3, with dashboards | Markup is what made this "expensive" |
| 5 | SaaS inboxes (WATI, Interakt, SleekFlow, respond.io) | ~$40–100+/month | Shared inbox, chatbot builder, broadcasts, Shopify-style plugins | Monthly fee; another place where order data lives |
| ✗ | Unofficial libraries (whatsapp-web.js, Baileys, "WhatsApp automation" tools) | Free | Automate a normal account | **Breaks WhatsApp's terms; number bans are common.** Don't use |

**Recommendation:** stay on 1 + 2 now (done, zero cost). Move to **3 (Cloud API
directly)** once messages per day make the manual queue painful, roughly 30–50 orders a day.
Because most of our messages are replies within 24 hours of the customer writing to us,
the cost should stay low. Our code is ready: the queue logic and message texts stay,
and a worker sends them instead of a person.

## 2. Where WhatsApp adds value in our workflows

| Workflow | Today | With what we built (free) | Later with the Cloud API |
|---|---|---|---|
| Taking orders from reels/DMs | Notebook/memory | Admin "New DM order": checkout rules, duplicate guard, attribution | "Create order from this chat" in the inbox |
| Payment | Screenshots in chat | Order link: confirm + upload receipt; staff verify | Auto "payment received" |
| Status updates | Ad hoc | Queue tells staff exactly who to message and when | Automatic utility templates |
| Delivery proof | Photo forwarded by hand | Delivered message links to the POD photo on the tracking page | Same, automatic |
| Recipient thank-you | — | Already in the product (thank-you page) | Thank-you reply relayed automatically |
| Reminders / repeat sales | — | Occasion reminders (email); WhatsApp to opted-in buyers by hand | Marketing templates to opted-in buyers only |
| Vendors (shops) | Calls | — | New-order alert to the shop on WhatsApp |
| Attribution | Unknown | `source` + `campaign` on every order | Click-to-WhatsApp ads carry the ad ID |

## 3. What's going on in the market

- **Pakistani gift and flower shops close sales on WhatsApp.** Many local shops
  take orders over WhatsApp and accept COD, JazzCash/EasyPaisa, bank transfer and
  international cards. Others combine a website with WhatsApp support, sending a
  confirmation and a delivery photo. Our differentiator: the same chat-based experience,
  but with a real order, a tracking page, a delivery photo and confirmed details.
- **Click-to-WhatsApp ads** (Instagram/Facebook ads whose button opens a chat) are
  the main way to run ads in conversational commerce. Next step for our reels once paid.
- **Meta moved to per-message pricing (July 2025)** and made replies and utility
  messages within the customer's 24-hour window free. That favours businesses like us,
  where the customer writes first.
- **WhatsApp payments**: not available in Pakistan, so payment stays on our site.
- **Catalogs in chats / Instagram Shopping tags**: shops sync their product feed to
  Meta so products appear in WhatsApp and Instagram. This is our P1 catalog feed item.
- **AI chat assistants** answering FAQs (cities, cutoffs, prices) and handing over to a
  human are now common on the paid platforms. Worth it only after the Cloud API.

## Sources
- Meta: <https://developers.facebook.com/docs/whatsapp/pricing>
- SleekFlow pricing guide: <https://help.sleekflow.io/en_US/whatsapp/pricing>
- EngageLab (claims a 2026 change, unconfirmed): <https://www.engagelab.com/blog/whatsapp-pricing-2026-service-message-cost>
- Market examples: <https://www.trustpilot.com/review/bloomnbeyond.pk>, <https://ie.trustpilot.com/review/theflowerstudio.pk>, <https://images.dawn.com/news/1187088>
