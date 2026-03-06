import { afterEach, describe, expect, it } from "vitest";
import { getAllowedSubscribeOrigins } from "@/lib/utils/env";

const originalStoreDomain = process.env.SHOPIFY_STORE_DOMAIN;
const originalStorefrontBase = process.env.SHOPIFY_STOREFRONT_BASE_URL;

describe("getAllowedSubscribeOrigins", () => {
  afterEach(() => {
    process.env.SHOPIFY_STORE_DOMAIN = originalStoreDomain;
    process.env.SHOPIFY_STOREFRONT_BASE_URL = originalStorefrontBase;
  });

  it("normalizes the Shopify and storefront domains into an allowlist", () => {
    process.env.SHOPIFY_STORE_DOMAIN = "clementinekids.myshopify.com";
    process.env.SHOPIFY_STOREFRONT_BASE_URL = "https://clementinekids.com/";

    expect(getAllowedSubscribeOrigins()).toEqual([
      "https://clementinekids.myshopify.com",
      "https://clementinekids.com"
    ]);
  });

  it("ignores invalid origins", () => {
    process.env.SHOPIFY_STORE_DOMAIN = "not a domain";
    process.env.SHOPIFY_STOREFRONT_BASE_URL = "";

    expect(getAllowedSubscribeOrigins()).toEqual([]);
  });
});
