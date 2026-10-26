# ADR 0015 — Page Layouts Chosen from the Layout Book

**Date:** 2026-10-26
**Status:** Accepted

## Context

Every customer and back-office page was mocked three ways (desktop + phone) in
the "Bouquet Bar Page Layouts" decision book (claude.ai artifact
`P5w4gnCqEYkD7LxS4kVAXB`; tracking had its own four-option page). One option was
chosen per page. This ADR records the picks and the rules that came with them,
so later work keeps to them.

## Decision

| Page | Pick | What it means in code |
|---|---|---|
| Home | A, occasion-first | Hero form asks city, arrival day and occasion together (`HeroFinder`); then occasion tiles, then popular gifts. |
| Shop / category / occasion / search | B, top chip bar | No sidebar or filter sheet. One chip row above a full-width grid on every screen: **Arrives tomorrow** first, then city, price, sort (`ProductListing`). |
| Product | B, step-by-step builder | Buy box is three steps — Size, When (city + arrival day), Your card — each opening after the last, with a summary and a way back (`VariantPicker`). |
| Cart | A, grouped by recipient | One card per recipient and delivery day (`lib/cart-groups.ts`). |
| Checkout | B, multi-step wizard | Recipient → You → Pay, each step validated before moving on; Pay reviews the recipient. Signed-in buyers skip You. |
| Confirmation | A, next-step card | Thanks + whose gift is booked for when, then the one next action (bank transfer) or "nothing more to do" (COD). |
| Tracking | B, split view + photo hero | Story (status, delivery photo, progress, delivery) left; card, summary, help in a sticky right column on wide screens. |
| Account | B, people-first (C until people are saved) | Saved people soonest occasion first with "Send a gift"; recent orders and points below; settings last. With nobody saved, orders lead. |
| Sign in | A, centred card | Small card on a quiet page. |
| Vendor portal | A, today's queue | Opens on today's counts and orders by slot, one big next-step button each. |
| Back office | A, attention inbox | Opens on *Needs attention*: receipts to verify, WhatsApp messages due, late orders, each with its action. |

Rules that come with the picks:

1. **Arrival day is a real filter.** `GET /products?deliver_on=YYYY-MM-DD&city_id=…`
   keeps gifts whose same-day cutoff is still ahead (for today) or whose lead
   time ends before that day is over — the same rule as the web's
   `earliestDelivery`. The web carries it in the URL as `?on=`; it only applies
   with a city. Text search applies it client-side on its ≤100 matches.
2. **The day picked on a product goes onto the cart line** (`delivery_date`) and
   checkout starts from the earliest such day still ahead.
3. **"Needs attention"** is defined in `attentionRows` (`AttentionInbox.tsx`):
   a bank-transfer order in `pending_payment` with a receipt; any due WhatsApp
   queue message; an active order past its delivery day, or due today and still
   `paid`.

## Not built (and why)

- **Delivery time-slot chips** on the product page and in checkout: there is no
  slot catalogue yet (`delivery_slot` is free text set by staff). The vendor
  queue groups by slot when one is set.
- **"Send to someone else"** in the cart: checkout places one order to one
  address, so multiple recipients per checkout needs API work first.
- **Continue with Google** on sign-in: the API's Google OAuth callback returns
  JSON instead of redirecting back to the web app, and the authorize endpoint
  sets its state cookie on a response it doesn't return. Fix those before adding
  the button.
- Optional extras the book parked for later: seasonal band on home, Arrives
  tomorrow badge per card, slide-out "added" drawer, KPI strip and global search
  on the back office.

## Consequences

- The listing has one layout everywhere; filters beyond ~7 chips will need a
  "More" chip.
- Buying takes more taps on the product page; choices persist across adds so a
  second gift only needs a new card.
