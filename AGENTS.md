# AGENTS.md

## Project Role

Restock Raven is the single-store Shopify restock-alert app for variant subscriptions, inventory webhooks, queued customer notifications, and an admin dashboard.

This repo touches Shopify, Vercel, Neon, Resend, optional Twilio SMS, customer subscription data, webhooks, cron processing, and runtime secrets. Treat operational work here as sensitive by default.

## Start Here

Read these before changing behavior, deployment, webhooks, notifications, or runtime settings:

- `README.md` for project scope, API surface, local setup, tests, and trigger modes
- `SECURITY.md` for secret handling, required runtime secrets, hardening, and incident response
- `docs/runbook.md` for deploy, non-destructive tests, trigger strategy, rollout, and rollback
- `docs/deploy-checklist.md` before any deploy, migration, or integration change
- `/Users/sky/Documents/codex/wiki/runbooks/restock-raven-operations.md` for root-wiki routing and current operational cautions

## Safety

This repository is public-facing. Treat all code and docs as public information.

- Never commit or print `.env`, `.env.local`, API tokens, webhook secrets, database URLs, Resend keys, Twilio credentials, Shopify tokens, admin passwords, or customer exports.
- Pause for explicit approval before Vercel production deploys, env changes, cron changes, Neon migrations or production data mutations, Shopify webhook/scope/theme changes, Resend/Twilio sends, or admin `Trigger + Process Now`, resend, or requeue actions.
- Prefer read-only checks first: `npm test`, `npm run build`, `npm run healthcheck`, and source-doc review.
- Use variable names in notes and summaries, not secret values.
- Keep live theme rollout conservative: duplicate theme first, kill switch off in live theme until validated, and expand gradually.
- During incidents, preserve data for audit; do not delete production tables unless Sky explicitly approves the destructive action.

## Local Commands

```bash
npm install
npm run dev
npm test
npm run build
npm run healthcheck
```

For deployed health checks, use the command shape in `README.md` or the wiki runbook, but do not expose the actual `HEALTHCHECK_SECRET`.

## Root Codex Wiki

This project lives under `/Users/sky/Documents/codex`.

When the user says "the wiki", "root wiki", "Codex wiki", or asks to save durable context, use `/Users/sky/Documents/codex/wiki/index.md` as the entrypoint.

Treat the wiki as the LLM-maintained synthesis layer. Source docs in this project remain authoritative; update or cite them when precision matters, and link durable cross-project context back into the wiki when it should be discoverable from the wider workspace.
