import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireEmbeddedShopifySession } from "@/lib/shopify/embedded-auth";
import { getVariantInventoryState, insertRestockEvent } from "@/lib/db/events";
import { getRestockMinQtyFromZero } from "@/lib/jobs/transition";
import { processRestockQueue } from "@/lib/jobs/process-restock";

interface EmbeddedTriggerBody {
  variantId?: string;
  inventoryTo?: number;
  processNow?: boolean;
}

export async function POST(request: NextRequest) {
  const auth = requireEmbeddedShopifySession(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as EmbeddedTriggerBody;
  const variantId = body.variantId?.trim();
  if (!variantId) {
    return NextResponse.json({ ok: false, error: "variantId is required" }, { status: 400 });
  }

  const previousQty = await getVariantInventoryState(variantId);
  const fallbackQty = getRestockMinQtyFromZero();
  const inventoryTo =
    typeof body.inventoryTo === "number" && Number.isFinite(body.inventoryTo)
      ? Math.floor(body.inventoryTo)
      : fallbackQty;

  const event = await insertRestockEvent({
    variantId,
    inventoryFrom: previousQty,
    inventoryTo,
    occurredAt: new Date().toISOString(),
    webhookId: null,
    status: "queued"
  });

  const processResult = body.processNow ? await processRestockQueue(100) : null;

  return NextResponse.json({
    ok: true,
    shop: auth.session.shop,
    queued: true,
    eventCreated: Boolean(event),
    variantId,
    inventoryFrom: previousQty,
    inventoryTo,
    processResult
  });
}
