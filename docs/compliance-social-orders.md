# Compliance Note — Instagram & WhatsApp Orders

**Status:** Working note, not legal advice. Have a Pakistani lawyer review it
before scale (and a UK data-protection check for diaspora marketing).
**Date:** 2026-10-17

## How we use WhatsApp

Staff send messages by hand from the WhatsApp Business app, using `wa.me`
click-to-chat links that the admin panel fills in (ADR 0009). `wa.me` is an
official WhatsApp feature, so using it is not a compliance issue. The risks
come from how we message and how we handle data.

## Obligations and how the system and SOP meet them

| Source | Obligation | How we meet it |
|---|---|---|
| WhatsApp Business Terms / Commerce Policy | No prohibited goods (alcohol, adult, some medicines); no spam; honour opt-outs. Breaking this gets the number banned | Catalog is gifts only. SOP §1.4 + §6. Only buyers who contacted us are messaged |
| PECA 2016 (Pakistan) | No unsolicited marketing messages without consent; no misuse of identity information | Order messages only, by default. Marketing needs `marketing_opt_in_at` (ticked on the order link page) |
| Pakistan Personal Data Protection Bill (status: **check whether enacted**) | Minimum data, security, deletion on request | We collect only order data. Business phone is secured (SOP §1.1). Deletion handled by request to support |
| Provincial consumer protection acts (e.g. Punjab CPA 2005) | Clear price, charges, refund terms before sale | Order link page shows the itemised total and requires accepting the terms and refund policy (`customer_confirmed_at`) |
| UK/EU GDPR + UK PECR (diaspora buyers) | Lawful basis; separate unticked opt-in for marketing; privacy notice | Order messages = contract. Marketing opt-in is a separate unticked box. Privacy policy must mention WhatsApp/Instagram (TODO) |
| PCI-DSS (card schemes) | No card data in chats or by phone | SOP §1.2. Cards only via website checkout |
| FBR | Proper invoice/receipt | Order page is the receipt (itemised, with order number). A formal invoice is a separate TODO |

## Disputes

The record of what was agreed is the order **as the customer confirmed it** on
the order link page (timestamped), not the chat history on a phone.

## Open items

- Update `/privacy` to name WhatsApp and Instagram as communication channels,
  and state retention (suggest: chats deleted from the phone after 90 days, once the order is complete).
- Confirm the PDPB status and the FBR invoice requirements with an accountant.
- Admin control to turn off a customer's marketing opt-in (P1; until then, a manager does it in the database).
