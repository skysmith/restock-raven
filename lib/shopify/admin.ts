import { getEnv } from "@/lib/utils/env";

const apiVersion = "2025-01";

async function shopifyGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const store = getEnv("SHOPIFY_STORE_DOMAIN");
  const token = getEnv("SHOPIFY_ADMIN_TOKEN");

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
