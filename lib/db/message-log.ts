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
