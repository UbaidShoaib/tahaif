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
- [x] `utm_campaign` captured on website checkout → `orders.campaign` (normalised: "Eid Reel" → `eid-reel`)
- [x] Admin "Sales by campaign" (`GET /admin/reports/campaigns?days=`): orders, paid, revenue, average per channel × campaign
- [ ] Summary-sent → paid conversion per staff member
- [x] Recipient messages in the manual queue while the API is off: "on its way" (not for surprises) and "delivered" / surprise reveal with the thank-you link; no prices or tracking
- [ ] Admin toggle for a customer's marketing opt-in; auto-cancel unconfirmed orders after 24 h
- [x] Urdu versions of every hand-sent message (`app/services/message_texts_ur.py`; `text_ur`/`url_ur`); English/اردو toggle in admin, remembered per device. **Needs a native-speaker review before heavy use.**
- [ ] Meta catalog feed (`/feeds/meta-catalog.xml`) for Instagram Shopping tags

## P2
- [ ] Meta WhatsApp Cloud API (free in-window replies) + inbound webhook + shared inbox
- [ ] Click-to-WhatsApp ads carrying the campaign ID
