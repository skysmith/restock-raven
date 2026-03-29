import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireEmbeddedShopifySession } from "@/lib/shopify/embedded-auth";
import { countSubscriptions, listSubscriptions } from "@/lib/db/subscriptions";

type SubscriptionStatusFilter = "active" | "notified" | "unsubscribed" | "all";

function getStatusFilter(value: string | null): SubscriptionStatusFilter {
  if (value === "active" || value === "notified" || value === "unsubscribed") {
    return value;
  }
  return "all";
}

export async function GET(request: NextRequest) {
  const auth = requireEmbeddedShopifySession(request);
  if (!auth.ok) return auth.response;

  const query = request.nextUrl.searchParams.get("q") ?? undefined;
  const status = getStatusFilter(request.nextUrl.searchParams.get("status"));
  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "25");
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(100, Math.floor(limitParam))) : 25;

  const [subscriptions, total] = await Promise.all([
    listSubscriptions(query, status, { limit, offset: 0 }),
    countSubscriptions(query, status)
  ]);

  return NextResponse.json({
    ok: true,
    shop: auth.session.shop,
    total,
    subscriptions
  });
}
