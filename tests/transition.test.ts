import { describe, expect, it } from "vitest";
import { isZeroToPositiveTransition } from "@/lib/jobs/transition";

describe("isZeroToPositiveTransition", () => {
  it("returns true on 0 to positive", () => {
    expect(isZeroToPositiveTransition(0, 4)).toBe(true);
  });

  it("returns true on negative to positive", () => {
    expect(isZeroToPositiveTransition(-1, 1)).toBe(true);
  });

  it("returns false when no previous quantity exists", () => {
    expect(isZeroToPositiveTransition(null, 3)).toBe(false);
  });

  it("returns false when quantity stays positive", () => {
    expect(isZeroToPositiveTransition(2, 5)).toBe(false);
  });
});
