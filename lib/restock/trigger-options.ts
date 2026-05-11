import type { SubscribedVariant } from "@/lib/db/subscriptions";
import type { VariantAdminMeta } from "@/lib/shopify/admin";

export interface TriggerVariantOption {
  variantId: string;
  label: string;
  detail: string | null;
  subscriptionCount: number;
  activeSubscriptionCount: number;
}

const productCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function getProductLabel(variantId: string, variantMeta: VariantAdminMeta | undefined): string {
  return variantMeta?.productTitle?.trim() || `Variant ${variantId}`;
}

function getVariantDetail(variantMeta: VariantAdminMeta | undefined): string | null {
  return [variantMeta?.sku, variantMeta?.variantTitle].filter(Boolean).join(" - ") || null;
}

export function buildTriggerVariantOptions(
  subscribedVariants: SubscribedVariant[],
  variantMetaById: Record<string, VariantAdminMeta>
): TriggerVariantOption[] {
  return subscribedVariants
    .map((subscribedVariant) => {
      const variantMeta = variantMetaById[subscribedVariant.variant_id];
      return {
        variantId: subscribedVariant.variant_id,
        label: getProductLabel(subscribedVariant.variant_id, variantMeta),
        detail: getVariantDetail(variantMeta),
        subscriptionCount: subscribedVariant.subscription_count,
        activeSubscriptionCount: subscribedVariant.active_subscription_count
      };
    })
    .sort((a, b) => {
      const activeDiff = b.activeSubscriptionCount - a.activeSubscriptionCount;
      if (activeDiff !== 0) return activeDiff;

      const labelDiff = productCollator.compare(a.label, b.label);
      if (labelDiff !== 0) return labelDiff;

      return productCollator.compare(a.detail ?? "", b.detail ?? "");
    });
}
