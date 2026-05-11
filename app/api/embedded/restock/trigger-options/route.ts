import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { listSubscribedVariants } from "@/lib/db/subscriptions";
import { buildTriggerVariantOptions } from "@/lib/restock/trigger-options";
import { getVariantAdminMetaMap } from "@/lib/shopify/admin";
import { requireEmbeddedShopifySession } from "@/lib/shopify/embedded-auth";

export async function GET(request: NextRequest) {
  const auth = requireEmbeddedShopifySession(request);
  if (!auth.ok) return auth.response;

  const subscribedVariants = await listSubscribedVariants();
  let variantMetaById: Awaited<ReturnType<typeof getVariantAdminMetaMap>> = {};
  try {
    variantMetaById = await getVariantAdminMetaMap(
      subscribedVariants.map((subscribedVariant) => subscribedVariant.variant_id)
    );
  } catch {
    variantMetaById = {};
  }

  return NextResponse.json({
    ok: true,
    shop: auth.session.shop,
    options: buildTriggerVariantOptions(subscribedVariants, variantMetaById)
  });
}
