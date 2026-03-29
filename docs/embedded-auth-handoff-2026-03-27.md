# Embedded Auth Handoff

Date: 2026-03-27 16:45:11 MDT

## Goal
Make the standalone `restock-raven` Shopify app open directly into its embedded dashboard inside Shopify Admin, without merging anything into Clementine Kids Hub.

## What Was Changed
- Updated the app root route so `/` redirects to `/embedded/restock`, preserving Shopify query params like `shop` and `host`.
- Deployed the current `restock-raven` worktree to Vercel production.
- Fixed embedded App Bridge bootstrap so the live embedded route now emits:
  - `meta name="shopify-api-key"`
  - Shopify `app-bridge.js`
- Redeployed that fix to production.

## Current Production URLs
- App root: `https://restock-raven.vercel.app/`
- Embedded route: `https://restock-raven.vercel.app/embedded/restock`

## Current Symptom
Inside Shopify Admin, the embedded page still shows:

`Embedded auth is not ready yet.`

`Shopify App Bridge did not initialize in time`

This is coming from the client waiting for `window.shopify.idToken()` and timing out.

## Important Finding
This is no longer just a missing script/meta problem.

The live deployed HTML for `/embedded/restock` now includes the expected App Bridge bootstrap:
- `meta name="shopify-api-key"`
- Shopify `app-bridge.js`

So the remaining issue is likely a configuration mismatch rather than a missing frontend asset.

## Most Likely Remaining Cause
The highest-probability issue is that the Shopify app credentials in Vercel do not exactly match the Shopify app being opened in Admin.

Most likely:
- `SHOPIFY_CLIENT_ID` in Vercel does not match the actual Shopify app client ID.
- Or `SHOPIFY_CLIENT_SECRET` is stale / from the wrong app / rotated.

Less likely:
- Shopify app settings still point to an older or different embedded app configuration.

## Known Live API Key From HTML
The deployed page currently renders this Shopify API key:

`bba53b15a64f4a1c8427de69c658bde1`

Next time, compare that exact value against the client ID shown in the Shopify Developer Dashboard for the `restock-raven` app.

## Recommended Next Debugging Steps
1. Open Shopify Developer Dashboard for the exact `restock-raven` app.
2. Copy the current client ID and client secret from Shopify.
3. In Vercel project `restock-raven`, verify:
   - `SHOPIFY_CLIENT_ID`
   - `SHOPIFY_CLIENT_SECRET`
   - `APP_BASE_URL=https://restock-raven.vercel.app`
4. If the secret was rotated recently, update Vercel and redeploy.
5. Reopen the app from Shopify Admin after redeploy.

## Files Touched During This Work
- `app/page.tsx`
- `app/embedded/layout.tsx`

## Notes
- We intentionally kept `restock-raven` separate from Clementine Kids Hub.
- The current issue is specifically the embedded Shopify auth/bootstrap path, not the backend restock logic itself.
