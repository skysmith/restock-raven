import { z } from "zod";

function coerceCheckboxBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off", ""].includes(normalized)) return false;
  return false;
}

export const subscribeSchema = z
  .object({
    email: z.string().email().optional().nullable(),
    phone: z.string().optional().nullable(),
    smsConsent: z.preprocess(coerceCheckboxBoolean, z.boolean()).default(false),
    marketingOptIn: z.preprocess(coerceCheckboxBoolean, z.boolean()).default(false),
    productId: z.string().min(1),
    variantId: z.string().min(1),
    metadata: z.record(z.any()).optional()
  })
  .superRefine((value, ctx) => {
    if (!value.email && !value.phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide email or phone"
      });
    }
    if (value.phone && !value.smsConsent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "smsConsent is required when phone is provided"
      });
    }
  });
