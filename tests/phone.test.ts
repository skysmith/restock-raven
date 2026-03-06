import { describe, expect, it } from "vitest";
import { normalizePhone } from "@/lib/utils/phone";

describe("normalizePhone", () => {
  it("accepts full E.164 input", () => {
    expect(normalizePhone("+15555550123")).toBe("+15555550123");
  });

  it("defaults plain US 10-digit numbers to +1", () => {
    expect(normalizePhone("555-555-0123")).toBe("+15555550123");
  });

  it("accepts leading 1 for US numbers", () => {
    expect(normalizePhone("1 (555) 555-0123")).toBe("+15555550123");
  });

  it("rejects non-US shorthand lengths", () => {
    expect(() => normalizePhone("5550123")).toThrow("Invalid phone number format");
  });
});
