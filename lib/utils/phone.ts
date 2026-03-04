export function normalizePhone(input: string): string {
  const raw = input.trim();
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits.startsWith("+")) {
    throw new Error("Phone number must include country code (E.164), e.g. +15551234567");
  }
  if (!/^\+[1-9]\d{7,14}$/.test(digits)) {
    throw new Error("Invalid phone number format");
  }
  return digits;
}
