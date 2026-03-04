# Restock Raven (v1)

Private single-store Shopify restock alerts (variant-specific) using Vercel, Neon (via Vercel Marketplace), Resend, and Twilio.

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
- `GET /admin/restock`

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
