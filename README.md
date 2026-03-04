# Restock Raven (v1)

Private single-store Shopify restock alerts (variant-specific) using Vercel, Neon (via Vercel Marketplace), and Resend, with optional Twilio SMS.

## What v1 includes
- Variant-level subscriptions (`variant_id`)
- Shopify inventory webhook ingest (`inventory_levels/update`) with HMAC verification
- Idempotent queueing for `0 -> >0` transitions
- Cron job processor for email + SMS sends
- SMS compliance language (`Reply STOP to opt out`)
- One-click email unsubscribe link (`/api/restock/unsubscribe?t=...`)
- Basic protected admin page (`/admin/restock`) with search + resend/requeue
- Theme snippet for duplicate theme rollout with kill switch

## API surface
Public:
- `POST /api/restock/subscribe`
- `GET /api/restock/unsubscribe?t=<token>`

Private webhooks:
- `POST /api/webhooks/inventory`
- `POST /api/webhooks/twilio` (STOP handling)

Internal:
- `POST /api/jobs/process`
- `GET /api/admin/restock/subscriptions?q=...`
- `POST /api/admin/restock/requeue`
- `POST /api/admin/restock/trigger` (manual queue by `variantId`)
- `GET /api/admin/restock/export` (CSV export)
- `GET /admin/restock`

Dashboard includes:
- Subscription/event/message KPI cards
- Filterable subscriptions/events/message log
- Pagination for all dashboard tables
- CSV export for filtered subscriptions
- One-click `Trigger + Process Now` action

## Local setup
```bash
cp .env.example .env.local
npm install
npm run dev
```

## Apply DB migration
Run SQL files in order in Neon SQL editor:
- `db/migrations/0001_init.sql`
- `db/migrations/0002_marketing_opt_in.sql`

## Tests
```bash
npm test
```

## Healthcheck
Direct DB check (uses `DATABASE_URL`):
```bash
npm run healthcheck
```

Deployed API check:
```bash
HEALTHCHECK_MODE=api \
HEALTHCHECK_URL="https://<your-vercel-domain>/api/health/db" \
HEALTHCHECK_SECRET="<your-health-secret>" \
npm run healthcheck
```

## Notes
- No OAuth/billing/multi-store support in v1.
- No checkout/cart modifications.
- Location handling is single configured location only in v1.
- Twilio is optional. In email-only mode (no Twilio env vars), phone subscriptions are rejected and SMS sends are skipped.
- Shopify auth supports either:
  - `SHOPIFY_ADMIN_TOKEN` (legacy static token), or
  - `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` (Dev Dashboard client credentials exchange).
- Restock trigger mode:
  - `RESTOCK_TRIGGER_MODE=threshold` (default): queue only when variant inventory goes from `<=0` to `>= RESTOCK_MIN_QTY_FROM_ZERO` (default `11`).
  - `RESTOCK_TRIGGER_MODE=manual`: Shopify inventory webhooks do not auto-queue sends; trigger manually via admin UI or `POST /api/admin/restock/trigger`.

## Operational Docs
- [Security Policy](./SECURITY.md)
- [Deploy Checklist](./docs/deploy-checklist.md)
