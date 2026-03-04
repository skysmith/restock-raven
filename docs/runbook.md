# Restock Raven Runbook

## Deploy
1. Create Vercel project from this repo.
2. Add Neon from Vercel Marketplace and link it to the project.
3. Add env vars from `.env.example`.
4. Run SQL migrations in Neon SQL editor (in order):
- `db/migrations/0001_init.sql`
- `db/migrations/0002_marketing_opt_in.sql`
5. Deploy.

## Test (Non-destructive)
1. Backend only first (no theme live edits).
2. Set Resend/Twilio to internal test recipients only.
3. In Shopify admin, use a test product variant and test location.
4. Simulate inventory change `0 -> positive`.
5. Verify:
- `restock_events` gets `queued` then `processed`
- `message_log` has one row per channel
- `restock_subscriptions.notified_at` is set once
- `npm run healthcheck` passes

## Post-Deploy Healthcheck
1. Direct database:
- `npm run healthcheck`
2. Deployed endpoint:
- `HEALTHCHECK_MODE=api HEALTHCHECK_URL=\"https://<your-vercel-domain>/api/health/db\" HEALTHCHECK_SECRET=\"<secret>\" npm run healthcheck`

## Rollout Safety
1. Install widget only in duplicate theme.
2. Keep `enable_restock_raven = false` in live theme.
3. Enable on 1-3 products for 24-48h.
4. Monitor Vercel logs + DB message volume.
5. Expand to more products.

## Rollback
1. Set theme kill switch off (`enable_restock_raven = false`).
2. Disable Shopify webhook subscription.
3. Disable Vercel cron or set long interval.
4. Keep data for audit; do not delete tables during incident.
