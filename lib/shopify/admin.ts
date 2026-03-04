import { getEnv } from "@/lib/utils/env";

const apiVersion = "2025-01";
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getShopifyAccessToken(): Promise<string> {
  if (process.env.SHOPIFY_ADMIN_TOKEN) {
    return process.env.SHOPIFY_ADMIN_TOKEN;
  }

  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const store = getEnv("SHOPIFY_STORE_DOMAIN");
  const clientId = getEnv("SHOPIFY_CLIENT_ID");
  const clientSecret = getEnv("SHOPIFY_CLIENT_SECRET");

  const response = await fetch(`https://${store}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials"
    })
  });

  if (!response.ok) {
    throw new Error(`Shopify token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("Shopify token exchange returned no access_token");
  }

  const ttlMs = Math.max(60_000, (data.expires_in ?? 300) * 1000);
  cachedAccessToken = { token: data.access_token, expiresAt: Date.now() + ttlMs };

  return data.access_token;
}

async function shopifyGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const store = getEnv("SHOPIFY_STORE_DOMAIN");
  const token = await getShopifyAccessToken();

  const response = await fetch(`https://${store}/admin/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    throw new Error(`Shopify GraphQL request failed: ${response.status}`);
  }

  const data = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (data.errors?.length) {
    throw new Error(`Shopify GraphQL errors: ${data.errors.map((e) => e.message).join(", ")}`);
  }

  if (!data.data) {
    throw new Error("Shopify GraphQL response missing data");
  }

  return data.data;
}

export async function ensureInventoryWebhook(callbackUrl: string): Promise<{
  created: boolean;
  existingId?: string;
  createdId?: string;
}> {
  const listQuery = `
    query WebhookSubscriptions {
      webhookSubscriptions(first: 50) {
        nodes {
          id
          topic
          endpoint {
            __typename
            ... on WebhookHttpEndpoint {
              callbackUrl
            }
          }
        }
      }
    }
  `;

  const existing = await shopifyGraphql<{
    webhookSubscriptions: {
      nodes: Array<{
        id: string;
        topic: string;
        endpoint: { __typename: string; callbackUrl?: string };
      }>;
    };
  }>(listQuery, {});

  const match = existing.webhookSubscriptions.nodes.find(
    (node) =>
      node.topic === "INVENTORY_LEVELS_UPDATE" &&
      node.endpoint.__typename === "WebhookHttpEndpoint" &&
      node.endpoint.callbackUrl === callbackUrl
  );

  if (match) {
    return { created: false, existingId: match.id };
  }

  const createMutation = `
    mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
        userErrors {
          field
          message
        }
        webhookSubscription {
          id
        }
      }
    }
  `;

  const created = await shopifyGraphql<{
    webhookSubscriptionCreate: {
      userErrors: Array<{ field: string[] | null; message: string }>;
      webhookSubscription: { id: string } | null;
    };
  }>(createMutation, {
    topic: "INVENTORY_LEVELS_UPDATE",
    webhookSubscription: {
      callbackUrl,
      format: "JSON"
    }
  });

  if (created.webhookSubscriptionCreate.userErrors.length) {
    throw new Error(
      `Shopify webhook create failed: ${created.webhookSubscriptionCreate.userErrors
        .map((e) => e.message)
        .join(", ")}`
    );
  }

  if (!created.webhookSubscriptionCreate.webhookSubscription) {
    throw new Error("Shopify webhook create failed: no webhook subscription returned");
  }

  return {
    created: true,
    createdId: created.webhookSubscriptionCreate.webhookSubscription.id
  };
}

export async function getVariantIdByInventoryItemId(inventoryItemId: string): Promise<string | null> {
  const query = `
    query VariantByInventoryItem($query: String!) {
      productVariants(first: 1, query: $query) {
        nodes {
          id
          legacyResourceId
        }
      }
    }
  `;

  const data = await shopifyGraphql<{
    productVariants: { nodes: Array<{ legacyResourceId: string }> };
  }>(query, { query: `inventory_item_id:${inventoryItemId}` });

  return data.productVariants.nodes[0]?.legacyResourceId ?? null;
}

export async function isVariantSellableOnline(variantId: string): Promise<boolean> {
  const gid = `gid://shopify/ProductVariant/${variantId}`;
  const query = `
    query VariantAvailability($id: ID!) {
      productVariant(id: $id) {
        availableForSale
        product {
          publishedOnCurrentPublication
          status
        }
      }
    }
  `;

  try {
    const data = await shopifyGraphql<{
      productVariant: {
        availableForSale: boolean;
        product: { publishedOnCurrentPublication: boolean; status: string };
      } | null;
    }>(query, { id: gid });

    if (!data.productVariant) return false;

    const { availableForSale, product } = data.productVariant;
    return availableForSale && Boolean(product.publishedOnCurrentPublication) && product.status === "ACTIVE";
  } catch {
    return true;
  }
}
