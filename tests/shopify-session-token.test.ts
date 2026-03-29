import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { verifyShopifySessionToken } from "@/lib/shopify/session-token";

function encodeBase64Url(value: string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signToken(payload: Record<string, unknown>, secret: string) {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = encodeBase64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${header}.${body}.${signature}`;
}

describe("verifyShopifySessionToken", () => {
  const originalEnv = {
    SHOPIFY_CLIENT_ID: process.env.SHOPIFY_CLIENT_ID,
    SHOPIFY_CLIENT_SECRET: process.env.SHOPIFY_CLIENT_SECRET,
    SHOPIFY_STORE_DOMAIN: process.env.SHOPIFY_STORE_DOMAIN
  };

  afterEach(() => {
    process.env.SHOPIFY_CLIENT_ID = originalEnv.SHOPIFY_CLIENT_ID;
    process.env.SHOPIFY_CLIENT_SECRET = originalEnv.SHOPIFY_CLIENT_SECRET;
    process.env.SHOPIFY_STORE_DOMAIN = originalEnv.SHOPIFY_STORE_DOMAIN;
  });

  it("accepts a valid Shopify session token", () => {
    process.env.SHOPIFY_CLIENT_ID = "test-client-id";
    process.env.SHOPIFY_CLIENT_SECRET = "test-client-secret";
    process.env.SHOPIFY_STORE_DOMAIN = "example-shop.myshopify.com";

    const now = Math.floor(Date.now() / 1000);
    const token = signToken(
      {
        iss: "https://example-shop.myshopify.com/admin",
        dest: "https://example-shop.myshopify.com",
        aud: "test-client-id",
        sub: "gid://shopify/User/1",
        exp: now + 60,
        nbf: now - 5,
        iat: now - 5,
        jti: "abc",
        sid: "sid-1"
      },
      "test-client-secret"
    );

    const verified = verifyShopifySessionToken(token);
    expect(verified.shop).toBe("example-shop.myshopify.com");
    expect(verified.userId).toBe("gid://shopify/User/1");
  });

  it("rejects tokens for the wrong shop", () => {
    process.env.SHOPIFY_CLIENT_ID = "test-client-id";
    process.env.SHOPIFY_CLIENT_SECRET = "test-client-secret";
    process.env.SHOPIFY_STORE_DOMAIN = "example-shop.myshopify.com";

    const now = Math.floor(Date.now() / 1000);
    const token = signToken(
      {
        iss: "https://other-shop.myshopify.com/admin",
        dest: "https://other-shop.myshopify.com",
        aud: "test-client-id",
        exp: now + 60,
        nbf: now - 5,
        iat: now - 5
      },
      "test-client-secret"
    );

    expect(() => verifyShopifySessionToken(token)).toThrow(/destination mismatch/i);
  });
});
