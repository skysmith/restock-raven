import { describe, expect, it } from "vitest";
import { subscribeSchema } from "@/lib/validation";

describe("subscribeSchema checkbox coercion", () => {
  it("accepts checkbox-style smsConsent='on' when phone is provided", () => {
    const parsed = subscribeSchema.parse({
      email: null,
      phone: "+15555550123",
      smsConsent: "on",
      marketingOptIn: "on",
      productId: "1",
      variantId: "2"
    });

    expect(parsed.smsConsent).toBe(true);
    expect(parsed.marketingOptIn).toBe(true);
  });

  it("still requires sms consent when phone is provided and consent is missing", () => {
    expect(() =>
      subscribeSchema.parse({
        email: null,
        phone: "+15555550123",
        productId: "1",
        variantId: "2"
      })
    ).toThrow("smsConsent is required when phone is provided");
  });
});
