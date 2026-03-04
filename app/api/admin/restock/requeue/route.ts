import { NextRequest, NextResponse } from "next/server";
import { requeueSubscription } from "@/lib/db/subscriptions";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as { subscriptionId?: string };
  if (!body.subscriptionId) {
    return NextResponse.json({ ok: false, error: "subscriptionId is required" }, { status: 400 });
  }

  const updated = await requeueSubscription(body.subscriptionId);
  if (!updated) {
    return NextResponse.json({ ok: false, error: "Subscription not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
