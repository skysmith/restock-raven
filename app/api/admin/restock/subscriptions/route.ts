import { NextRequest, NextResponse } from "next/server";
import { listSubscriptions } from "@/lib/db/subscriptions";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = request.nextUrl.searchParams.get("q") ?? undefined;
  const subscriptions = await listSubscriptions(query);
  return NextResponse.json({ ok: true, subscriptions });
}
