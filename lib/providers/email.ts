import { Resend } from "resend";
import { getEnv } from "@/lib/utils/env";

export async function sendRestockEmail(params: {
  to: string;
  variantId: string;
  productId: string;
  unsubscribeToken: string;
}): Promise<string | null> {
  const resend = new Resend(getEnv("RESEND_API_KEY"));
  const baseUrl = getEnv("APP_BASE_URL");
  const unsubscribeUrl = `${baseUrl}/api/restock/unsubscribe?t=${encodeURIComponent(params.unsubscribeToken)}`;

  const result = await resend.emails.send({
    from: getEnv("RESEND_FROM"),
    to: params.to,
    subject: "Your item is back in stock",
    html: `
      <p>Good news — the variant you requested is back in stock.</p>
      <p>Product ID: ${params.productId}<br/>Variant ID: ${params.variantId}</p>
      <p><a href="${unsubscribeUrl}">Stop restock alerts</a></p>
    `,
    text: `Your requested item is back in stock. Product ${params.productId}, Variant ${params.variantId}. Stop alerts: ${unsubscribeUrl}`
  });

  return result.data?.id ?? null;
}
