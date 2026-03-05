import { Resend } from "resend";
import { getEnv } from "@/lib/utils/env";

function formatFromAddress(rawFrom: string): string {
  if (rawFrom.includes("<") && rawFrom.includes(">")) return rawFrom;
  return `Clementine Kids <${rawFrom}>`;
}

export async function sendRestockEmail(params: {
  to: string;
  variantId: string;
  productId: string;
  unsubscribeToken: string;
  productTitle?: string | null;
  variantTitle?: string | null;
  productUrl?: string | null;
  imageUrl?: string | null;
}): Promise<string | null> {
  const resend = new Resend(getEnv("RESEND_API_KEY"));
  const baseUrl = getEnv("APP_BASE_URL");
  const from = formatFromAddress(getEnv("RESEND_FROM"));
  const unsubscribeUrl = `${baseUrl}/api/restock/unsubscribe?t=${encodeURIComponent(params.unsubscribeToken)}`;
  const productTitle = params.productTitle?.trim() || "Your item";
  const variantLine = params.variantTitle ? `<p style="margin: 0 0 14px; color: #4a5560;">${params.variantTitle}</p>` : "";
  const imageBlock = params.imageUrl
    ? `<img src="${params.imageUrl}" alt="${productTitle}" style="display:block;width:100%;max-width:420px;border-radius:12px;border:1px solid #e9e9e9;margin:0 0 16px;" />`
    : "";
  const ctaBlock = params.productUrl
    ? `<p style="margin: 0 0 18px;"><a href="${params.productUrl}" style="display:inline-block;background:#ffad64;color:#1f2933;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;border:1px solid #e09a57;">Shop this item</a></p>`
    : "";
  const fallbackLine = !params.productUrl
    ? `<p style="margin: 0 0 14px; color: #4a5560;">Product ID: ${params.productId} · Variant ID: ${params.variantId}</p>`
    : "";

  const result = await resend.emails.send({
    from,
    to: params.to,
    subject: `${productTitle} is back in stock`,
    html: `
      <div style="background:#f6f7f8;padding:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #ececec;border-radius:14px;padding:22px;">
          <h1 style="margin:0 0 10px;font-size:24px;line-height:1.2;color:#1f2933;">Good news - back in stock</h1>
          <h2 style="margin:0 0 8px;font-size:20px;line-height:1.25;color:#111827;">${productTitle}</h2>
          ${variantLine}
          ${imageBlock}
          ${ctaBlock}
          ${fallbackLine}
          <p style="margin:16px 0 0;color:#6b7280;font-size:13px;">You asked us to notify you when this item came back in stock.</p>
          <p style="margin:10px 0 0;font-size:13px;"><a href="${unsubscribeUrl}" style="color:#334155;">Stop restock alerts</a></p>
        </div>
      </div>
    `,
    text: [
      "Good news - your requested item is back in stock.",
      `Product: ${productTitle}`,
      params.variantTitle ? `Variant: ${params.variantTitle}` : null,
      params.productUrl ? `Shop now: ${params.productUrl}` : `Product ID: ${params.productId} Variant ID: ${params.variantId}`,
      `Stop restock alerts: ${unsubscribeUrl}`
    ]
      .filter(Boolean)
      .join("\n")
  });

  return result.data?.id ?? null;
}
