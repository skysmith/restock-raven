export function normalizePhone(input: string): string {
  const raw = input.trim();
  if (!raw) {
    throw new Error("Phone number is required");
  }

  if (raw.startsWith("+")) {
    const digits = `+${raw.slice(1).replace(/\D/g, "")}`;
    if (!/^\+[1-9]\d{7,14}$/.test(digits)) {
      throw new Error("Invalid phone number format");
    }
    return digits;
  }

  const digits = raw.replace(/\D/g, "");
  const usNumber = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (!/^\d{10}$/.test(usNumber)) {
    throw new Error("Invalid phone number format");
  }

  return `+1${usNumber}`;
}
