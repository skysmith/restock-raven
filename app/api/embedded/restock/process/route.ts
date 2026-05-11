import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { processRestockQueue } from "@/lib/jobs/process-restock";
import { requireEmbeddedShopifySession } from "@/lib/shopify/embedded-auth";

export async function POST(request: NextRequest) {
  const auth = requireEmbeddedShopifySession(request);
  if (!auth.ok) return auth.response;

  const processResult = await processRestockQueue(100);

  return NextResponse.json({
    ok: true,
    shop: auth.session.shop,
    processResult
  });
}
