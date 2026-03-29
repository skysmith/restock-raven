import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getShopifySessionTokenFromAuthorizationHeader,
  verifyShopifySessionToken
} from "@/lib/shopify/session-token";

export function requireEmbeddedShopifySession(request: NextRequest) {
  const token = getShopifySessionTokenFromAuthorizationHeader(request.headers.get("authorization"));
  if (!token) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Missing Shopify session token" }, { status: 401 })
    };
  }

  try {
    const session = verifyShopifySessionToken(token);
    return { ok: true as const, session };
  } catch (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid Shopify session token" },
        { status: 401 }
      )
    };
  }
}
