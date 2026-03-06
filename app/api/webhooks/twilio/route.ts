import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { verifyTwilioWebhookSignature } from "@/lib/security/twilio";
import { getEnv } from "@/lib/utils/env";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();
  const formValues = Object.fromEntries(
    Array.from(form.entries()).map(([key, value]) => [key, typeof value === "string" ? value : String(value)])
  );
  const signature = request.headers.get("x-twilio-signature");

  if (
    !verifyTwilioWebhookSignature({
      authToken: getEnv("TWILIO_AUTH_TOKEN"),
      signature,
      url: request.nextUrl,
      headers: request.headers,
      form: formValues
    })
  ) {
    return new NextResponse("invalid signature", { status: 403 });
  }

  const from = (formValues.From ?? "").trim();
  const body = (formValues.Body ?? "").trim().toLowerCase();

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
