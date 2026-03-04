# Security Policy

## Scope
This repository is public. Treat all code and docs as public information.

## Supported Versions
- `main` (active)

## Secret Handling
- Never commit `.env`, `.env.local`, API tokens, webhook secrets, or credentials.
- Use Vercel environment variables for runtime secrets.
- Use separate secrets for Preview and Production.
- Rotate secrets immediately if exposed.

## Required Runtime Secrets
- `DATABASE_URL`
- `APP_BASE_URL`
- `CRON_JOB_SECRET`
- `HEALTHCHECK_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `SHOPIFY_STORE_DOMAIN`
- `SHOPIFY_ADMIN_TOKEN`
- `SHOPIFY_WEBHOOK_SECRET`
- `SHOPIFY_LOCATION_ID`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`

## Hardening Checklist
- Keep admin routes protected with Basic Auth.
- Keep cron endpoint protected with `CRON_JOB_SECRET`.
- Keep health endpoint protected with `HEALTHCHECK_SECRET`.
- Verify Shopify webhook HMAC on every webhook request.
- Verify Twilio STOP handling is active (`/api/webhooks/twilio`).
- Keep theme kill switch (`enable_restock_raven`) off by default in live theme.

## Reporting a Vulnerability
If you find a security issue, do not open a public issue with exploit details.
Contact the maintainer directly and include:
- Affected endpoint/file
- Impact
- Repro steps
- Suggested mitigation

## Incident Response (Quick)
1. Disable theme kill switch in Shopify (`enable_restock_raven = false`).
2. Disable Shopify webhook subscription.
3. Disable Vercel cron for `/api/jobs/process`.
4. Rotate all impacted secrets in Vercel.
5. Review Vercel logs + Neon query logs.
6. Patch, redeploy, and re-enable gradually.
