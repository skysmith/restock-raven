# Neon via Vercel Marketplace Setup

## 1. Add Neon integration in Vercel
1. Open your Vercel project.
2. Go to `Storage` (or `Marketplace`) and add **Neon**.
3. Create/select a Neon database and link it to this project/environment.

## 2. Confirm environment variables
After integration, confirm `DATABASE_URL` exists in Vercel Project Settings -> Environment Variables.

## 3. Run migration
In Neon SQL editor, run in order:
- `db/migrations/0001_init.sql`
- `db/migrations/0002_marketing_opt_in.sql`

## 4. Verify connectivity
Deploy and call:
- `GET /admin/restock` (with basic auth)
- `POST /api/restock/subscribe` with test payload
- `GET /api/health/db` (with `x-health-secret` if configured)

If queries fail, verify `DATABASE_URL` is set for the correct environment (Preview/Production).
