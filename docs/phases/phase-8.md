# Phase 8 — Social Orders (Instagram + WhatsApp)

**Status:** P0 built 2026-10-17 · ADR 0009 · SOP `docs/whatsapp-order-sop.md` ·
compliance `docs/compliance-social-orders.md`

## P0 (done)
- [x] Staff-entered orders through checkout (`POST /admin/orders/assisted`), admin "New DM order"
- [x] Order source / ref / campaign / staff, E.164 phones, duplicate guard, COD-surprise block
- [x] Buyer confirmation + terms + marketing opt-in on `/track/{token}`; bank-transfer panel there
- [x] `wa.me` messages, `order_messages` log, admin "Messages to send" queue + per-order WhatsApp buttons
- [x] `WHATSAPP_API_ENABLED` flag (default off)
- [x] Migration `0016_social_orders`

## P1 (next)
- [x] "Order on WhatsApp" button on product pages (prefilled product, option, price, city, card message, link; `utm_campaign` remembered for the visit and sent as `(ref: …)`; PostHog event `order_on_whatsapp`). Hidden unless `NEXT_PUBLIC_SUPPORT_WHATSAPP` is set
- [ ] UTM capture (`utm_source/utm_campaign`) on web cart → order `source`/`campaign`
- [ ] Admin report: orders and revenue by source/campaign; summary-sent → paid conversion
- [ ] Recipient messages (on the way / surprise reveal) in the manual queue
- [ ] Admin toggle for a customer's marketing opt-in; auto-cancel unconfirmed orders after 24 h
- [ ] Urdu versions of message texts
- [ ] Meta catalog feed (`/feeds/meta-catalog.xml`) for Instagram Shopping tags

## P2
- [ ] Meta WhatsApp Cloud API (free in-window replies) + inbound webhook + shared inbox
- [ ] Click-to-WhatsApp ads carrying the campaign ID
