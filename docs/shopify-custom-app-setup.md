# Shopify Custom App Setup (Single Store, Private)

## 1. Create custom app in Shopify Admin
1. Go to `Settings -> Apps and sales channels -> Develop apps`.
2. Create app `Restock Raven`.
3. Grant Admin API scopes:
- `read_inventory`
- `read_orders`
- `read_products`
- `read_locations`
- `write_webhooks`
- `write_customers`
4. Install app and copy Admin API token.

Notes:
- `read_orders` is required if you want downstream tools like the Clementine Kids dashboard sync to import recent orders and open-order counts.
- `write_customers` is required to add opted-in restock subscribers to Shopify Email marketing after their restock alert is sent.
- If you add a new scope to an existing custom app, save the scope change and reinstall or update the app access in Shopify before expecting the new permission to work.

## 2. Configure env vars in Vercel
Set:
- `SHOPIFY_STORE_DOMAIN`
- `SHOPIFY_ADMIN_TOKEN`
- `SHOPIFY_WEBHOOK_SECRET`
- `SHOPIFY_LOCATION_ID`

Notes:
- `SHOPIFY_STORE_DOMAIN` should be the Shopify admin/store domain, typically `your-store.myshopify.com`.
- If the storefront runs on a custom domain, also set `SHOPIFY_STOREFRONT_BASE_URL` so browser subscribe requests and email links use the live storefront domain.

## 3. Register webhook
Use Shopify Admin GraphQL to create `inventory_levels/update` webhook pointing to:
- `https://<your-vercel-domain>/api/webhooks/inventory`

Example mutation:
```graphql
mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
    userErrors { field message }
    webhookSubscription { id topic endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } } }
  }
}
```
Variables:
```json
{
  "topic": "INVENTORY_LEVELS_UPDATE",
  "webhookSubscription": {
    "callbackUrl": "https://<your-vercel-domain>/api/webhooks/inventory",
    "format": "JSON"
  }
}
```

## 4. Optional: inbound STOP webhook for Twilio
Set Twilio messaging webhook URL to:
- `https://<your-vercel-domain>/api/webhooks/twilio`

Important:
- The deployed `TWILIO_AUTH_TOKEN` must match the Twilio account attached to that webhook, or inbound STOP validation will be rejected.
