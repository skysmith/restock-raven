# Shopify Embedded Admin Roadmap

## Goal
Move the operator-facing Restock Raven dashboard into the Shopify app experience while keeping backend infrastructure on Vercel where it belongs.

## Keep on Vercel
- Next.js server app and API routes
- Shopify webhook intake
- queue processing and cron execution
- Neon database access
- email and SMS delivery
- export and operational backend actions

## Move into the Shopify app experience
- the restock operations dashboard
- queue and webhook visibility
- manual trigger and resend controls
- future settings and product-level controls

## Phases
### Phase 1: Shared dashboard surface
- Extract `/admin/restock` into a shared server component.
- Add a second route intended for the Shopify-facing app surface.
- Keep the current standalone route alive during migration.

Status:
- Started March 27, 2026.

### Phase 2: Shopify auth
- Replace basic auth for operators with Shopify session validation.
- Gate embedded admin routes by Shopify staff access.

Status:
- Started March 27, 2026.
- Added Shopify session-token verification utilities and authenticated embedded summary endpoints.

### Phase 3: Embedded shell
- Add App Bridge navigation and proper embedded behavior.
- Replace the standalone look with Shopify-native admin styling.
- Add app navigation for overview, subscriptions, events, messages, and settings.

### Phase 4: Operational workflows
- Move webhook/process/requeue flows behind authenticated app actions.
- Add richer in-app feedback for failures and delivery status.

### Phase 5: Storefront cleanup
- Keep the current theme snippet working while the app admin stabilizes.
- Evaluate a theme app extension or cleaner storefront install flow later.

## Immediate next steps
1. Wire `/embedded/restock` into Shopify session auth.
2. Point the Shopify app home or preferences URL at the embedded route.
3. Add App Bridge and embedded navigation.
4. Retire basic auth once the embedded route fully replaces the standalone admin.

## Notes
- “Put everything in the frontend” is not the right target here.
- The right split is Shopify-embedded admin UI plus Vercel-hosted backend services.
