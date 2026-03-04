import { NextRequest, NextResponse } from "next/server";
import { listSubscriptions } from "@/lib/db/subscriptions";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = request.nextUrl.searchParams.get("q") ?? undefined;
  const status = (request.nextUrl.searchParams.get("status") as
    | "active"
    | "notified"
    | "unsubscribed"
    | "all"
    | null) ?? "all";
  const subscriptions = await listSubscriptions(query, status);
  return NextResponse.json({ ok: true, subscriptions });
}
