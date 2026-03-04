import { NextRequest, NextResponse } from "next/server";
import { getVariantInventoryState, insertRestockEvent } from "@/lib/db/events";
import { getRestockMinQtyFromZero } from "@/lib/jobs/transition";

interface ManualTriggerBody {
  variantId?: string;
  inventoryTo?: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as ManualTriggerBody;
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

  return NextResponse.json({
    ok: true,
    queued: true,
    mode: "manual",
    eventCreated: Boolean(event),
    variantId,
    inventoryFrom: previousQty,
    inventoryTo
  });
}
