# Open Questions

| # | Question | Default until answered |
|---|---|---|
| 1 | Do the card-note content rules (`/terms#card-notes`) and the consent wording meet PECA 2016 / PTA expectations for an intermediary? Who reviews them? | Ship the current wording; have a Pakistani lawyer review before marketing voice notes to the diaspora |
| 2 | How long should reported notes and their reports be kept? | Keep reported notes and reports indefinitely until a retention policy is set; unreported notes stop playing 90 days after delivery |

## Audit log retention (2026-10-17)

How long do we keep `audit_logs` rows (they include staff IP addresses)?
**Default:** keep everything for now; revisit at 100k rows or before the first
GDPR request from staff. Payment-related entries likely need ≥ 5 years for tax.

