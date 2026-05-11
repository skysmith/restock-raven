import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireEmbeddedShopifySession } from "@/lib/shopify/embedded-auth";
import {
  countSubscriptions,
  isClearedEmailPlaceholder,
  listSubscriptions
} from "@/lib/db/subscriptions";
import type { SortDirection, SubscriptionSortKey } from "@/lib/db/subscriptions";
import { getVariantAdminMetaMap } from "@/lib/shopify/admin";

type SubscriptionStatusFilter = "active" | "notified" | "unsubscribed" | "all";

function getStatusFilter(value: string | null): SubscriptionStatusFilter {
  if (value === "active" || value === "notified" || value === "unsubscribed") {
    return value;
  }
  return "all";
}

function getSubscriptionSortKey(value: string | null): SubscriptionSortKey {
  if (value === "product" || value === "notified" || value === "active" || value === "created") {
    return value;
  }
  return "created";
}

function getDefaultSortDirection(sortBy: SubscriptionSortKey): SortDirection {
  return sortBy === "created" || sortBy === "notified" ? "desc" : "asc";
}

function getSortDirection(value: string | null, sortBy: SubscriptionSortKey): SortDirection {
  if (value === "asc" || value === "desc") return value;
  return getDefaultSortDirection(sortBy);
}

const productCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export async function GET(request: NextRequest) {
  const auth = requireEmbeddedShopifySession(request);
  if (!auth.ok) return auth.response;

  const query = request.nextUrl.searchParams.get("q") ?? undefined;
  const status = getStatusFilter(request.nextUrl.searchParams.get("status"));
  const sortBy = getSubscriptionSortKey(request.nextUrl.searchParams.get("sortBy"));
  const sortDirection = getSortDirection(request.nextUrl.searchParams.get("sortDirection"), sortBy);
  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "25");
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(100, Math.floor(limitParam))) : 25;

  let subscriptions: Awaited<ReturnType<typeof listSubscriptions>>;
  let total: number;

  if (sortBy === "product") {
    total = await countSubscriptions(query, status);
    subscriptions = await listSubscriptions(query, status, { limit: total, offset: 0, sortBy, sortDirection });
  } else {
    [subscriptions, total] = await Promise.all([
      listSubscriptions(query, status, { limit, offset: 0, sortBy, sortDirection }),
      countSubscriptions(query, status)
    ]);
  }

  let variantMetaById: Awaited<ReturnType<typeof getVariantAdminMetaMap>> = {};
  try {
    variantMetaById = await getVariantAdminMetaMap(subscriptions.map((subscription) => subscription.variant_id));
  } catch {
    variantMetaById = {};
  }

  const enrichedSubscriptions = subscriptions.map((subscription) => {
    const variantMeta = variantMetaById[subscription.variant_id];
    const emailCleared = isClearedEmailPlaceholder(subscription.email);
    return {
      ...subscription,
      email: emailCleared ? null : subscription.email,
      email_cleared: emailCleared,
      product_title: variantMeta?.productTitle ?? null,
      sku: variantMeta?.sku ?? null,
      variant_title: variantMeta?.variantTitle ?? null
    };
  });

  if (sortBy === "product") {
    enrichedSubscriptions.sort((a, b) => {
      const aProduct = a.product_title?.trim() || "Unknown product";
      const bProduct = b.product_title?.trim() || "Unknown product";
      const result = productCollator.compare(aProduct, bProduct);
      return sortDirection === "asc" ? result : -result;
    });
    enrichedSubscriptions.splice(limit);
  }

  return NextResponse.json({
    ok: true,
    shop: auth.session.shop,
    total,
    sortBy,
    sortDirection,
    subscriptions: enrichedSubscriptions
  });
}
