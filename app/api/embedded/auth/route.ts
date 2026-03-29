import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireEmbeddedShopifySession } from "@/lib/shopify/embedded-auth";

export async function GET(request: NextRequest) {
  const auth = requireEmbeddedShopifySession(request);
  if (!auth.ok) return auth.response;

  const { session } = auth;

  return NextResponse.json({
    ok: true,
    shop: session.shop,
    userId: session.userId,
    expiresAt: session.payload.exp ?? null
  });
}
