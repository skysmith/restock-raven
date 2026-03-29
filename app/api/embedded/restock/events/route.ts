import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireEmbeddedShopifySession } from "@/lib/shopify/embedded-auth";
import { countEvents, listRecentEvents } from "@/lib/db/events";

type EventStatusFilter = "all" | "received" | "queued" | "processed" | "ignored";

function getStatusFilter(value: string | null): EventStatusFilter {
  if (value === "received" || value === "queued" || value === "processed" || value === "ignored") {
    return value;
  }
  return "all";
}

export async function GET(request: NextRequest) {
  const auth = requireEmbeddedShopifySession(request);
  if (!auth.ok) return auth.response;

  const status = getStatusFilter(request.nextUrl.searchParams.get("status"));
  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "10");
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(50, Math.floor(limitParam))) : 10;

  const [events, total] = await Promise.all([listRecentEvents(limit, status, 0), countEvents(status)]);

  return NextResponse.json({
    ok: true,
    shop: auth.session.shop,
    total,
    events
  });
}
