import { sql } from "@/lib/db/client";
import type { EventStatus, RestockEvent } from "@/lib/types";

export interface InsertRestockEventInput {
  variantId: string;
  inventoryFrom: number | null;
  inventoryTo: number;
  occurredAt: string;
  webhookId: string | null;
  status: EventStatus;
}

export async function getVariantInventoryState(variantId: string): Promise<number | null> {
  const { rows } = await sql<{ inventory_qty: number }>`
    SELECT inventory_qty
    FROM variant_inventory_state
    WHERE variant_id = ${variantId}
    LIMIT 1
  `;
  if (!rows.length) return null;
  return rows[0].inventory_qty;
}

export async function upsertVariantInventoryState(variantId: string, inventoryQty: number): Promise<void> {
  await sql`
    INSERT INTO variant_inventory_state (variant_id, inventory_qty, updated_at)
    VALUES (${variantId}, ${inventoryQty}, NOW())
    ON CONFLICT (variant_id)
    DO UPDATE SET inventory_qty = EXCLUDED.inventory_qty, updated_at = NOW()
  `;
}

export async function insertRestockEvent(input: InsertRestockEventInput): Promise<RestockEvent | null> {
  const { rows } = await sql<RestockEvent>`
    INSERT INTO restock_events (
      variant_id,
      inventory_from,
      inventory_to,
      occurred_at,
      shopify_webhook_id,
      status
    )
    VALUES (
      ${input.variantId},
      ${input.inventoryFrom},
      ${input.inventoryTo},
      ${input.occurredAt},
      ${input.webhookId},
      ${input.status}
    )
    ON CONFLICT DO NOTHING
    RETURNING *
  `;

  return rows[0] ?? null;
}

export async function claimQueuedEvents(limit = 100): Promise<RestockEvent[]> {
  const { rows } = await sql<RestockEvent>`
    WITH to_claim AS (
      SELECT id
      FROM restock_events
      WHERE status = 'queued' AND processed_at IS NULL
      ORDER BY occurred_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE restock_events e
    SET status = 'received'
    FROM to_claim
    WHERE e.id = to_claim.id
    RETURNING e.*
  `;
  return rows;
}

export async function markEventProcessed(eventId: string): Promise<void> {
  await sql`
    UPDATE restock_events
    SET status = 'processed', processed_at = NOW()
    WHERE id = ${eventId}
  `;
}

export async function markEventIgnored(eventId: string): Promise<void> {
  await sql`
    UPDATE restock_events
    SET status = 'ignored', processed_at = NOW()
    WHERE id = ${eventId}
  `;
}
