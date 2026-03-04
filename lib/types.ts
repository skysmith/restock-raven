export type SubscriptionStatus = "active" | "notified" | "unsubscribed";
export type EventStatus = "received" | "queued" | "processed" | "ignored";
export type MessageChannel = "email" | "sms";
export type MessageStatus = "sent" | "failed";

export interface RestockSubscription {
  id: string;
  email: string | null;
  phone: string | null;
  sms_consent: boolean;
  sms_consent_at: string | null;
  email_consent_at: string | null;
  marketing_opt_in: boolean;
  marketing_opt_in_at: string | null;
  product_id: string;
  variant_id: string;
  created_at: string;
  notified_at: string | null;
  status: SubscriptionStatus;
  unsubscribe_token: string;
  metadata: Record<string, unknown>;
}

export interface RestockEvent {
  id: string;
  variant_id: string;
  inventory_from: number | null;
  inventory_to: number;
  occurred_at: string;
  processed_at: string | null;
  shopify_webhook_id: string | null;
  status: EventStatus;
}
