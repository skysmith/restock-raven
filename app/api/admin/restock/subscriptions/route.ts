import { NextRequest, NextResponse } from "next/server";
import { isClearedEmailPlaceholder, listSubscriptions } from "@/lib/db/subscriptions";
import type { SortDirection, SubscriptionSortKey } from "@/lib/db/subscriptions";
import { getVariantAdminMetaMap } from "@/lib/shopify/admin";

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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = request.nextUrl.searchParams.get("q") ?? undefined;
  const status = (request.nextUrl.searchParams.get("status") as
    | "active"
    | "notified"
    | "unsubscribed"
    | "all"
    | null) ?? "all";
  const sortBy = getSubscriptionSortKey(request.nextUrl.searchParams.get("sortBy"));
  const sortDirection = getSortDirection(request.nextUrl.searchParams.get("sortDirection"), sortBy);
  const subscriptions = await listSubscriptions(query, status, { sortBy, sortDirection });
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
    const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
    enrichedSubscriptions.sort((a, b) => {
      const aProduct = a.product_title?.trim() || "Unknown product";
      const bProduct = b.product_title?.trim() || "Unknown product";
      const result = collator.compare(aProduct, bProduct);
      return sortDirection === "asc" ? result : -result;
    });
  }

  return NextResponse.json({ ok: true, subscriptions: enrichedSubscriptions, sortBy, sortDirection });
}
