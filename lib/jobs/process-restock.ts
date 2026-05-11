import { claimQueuedEvents, markEventIgnored, markEventProcessed } from "@/lib/db/events";
import { logMessage } from "@/lib/db/message-log";
import {
  getActiveSubscriptionsByVariant,
  isClearedEmailPlaceholder,
  markSubscriptionNotified
} from "@/lib/db/subscriptions";
import { sendRestockEmail } from "@/lib/providers/email";
import { sendRestockSms } from "@/lib/providers/sms";
import {
  getVariantRestockEmailContext,
  isVariantSellableOnline,
  subscribeEmailToShopifyMarketing
} from "@/lib/shopify/admin";
import { isTwilioConfigured } from "@/lib/utils/env";

export interface ProcessResult {
  eventsClaimed: number;
  subscriptionsProcessed: number;
  messagesSent: number;
  messagesFailed: number;
}

export async function processRestockQueue(limit = 100): Promise<ProcessResult> {
  const claimedEvents = await claimQueuedEvents(limit);
  const smsEnabled = isTwilioConfigured();
  let subscriptionsProcessed = 0;
  let messagesSent = 0;
  let messagesFailed = 0;

  for (const event of claimedEvents) {
    const sellable = await isVariantSellableOnline(event.variant_id);
    if (!sellable) {
      await markEventIgnored(event.id);
      continue;
    }
    const emailContext = await getVariantRestockEmailContext(event.variant_id);

    const subscriptions = await getActiveSubscriptionsByVariant(event.variant_id);

    for (const subscription of subscriptions) {
      subscriptionsProcessed += 1;
      let allChannelsSucceeded = true;
      let emailNotified = false;
      const email = isClearedEmailPlaceholder(subscription.email) ? null : subscription.email;

      if (email) {
        try {
          const providerMessageId = await sendRestockEmail({
            to: email,
            productId: subscription.product_id,
            variantId: subscription.variant_id,
            unsubscribeToken: subscription.unsubscribe_token,
            productTitle: emailContext?.productTitle,
            variantTitle: emailContext?.variantTitle,
            productUrl: emailContext?.productUrl,
            imageUrl: emailContext?.imageUrl
          });

          await logMessage({
            subscriptionId: subscription.id,
            channel: "email",
            providerMessageId,
            status: "sent"
          });
          messagesSent += 1;
          emailNotified = true;
        } catch (error) {
          allChannelsSucceeded = false;
          messagesFailed += 1;
          await logMessage({
            subscriptionId: subscription.id,
            channel: "email",
            providerMessageId: null,
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown email error"
          });
        }
      }

      if (smsEnabled && subscription.phone && subscription.sms_consent) {
        try {
          const providerMessageId = await sendRestockSms({
            to: subscription.phone,
            productId: subscription.product_id,
            variantId: subscription.variant_id
          });

          await logMessage({
            subscriptionId: subscription.id,
            channel: "sms",
            providerMessageId,
            status: "sent"
          });
          messagesSent += 1;
        } catch (error) {
          allChannelsSucceeded = false;
          messagesFailed += 1;
          await logMessage({
            subscriptionId: subscription.id,
            channel: "sms",
            providerMessageId: null,
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown SMS error"
          });
        }
      }

      if (allChannelsSucceeded) {
        let clearEmail = emailNotified;
        if (emailNotified && email && subscription.marketing_opt_in) {
          try {
            await subscribeEmailToShopifyMarketing({
              email,
              consentedAt: subscription.marketing_opt_in_at ?? subscription.email_consent_at
            });
          } catch (error) {
            clearEmail = false;
            const message = error instanceof Error ? error.message : "Unknown Shopify marketing error";
            console.warn(
              `Shopify marketing sync failed for restock subscription ${subscription.id}: ${message}`
            );
          }
        }

        await markSubscriptionNotified(subscription.id, { clearEmail });
      }
    }

    await markEventProcessed(event.id);
  }

  return {
    eventsClaimed: claimedEvents.length,
    subscriptionsProcessed,
    messagesSent,
    messagesFailed
  };
}
