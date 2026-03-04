import { NextRequest, NextResponse } from "next/server";
import { ensureInventoryWebhook } from "@/lib/shopify/admin";
import { getEnv } from "@/lib/utils/env";

export async function POST(_request: NextRequest): Promise<NextResponse> {
  try {
    const callbackUrl = `${getEnv("APP_BASE_URL")}/api/webhooks/inventory`;
    const result = await ensureInventoryWebhook(callbackUrl);
    return NextResponse.json({ ok: true, callbackUrl, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Webhook ensure failed" },
      { status: 500 }
    );
  }
}
