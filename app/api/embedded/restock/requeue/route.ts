import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireEmbeddedShopifySession } from "@/lib/shopify/embedded-auth";
import { requeueSubscription } from "@/lib/db/subscriptions";

interface EmbeddedRequeueBody {
  subscriptionId?: string;
}

export async function POST(request: NextRequest) {
  const auth = requireEmbeddedShopifySession(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as EmbeddedRequeueBody;
  const subscriptionId = body.subscriptionId?.trim();
  if (!subscriptionId) {
    return NextResponse.json({ ok: false, error: "subscriptionId is required" }, { status: 400 });
  }

  const updated = await requeueSubscription(subscriptionId);
  if (!updated) {
    return NextResponse.json({ ok: false, error: "Subscription not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, shop: auth.session.shop, subscriptionId });
}
