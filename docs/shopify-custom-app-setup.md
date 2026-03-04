# Shopify Custom App Setup (Single Store, Private)

## 1. Create custom app in Shopify Admin
1. Go to `Settings -> Apps and sales channels -> Develop apps`.
2. Create app `Restock Raven`.
3. Grant Admin API scopes:
- `read_inventory`
- `read_products`
- `read_locations`
- `write_webhooks`
4. Install app and copy Admin API token.

## 2. Configure env vars in Vercel
Set:
- `SHOPIFY_STORE_DOMAIN`
- `SHOPIFY_ADMIN_TOKEN`
- `SHOPIFY_WEBHOOK_SECRET`
- `SHOPIFY_LOCATION_ID`

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
