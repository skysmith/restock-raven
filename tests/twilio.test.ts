import twilio from "twilio";
import { describe, expect, it } from "vitest";
import { verifyTwilioWebhookSignature } from "@/lib/security/twilio";

describe("verifyTwilioWebhookSignature", () => {
  it("accepts a valid signature for the public webhook URL", () => {
    const authToken = "twilio-secret";
    const url = new URL("https://internal.vercel.app/api/webhooks/twilio");
    const headers = new Headers({
      host: "internal.vercel.app",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "restock-raven.vercel.app"
    });
    const form = {
      From: "+15555550123",
      Body: "STOP"
    };
    const signature = twilio.getExpectedTwilioSignature(
      authToken,
      "https://restock-raven.vercel.app/api/webhooks/twilio",
      form
    );

    expect(
      verifyTwilioWebhookSignature({
        authToken,
        signature,
        url,
        headers,
        form
      })
    ).toBe(true);
  });

  it("rejects an invalid signature", () => {
    expect(
      verifyTwilioWebhookSignature({
        authToken: "twilio-secret",
        signature: "bad-signature",
        url: new URL("https://restock-raven.vercel.app/api/webhooks/twilio"),
        headers: new Headers({ host: "restock-raven.vercel.app" }),
        form: { From: "+15555550123", Body: "STOP" }
      })
    ).toBe(false);
  });
});
