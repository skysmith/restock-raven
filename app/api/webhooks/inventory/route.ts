import { NextRequest, NextResponse } from "next/server";
import { verifyShopifyWebhookHmac } from "@/lib/security/hmac";
import { getEnv } from "@/lib/utils/env";
import { getVariantIdByInventoryItemId } from "@/lib/shopify/admin";
import {
  getVariantInventoryState,
  insertRestockEvent,
  upsertVariantInventoryState
} from "@/lib/db/events";
import {
  getRestockTriggerMode,
  isZeroToThresholdTransition
} from "@/lib/jobs/transition";

interface InventoryWebhookPayload {
  inventory_item_id: number;
  available: number;
  updated_at: string;
  location_id?: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const headerHmac = request.headers.get("x-shopify-hmac-sha256");

  if (!verifyShopifyWebhookHmac(rawBody, headerHmac, getEnv("SHOPIFY_WEBHOOK_SECRET"))) {
    return NextResponse.json({ ok: false, error: "Invalid HMAC" }, { status: 401 });
  }

  let payload: InventoryWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as InventoryWebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const configuredLocationId = Number(getEnv("SHOPIFY_LOCATION_ID"));
  if (payload.location_id && payload.location_id !== configuredLocationId) {
    return NextResponse.json({ ok: true, ignored: true, reason: "wrong_location" });
  }

  const inventoryItemId = String(payload.inventory_item_id);
  const nextQty = payload.available;

  const variantId = await getVariantIdByInventoryItemId(inventoryItemId);
  if (!variantId) {
    return NextResponse.json({ ok: true, ignored: true, reason: "variant_not_found" });
  }

  const previousQty = await getVariantInventoryState(variantId);
  const triggerMode = getRestockTriggerMode();
  const shouldQueue =
    triggerMode === "threshold" ? isZeroToThresholdTransition(previousQty, nextQty) : false;

  const webhookId = request.headers.get("x-shopify-webhook-id");

  await insertRestockEvent({
    variantId,
    inventoryFrom: previousQty,
    inventoryTo: nextQty,
    occurredAt: payload.updated_at || new Date().toISOString(),
    webhookId,
    status: shouldQueue ? "queued" : "ignored"
  });

  await upsertVariantInventoryState(variantId, nextQty);

  return NextResponse.json({
    ok: true,
    queued: shouldQueue,
    triggerMode,
    reason: shouldQueue ? "threshold_transition" : triggerMode === "manual" ? "manual_mode" : "below_threshold"
  });
}
