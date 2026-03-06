# Deploy Checklist

## Pre-Deploy
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] Migrations reviewed and ready:
  - [ ] `db/migrations/0001_init.sql`
  - [ ] `db/migrations/0002_marketing_opt_in.sql`
- [ ] `.env.example` reflects current required vars.
- [ ] No secrets in git diff.

## Vercel Project
- [ ] Repo connected to Vercel (`main` auto-deploy).
- [ ] Neon linked from Vercel Marketplace.
- [ ] `DATABASE_URL` present in target environment.
- [ ] All required env vars set for Preview and Production.
- [ ] `SHOPIFY_STORE_DOMAIN` is the Shopify admin domain (`*.myshopify.com`).
- [ ] `SHOPIFY_STOREFRONT_BASE_URL` is set to the live storefront domain if using a custom domain (for example `https://clementinekids.com`).

## Database
- [ ] Run migrations in Neon SQL editor (in order).
- [ ] Verify required tables exist:
  - [ ] `restock_subscriptions`
  - [ ] `restock_events`
  - [ ] `variant_inventory_state`
  - [ ] `message_log`

## Integrations
- [ ] Shopify custom app scopes set.
- [ ] Shopify webhook configured:
  - [ ] `inventory_levels/update` -> `/api/webhooks/inventory`
- [ ] Twilio inbound webhook configured:
  - [ ] `/api/webhooks/twilio`
  - [ ] Twilio auth token in Vercel matches the account sending inbound messages, so signature validation passes.
- [ ] Resend sender/domain verified.

## Post-Deploy Verification
- [ ] `GET /api/health/db` returns `ok: true`.
- [ ] `GET /admin/restock` prompts for auth and loads.
- [ ] Test subscribe call succeeds from `https://<storefront-domain>` and fails from an unapproved origin.
- [ ] Simulated inventory `0 -> >0` queues event.
- [ ] Job processor sends exactly one email and/or SMS.
- [ ] STOP reply unsubscribes SMS recipient.

## Rollout
- [ ] Widget only in duplicate theme first.
- [ ] Kill switch off in live theme until validated.
- [ ] Enable on 1-3 products for 24-48 hours.
- [ ] Monitor logs, queue depth, and send volume.
- [ ] Expand gradually.

## Rollback
- [ ] Disable theme kill switch.
- [ ] Disable Shopify webhook subscription.
- [ ] Disable Vercel cron.
- [ ] Keep data for audit and debugging.
