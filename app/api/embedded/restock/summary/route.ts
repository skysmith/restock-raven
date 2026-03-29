import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireEmbeddedShopifySession } from "@/lib/shopify/embedded-auth";
import { countSubscriptions, getSubscriptionStatusCounts } from "@/lib/db/subscriptions";
import { countEvents, getEventStatusCounts } from "@/lib/db/events";
import { countMessageLog, getMessageStatusCounts } from "@/lib/db/message-log";

export async function GET(request: NextRequest) {
  const auth = requireEmbeddedShopifySession(request);
  if (!auth.ok) return auth.response;

  const [subscriptionTotal, subscriptionCounts, eventTotal, eventCounts, messageTotal, messageCounts] =
    await Promise.all([
      countSubscriptions(undefined, "all"),
      getSubscriptionStatusCounts(),
      countEvents("all"),
      getEventStatusCounts(),
      countMessageLog({ query: undefined, status: "all", channel: "all" }),
      getMessageStatusCounts()
    ]);

  return NextResponse.json({
    ok: true,
    shop: auth.session.shop,
    subscriptions: {
      total: subscriptionTotal,
      active: subscriptionCounts.active ?? 0,
      notified: subscriptionCounts.notified ?? 0,
      unsubscribed: subscriptionCounts.unsubscribed ?? 0
    },
    events: {
      total: eventTotal,
      received: eventCounts.received ?? 0,
      queued: eventCounts.queued ?? 0,
      processed: eventCounts.processed ?? 0,
      ignored: eventCounts.ignored ?? 0
    },
    messages: {
      total: messageTotal,
      sent: messageCounts.sent ?? 0,
      failed: messageCounts.failed ?? 0
    }
  });
}
