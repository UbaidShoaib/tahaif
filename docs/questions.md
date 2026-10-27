# Open Questions

| # | Question | Default until answered |
|---|---|---|
| 1 | Do the card-note content rules (`/terms#card-notes`) and the consent wording meet PECA 2016 / PTA expectations for an intermediary? Who reviews them? | Ship the current wording; have a Pakistani lawyer review before marketing voice notes to the diaspora |
| 2 | How long should reported notes and their reports be kept? | Keep reported notes and reports indefinitely until a retention policy is set; unreported notes stop playing 90 days after delivery |

## Audit log retention (2026-10-17)

How long do we keep `audit_logs` rows (they include staff IP addresses)?
**Default:** keep everything for now; revisit at 100k rows or before the first
GDPR request from staff. Payment-related entries likely need ≥ 5 years for tax.


## Build-your-own buckets (2026-10-20, ADR 0014)

- **Can a bucket mix vendors** (a Layers cake in a florist's hamper)? **Default:** no,
  components come from the base's vendor so one bucket is one delivery.
- ~~Should component products appear in the normal catalog?~~ **Answered 2026-10-20:**
  make them hidden products; builders can still offer them (ADR 0014 §9).
- **Split payment** (each sibling pays a share, like Shareagift)? **Default:** one payer
  checks out; revisit with Stripe in the diaspora phase.
- **Reopening a bucket** after removing it from the cart. **Default:** not supported;
  start a new bucket.
