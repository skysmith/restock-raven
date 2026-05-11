import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimQueuedEvents: vi.fn(),
  markEventIgnored: vi.fn(),
  markEventProcessed: vi.fn(),
  logMessage: vi.fn(),
  getActiveSubscriptionsByVariant: vi.fn(),
  markSubscriptionNotified: vi.fn(),
  sendRestockEmail: vi.fn(),
  sendRestockSms: vi.fn(),
  getVariantRestockEmailContext: vi.fn(),
  isVariantSellableOnline: vi.fn(),
  subscribeEmailToShopifyMarketing: vi.fn(),
  isTwilioConfigured: vi.fn()
}));

vi.mock("@/lib/db/events", () => ({
  claimQueuedEvents: mocks.claimQueuedEvents,
  markEventIgnored: mocks.markEventIgnored,
  markEventProcessed: mocks.markEventProcessed
}));

vi.mock("@/lib/db/message-log", () => ({
  logMessage: mocks.logMessage
}));

vi.mock("@/lib/db/subscriptions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/subscriptions")>();
  return {
    ...actual,
    getActiveSubscriptionsByVariant: mocks.getActiveSubscriptionsByVariant,
    markSubscriptionNotified: mocks.markSubscriptionNotified
  };
});

vi.mock("@/lib/providers/email", () => ({
  sendRestockEmail: mocks.sendRestockEmail
}));

vi.mock("@/lib/providers/sms", () => ({
  sendRestockSms: mocks.sendRestockSms
}));

vi.mock("@/lib/shopify/admin", () => ({
  getVariantRestockEmailContext: mocks.getVariantRestockEmailContext,
  isVariantSellableOnline: mocks.isVariantSellableOnline,
  subscribeEmailToShopifyMarketing: mocks.subscribeEmailToShopifyMarketing
}));

vi.mock("@/lib/utils/env", () => ({
  isTwilioConfigured: mocks.isTwilioConfigured
}));

const { processRestockQueue } = await import("@/lib/jobs/process-restock");

function buildSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    email: "customer@example.com",
    phone: null,
    sms_consent: false,
    sms_consent_at: null,
    email_consent_at: "2026-05-11T18:00:00.000Z",
    marketing_opt_in: true,
    marketing_opt_in_at: "2026-05-11T18:01:00.000Z",
    product_id: "prod_1",
    variant_id: "var_1",
    created_at: "2026-05-11T17:59:00.000Z",
    notified_at: null,
    status: "active",
    unsubscribe_token: "tok",
    metadata: {},
    ...overrides
  };
}

describe("processRestockQueue marketing sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claimQueuedEvents.mockResolvedValue([{ id: "evt_1", variant_id: "var_1" }]);
    mocks.isVariantSellableOnline.mockResolvedValue(true);
    mocks.getVariantRestockEmailContext.mockResolvedValue({
      productTitle: "Nap Mat",
      variantTitle: "Blue",
      productUrl: "https://example.com/products/nap-mat",
      imageUrl: null
    });
    mocks.getActiveSubscriptionsByVariant.mockResolvedValue([buildSubscription()]);
    mocks.sendRestockEmail.mockResolvedValue("email_1");
    mocks.subscribeEmailToShopifyMarketing.mockResolvedValue({ customerId: "gid://shopify/Customer/1" });
    mocks.isTwilioConfigured.mockReturnValue(false);
  });

  it("syncs opted-in email subscribers to Shopify before clearing the email", async () => {
    await processRestockQueue();

    expect(mocks.subscribeEmailToShopifyMarketing).toHaveBeenCalledWith({
      email: "customer@example.com",
      consentedAt: "2026-05-11T18:01:00.000Z"
    });
    expect(mocks.markSubscriptionNotified).toHaveBeenCalledWith("sub_1", { clearEmail: true });
  });

  it("keeps the email available when Shopify marketing sync fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.subscribeEmailToShopifyMarketing.mockRejectedValue(new Error("missing write_customers"));

    await processRestockQueue();

    expect(mocks.markSubscriptionNotified).toHaveBeenCalledWith("sub_1", { clearEmail: false });
    warnSpy.mockRestore();
  });
});
