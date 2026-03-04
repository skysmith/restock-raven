import { sql } from "@/lib/db/client";
import type { MessageChannel, MessageStatus } from "@/lib/types";

export async function logMessage(params: {
  subscriptionId: string;
  channel: MessageChannel;
  providerMessageId: string | null;
  status: MessageStatus;
  error?: string | null;
}): Promise<void> {
  await sql`
    INSERT INTO message_log (subscription_id, channel, provider_message_id, status, error)
    VALUES (${params.subscriptionId}, ${params.channel}, ${params.providerMessageId}, ${params.status}, ${params.error ?? null})
  `;
}

export interface MessageLogRow {
  id: string;
  subscription_id: string;
  channel: MessageChannel;
  provider_message_id: string | null;
  sent_at: string;
  status: MessageStatus;
  error: string | null;
  email: string | null;
  phone: string | null;
  variant_id: string;
}

export async function listMessageLog(params: {
  query?: string;
  status?: MessageStatus | "all";
  channel?: MessageChannel | "all";
  limit?: number;
  offset?: number;
}): Promise<MessageLogRow[]> {
  const trimmed = params.query?.trim();
  const statusFilter = params.status && params.status !== "all" ? params.status : null;
  const channelFilter = params.channel && params.channel !== "all" ? params.channel : null;
  const limit = params.limit ?? 200;
  const offset = params.offset ?? 0;

  const { rows } = await sql<MessageLogRow>`
    SELECT
      ml.id,
      ml.subscription_id,
      ml.channel,
      ml.provider_message_id,
      ml.sent_at,
      ml.status,
      ml.error,
      rs.email,
      rs.phone,
      rs.variant_id
    FROM message_log ml
    JOIN restock_subscriptions rs ON rs.id = ml.subscription_id
    WHERE (${statusFilter}::message_status IS NULL OR ml.status = ${statusFilter}::message_status)
      AND (${channelFilter}::message_channel IS NULL OR ml.channel = ${channelFilter}::message_channel)
      AND (
        ${trimmed ?? null}::text IS NULL
        OR rs.email ILIKE ${`%${trimmed ?? ""}%`}
        OR rs.phone ILIKE ${`%${trimmed ?? ""}%`}
        OR rs.variant_id ILIKE ${`%${trimmed ?? ""}%`}
      )
    ORDER BY ml.sent_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
  return rows;
}

export async function countMessageLog(params: {
  query?: string;
  status?: MessageStatus | "all";
  channel?: MessageChannel | "all";
}): Promise<number> {
  const trimmed = params.query?.trim();
  const statusFilter = params.status && params.status !== "all" ? params.status : null;
  const channelFilter = params.channel && params.channel !== "all" ? params.channel : null;

  const { rows } = await sql<{ count: number }>`
    SELECT COUNT(*)::int AS count
    FROM message_log ml
    JOIN restock_subscriptions rs ON rs.id = ml.subscription_id
    WHERE (${statusFilter}::message_status IS NULL OR ml.status = ${statusFilter}::message_status)
      AND (${channelFilter}::message_channel IS NULL OR ml.channel = ${channelFilter}::message_channel)
      AND (
        ${trimmed ?? null}::text IS NULL
        OR rs.email ILIKE ${`%${trimmed ?? ""}%`}
        OR rs.phone ILIKE ${`%${trimmed ?? ""}%`}
        OR rs.variant_id ILIKE ${`%${trimmed ?? ""}%`}
      )
  `;
  return rows[0]?.count ?? 0;
}

export async function getMessageStatusCounts(): Promise<Record<string, number>> {
  const { rows } = await sql<{ status: string; count: number }>`
    SELECT status::text AS status, COUNT(*)::int AS count
    FROM message_log
    GROUP BY status
  `;

  const result: Record<string, number> = { sent: 0, failed: 0, total: 0 };
  for (const row of rows) {
    result[row.status] = row.count;
    result.total += row.count;
  }
  return result;
}
