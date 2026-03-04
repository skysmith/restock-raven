import { NextRequest, NextResponse } from "next/server";
import { subscribeSchema } from "@/lib/validation";
import { normalizePhone } from "@/lib/utils/phone";
import { hashIp } from "@/lib/utils/crypto";
import { upsertSubscription } from "@/lib/db/subscriptions";
import { getEnv, isTwilioConfigured } from "@/lib/utils/env";

function corsHeaders(origin?: string | null): Record<string, string> {
  const fallbackOrigin = `https://${getEnv("SHOPIFY_STORE_DOMAIN")}`;
  const allowOrigin = origin && /^https?:\/\//i.test(origin) ? origin : fallbackOrigin;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin"
  };
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin"))
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  try {
    const body = await request.json();
    const parsed = subscribeSchema.parse(body);

    const email = parsed.email?.trim().toLowerCase() ?? null;
    const phone = parsed.phone ? normalizePhone(parsed.phone) : null;
    if (phone && !isTwilioConfigured()) {
      return NextResponse.json(
        { ok: false, error: "SMS alerts are temporarily unavailable. Submit email only." },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
    const ip = forwardedFor.split(",")[0]?.trim() ?? "";

    const subscription = await upsertSubscription({
      email,
      phone,
      smsConsent: parsed.smsConsent,
      marketingOptIn: parsed.marketingOptIn,
      productId: parsed.productId,
      variantId: parsed.variantId,
      metadata: {
        ...parsed.metadata,
        userAgent: request.headers.get("user-agent") ?? null,
        ipHash: ip ? hashIp(ip) : null,
        pageUrl: request.headers.get("referer") ?? null
      }
    });

    return NextResponse.json(
      { ok: true, subscriptionId: subscription.id },
      { headers: corsHeaders(origin) }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 400, headers: corsHeaders(origin) }
    );
  }
}
