import { sql } from "@/lib/db/client";
import { randomToken } from "@/lib/utils/crypto";
import type { RestockSubscription } from "@/lib/types";

export interface UpsertSubscriptionInput {
  email: string | null;
  phone: string | null;
  smsConsent: boolean;
  marketingOptIn: boolean;
  productId: string;
  variantId: string;
  metadata: Record<string, unknown>;
}

type SqlTag = typeof sql;

export async function upsertSubscription(
  input: UpsertSubscriptionInput,
  db: SqlTag = sql
): Promise<RestockSubscription> {
  const unsubscribeToken = randomToken(24);

  const { rows } = await db<RestockSubscription>`
    INSERT INTO restock_subscriptions (
      email,
      phone,
      sms_consent,
      sms_consent_at,
      email_consent_at,
      marketing_opt_in,
      marketing_opt_in_at,
      product_id,
      variant_id,
      status,
      notified_at,
      unsubscribe_token,
      metadata
    )
    VALUES (
      ${input.email},
      ${input.phone},
      ${input.smsConsent},
      ${input.smsConsent ? new Date().toISOString() : null},
      ${input.email ? new Date().toISOString() : null},
      ${input.marketingOptIn},
      ${input.marketingOptIn ? new Date().toISOString() : null},
      ${input.productId},
      ${input.variantId},
      'active',
      NULL,
      ${unsubscribeToken},
      ${JSON.stringify(input.metadata)}::jsonb
    )
    ON CONFLICT ON CONSTRAINT restock_subscriptions_contact_variant_unique
    DO UPDATE SET
      sms_consent = EXCLUDED.sms_consent,
      sms_consent_at = COALESCE(EXCLUDED.sms_consent_at, restock_subscriptions.sms_consent_at),
      email_consent_at = COALESCE(EXCLUDED.email_consent_at, restock_subscriptions.email_consent_at),
      marketing_opt_in = restock_subscriptions.marketing_opt_in OR EXCLUDED.marketing_opt_in,
      marketing_opt_in_at = COALESCE(restock_subscriptions.marketing_opt_in_at, EXCLUDED.marketing_opt_in_at),
      product_id = EXCLUDED.product_id,
      status = 'active',
      notified_at = NULL,
      metadata = restock_subscriptions.metadata || EXCLUDED.metadata
    RETURNING *
  `;

  return rows[0];
}

export async function unsubscribeAllByToken(token: string, db: SqlTag = sql): Promise<number> {
  const source = await db<{ email: string | null; phone: string | null }>`
    SELECT email, phone
    FROM restock_subscriptions
    WHERE unsubscribe_token = ${token}
    LIMIT 1
  `;

  if (!source.rowCount) return 0;

  const contact = source.rows[0];
  const { rowCount } = await db`
    UPDATE restock_subscriptions
    SET status = 'unsubscribed'
    WHERE (${contact.email} IS NOT NULL AND email = ${contact.email})
       OR (${contact.phone} IS NOT NULL AND phone = ${contact.phone})
  `;

  return rowCount ?? 0;
}

export async function listSubscriptions(query?: string, db: SqlTag = sql): Promise<RestockSubscription[]> {
  if (!query) {
    const { rows } = await db<RestockSubscription>`
      SELECT *
      FROM restock_subscriptions
      ORDER BY created_at DESC
      LIMIT 200
    `;
    return rows;
  }

  const trimmed = query.trim();
  const { rows } = await db<RestockSubscription>`
    SELECT *
    FROM restock_subscriptions
    WHERE email ILIKE ${`%${trimmed}%`}
       OR phone ILIKE ${`%${trimmed}%`}
       OR variant_id ILIKE ${`%${trimmed}%`}
    ORDER BY created_at DESC
    LIMIT 200
  `;
  return rows;
}

export async function requeueSubscription(subscriptionId: string): Promise<boolean> {
  const { rowCount } = await sql`
    UPDATE restock_subscriptions
    SET status = 'active', notified_at = NULL
    WHERE id = ${subscriptionId}
  `;
  return Boolean(rowCount);
}

export async function markSubscriptionNotified(subscriptionId: string): Promise<void> {
  await sql`
    UPDATE restock_subscriptions
    SET status = 'notified', notified_at = NOW()
    WHERE id = ${subscriptionId}
  `;
}

export async function getActiveSubscriptionsByVariant(variantId: string): Promise<RestockSubscription[]> {
  const { rows } = await sql<RestockSubscription>`
    SELECT *
    FROM restock_subscriptions
    WHERE variant_id = ${variantId}
      AND status = 'active'
      AND notified_at IS NULL
  `;
  return rows;
}
