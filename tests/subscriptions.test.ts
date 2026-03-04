import { describe, expect, it, vi } from "vitest";
import { unsubscribeAllByToken, upsertSubscription } from "@/lib/db/subscriptions";

type SqlCall = {
  strings: TemplateStringsArray;
  values: unknown[];
};

describe("upsertSubscription", () => {
  it("upserts by contact+variant and returns row", async () => {
    const calls: SqlCall[] = [];
    const fakeSql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ strings, values });
      return {
        rows: [
          {
            id: "sub_1",
            email: "test@example.com",
            phone: null,
            sms_consent: false,
            sms_consent_at: null,
            email_consent_at: new Date().toISOString(),
            marketing_opt_in: false,
            marketing_opt_in_at: null,
            product_id: "p1",
            variant_id: "v1",
            created_at: new Date().toISOString(),
            notified_at: null,
            status: "active",
            unsubscribe_token: "tok",
            metadata: {}
          }
        ],
        rowCount: 1
      };
    });

    const row = await upsertSubscription(
      {
        email: "test@example.com",
        phone: null,
        smsConsent: false,
        marketingOptIn: false,
        productId: "p1",
        variantId: "v1",
        metadata: {}
      },
      fakeSql as never
    );

    expect(row.id).toBe("sub_1");
    expect(calls).toHaveLength(1);
    expect(calls[0].strings.join(" ")).toContain("ON CONFLICT ON CONSTRAINT");
  });
});

describe("unsubscribeAllByToken", () => {
  it("updates all subscriptions by matched contact", async () => {
    let call = 0;
    const fakeSql = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return { rows: [{ email: "a@example.com", phone: "+15550001111" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 3 };
    });

    const updated = await unsubscribeAllByToken("tok", fakeSql as never);
    expect(updated).toBe(3);
  });

  it("returns 0 when token does not exist", async () => {
    const fakeSql = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const updated = await unsubscribeAllByToken("missing", fakeSql as never);
    expect(updated).toBe(0);
    expect(fakeSql).toHaveBeenCalledTimes(1);
  });
});
