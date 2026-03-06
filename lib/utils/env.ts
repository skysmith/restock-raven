const requiredVars = [
  "APP_BASE_URL",
  "CRON_JOB_SECRET",
  "SHOPIFY_STORE_DOMAIN",
  "SHOPIFY_WEBHOOK_SECRET",
  "SHOPIFY_LOCATION_ID",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
  "RESEND_API_KEY",
  "RESEND_FROM"
] as const;

export function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

export function assertRequiredEnv(): void {
  for (const key of requiredVars) {
    if (!process.env[key]) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }

  const hasAdminToken = Boolean(process.env.SHOPIFY_ADMIN_TOKEN);
  const hasClientCreds = Boolean(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET);
  if (!hasAdminToken && !hasClientCreds) {
    throw new Error(
      "Missing Shopify auth configuration: set SHOPIFY_ADMIN_TOKEN or both SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET"
    );
  }
}

export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER
  );
}

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

export function getAllowedSubscribeOrigins(): string[] {
  const origins = new Set<string>();

  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  if (storeDomain) {
    const normalized = normalizeOrigin(storeDomain);
    if (normalized) origins.add(normalized);
  }

  const storefrontBase = process.env.SHOPIFY_STOREFRONT_BASE_URL;
  if (storefrontBase) {
    const normalized = normalizeOrigin(storefrontBase);
    if (normalized) origins.add(normalized);
  }

  return [...origins];
}
