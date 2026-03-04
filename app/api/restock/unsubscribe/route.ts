import { NextRequest, NextResponse } from "next/server";
import { unsubscribeAllByToken } from "@/lib/db/subscriptions";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("t");
  if (!token) {
    return new NextResponse("Missing token", { status: 400 });
  }

  const updated = await unsubscribeAllByToken(token);

  return new NextResponse(
    updated > 0
      ? "You have been unsubscribed from future restock alerts."
      : "No active subscriptions found for that link.",
    { status: 200 }
  );
}
