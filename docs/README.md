# Tahaif Docs Index

| File | Purpose |
|---|---|
| [dependencies-and-credentials.md](dependencies-and-credentials.md) | Every service, credential, and env var — cost, account creation, and setup instructions |
| [runbook.md](runbook.md) | Production operations: deployments, rollbacks, incident response, email (Resend) setup |
| [catalog-template.md](catalog-template.md) | Template for the opening catalog (`catalog.json`): structure and rules for vendors, products, options, photos and per-city delivery |
| [decisions/](decisions/) | Architecture Decision Records (ADRs) |
| [decisions/0009-social-orders-manual-whatsapp.md](decisions/0009-social-orders-manual-whatsapp.md) | Instagram/WhatsApp orders entered by staff through checkout; buyer confirms on the order link; WhatsApp sent by hand via `wa.me` + admin queue |
| [decisions/0010-card-note-safety.md](decisions/0010-card-note-safety.md) | Card voice/video notes: consent before upload, public report link, admin review/take-down, play/report rate limits, 90-day expiry after delivery |
| [questions.md](questions.md) | Open questions with defaults (legal review of card-note rules, retention) |
| [whatsapp-order-sop.md](whatsapp-order-sop.md) | SOP for staff taking orders in Instagram DMs and WhatsApp |
| [compliance-social-orders.md](compliance-social-orders.md) | Compliance note: WhatsApp policy, PECA, consumer protection, GDPR/PECR, PCI for chat orders |
| [whatsapp-integration-options.md](whatsapp-integration-options.md) | Free/low-cost WhatsApp integration options, workflow value, market practice |
| [phases/phase-8.md](phases/phase-8.md) | Phase 8 — social orders: P0 done, P1/P2 backlog |
| [decisions/0008-vendor-applications.md](decisions/0008-vendor-applications.md) | How a shop joins: application at `/sell`, staff approval (bank details + CNIC required), vendor products hidden until published |
| [decisions/0007-single-vps-deploy.md](decisions/0007-single-vps-deploy.md) | Active deploy target: whole stack on one VPS (Docker Compose + Caddy) |
| [phases/](phases/) | Per-phase planning notes |
