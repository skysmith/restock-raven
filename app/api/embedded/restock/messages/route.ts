import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireEmbeddedShopifySession } from "@/lib/shopify/embedded-auth";
import { countMessageLog, listMessageLog } from "@/lib/db/message-log";

type MessageStatusFilter = "all" | "sent" | "failed";
type ChannelFilter = "all" | "email" | "sms";

function getStatusFilter(value: string | null): MessageStatusFilter {
  if (value === "sent" || value === "failed") return value;
  return "all";
}

function getChannelFilter(value: string | null): ChannelFilter {
  if (value === "email" || value === "sms") return value;
  return "all";
}

export async function GET(request: NextRequest) {
  const auth = requireEmbeddedShopifySession(request);
  if (!auth.ok) return auth.response;

  const query = request.nextUrl.searchParams.get("q") ?? undefined;
  const status = getStatusFilter(request.nextUrl.searchParams.get("status"));
  const channel = getChannelFilter(request.nextUrl.searchParams.get("channel"));
  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "10");
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(50, Math.floor(limitParam))) : 10;

  const [messages, total] = await Promise.all([
    listMessageLog({ query, status, channel, limit, offset: 0 }),
    countMessageLog({ query, status, channel })
  ]);

  return NextResponse.json({
    ok: true,
    shop: auth.session.shop,
    total,
    messages
  });
}
