import { NextRequest, NextResponse } from "next/server";
import { subscribeSchema } from "@/lib/validation";
import { normalizePhone } from "@/lib/utils/phone";
import { hashIp } from "@/lib/utils/crypto";
import { upsertSubscription } from "@/lib/db/subscriptions";
import { getAllowedSubscribeOrigins, isTwilioConfigured } from "@/lib/utils/env";

function getAllowedOrigin(origin?: string | null): string | null {
  if (!origin) return null;
  return getAllowedSubscribeOrigins().includes(origin.toLowerCase()) ? origin : null;
}

function corsHeaders(origin?: string | null): Record<string, string> {
  const allowOrigin = getAllowedOrigin(origin);
  return {
    ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin"
  };
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  if (origin && !getAllowedOrigin(origin)) {
    return NextResponse.json({ ok: false, error: "Origin not allowed" }, { status: 403 });
  }

  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(origin)
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  if (origin && !getAllowedOrigin(origin)) {
    return NextResponse.json({ ok: false, error: "Origin not allowed" }, { status: 403 });
  }

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
