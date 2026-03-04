CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE subscription_status AS ENUM ('active', 'notified', 'unsubscribed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'restock_event_status') THEN
    CREATE TYPE restock_event_status AS ENUM ('received', 'queued', 'processed', 'ignored');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_channel') THEN
    CREATE TYPE message_channel AS ENUM ('email', 'sms');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_status') THEN
    CREATE TYPE message_status AS ENUM ('sent', 'failed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS restock_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NULL,
  phone TEXT NULL,
  sms_consent BOOLEAN NOT NULL DEFAULT FALSE,
  sms_consent_at TIMESTAMPTZ NULL,
  email_consent_at TIMESTAMPTZ NULL,
  product_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at TIMESTAMPTZ NULL,
  status subscription_status NOT NULL DEFAULT 'active',
  unsubscribe_token TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'restock_subscriptions_contact_variant_unique'
  ) THEN
    ALTER TABLE restock_subscriptions
      ADD CONSTRAINT restock_subscriptions_contact_variant_unique
      UNIQUE NULLS NOT DISTINCT (variant_id, email, phone);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS restock_subscriptions_active_variant_idx
  ON restock_subscriptions (variant_id)
  WHERE status = 'active' AND notified_at IS NULL;

CREATE INDEX IF NOT EXISTS restock_subscriptions_unsubscribe_token_idx
  ON restock_subscriptions (unsubscribe_token);

CREATE TABLE IF NOT EXISTS restock_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id TEXT NOT NULL,
  inventory_from INT NULL,
  inventory_to INT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ NULL,
  shopify_webhook_id TEXT NULL,
  status restock_event_status NOT NULL DEFAULT 'received'
);

CREATE UNIQUE INDEX IF NOT EXISTS restock_events_webhook_id_unique
  ON restock_events (shopify_webhook_id)
  WHERE shopify_webhook_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS restock_events_queue_idx
  ON restock_events (status, processed_at, occurred_at);

CREATE TABLE IF NOT EXISTS variant_inventory_state (
  variant_id TEXT PRIMARY KEY,
  inventory_qty INT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES restock_subscriptions(id) ON DELETE CASCADE,
  channel message_channel NOT NULL,
  provider_message_id TEXT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status message_status NOT NULL,
  error TEXT NULL
);

CREATE INDEX IF NOT EXISTS message_log_subscription_idx ON message_log (subscription_id, sent_at DESC);
