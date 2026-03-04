import crypto from "node:crypto";

export function verifyShopifyWebhookHmac(rawBody: string, headerHmac: string | null, secret: string): boolean {
  if (!headerHmac) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(headerHmac);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
