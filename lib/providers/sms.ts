import twilio from "twilio";
import { getEnv } from "@/lib/utils/env";

export async function sendRestockSms(params: {
  to: string;
  variantId: string;
  productId: string;
}): Promise<string | null> {
  const client = twilio(getEnv("TWILIO_ACCOUNT_SID"), getEnv("TWILIO_AUTH_TOKEN"));
  const message = await client.messages.create({
    from: getEnv("TWILIO_FROM_NUMBER"),
    to: params.to,
    body: `Restock alert: Product ${params.productId}, Variant ${params.variantId} is back in stock. Reply STOP to opt out.`
  });

  return message.sid ?? null;
}
