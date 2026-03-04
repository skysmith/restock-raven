import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();
  const from = String(form.get("From") ?? "").trim();
  const body = String(form.get("Body") ?? "").trim().toLowerCase();

  if (!from || !body) {
    return new NextResponse("ok", { status: 200 });
  }

  if (["stop", "unsubscribe", "cancel", "end", "quit", "stopall"].includes(body)) {
    await sql`
      UPDATE restock_subscriptions
      SET status = 'unsubscribed'
      WHERE phone = ${from}
    `;
  }

  return new NextResponse("ok", { status: 200 });
}
