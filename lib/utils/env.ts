const requiredVars = [
  "APP_BASE_URL",
  "CRON_JOB_SECRET",
  "SHOPIFY_STORE_DOMAIN",
  "SHOPIFY_ADMIN_TOKEN",
  "SHOPIFY_WEBHOOK_SECRET",
  "SHOPIFY_LOCATION_ID",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
  "RESEND_API_KEY",
  "RESEND_FROM",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER"
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
}
