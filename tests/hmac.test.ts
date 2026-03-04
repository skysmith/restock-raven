import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyShopifyWebhookHmac } from "@/lib/security/hmac";

describe("verifyShopifyWebhookHmac", () => {
  it("returns true for a valid signature", () => {
    const body = JSON.stringify({ hello: "world" });
    const secret = "super-secret";
    const signature = crypto.createHmac("sha256", secret).update(body, "utf8").digest("base64");

    expect(verifyShopifyWebhookHmac(body, signature, secret)).toBe(true);
  });

  it("returns false for an invalid signature", () => {
    const body = JSON.stringify({ hello: "world" });
    expect(verifyShopifyWebhookHmac(body, "bad-signature", "super-secret")).toBe(false);
  });
});
