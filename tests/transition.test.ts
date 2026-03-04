import { describe, expect, it } from "vitest";
import {
  getRestockMinQtyFromZero,
  getRestockTriggerMode,
  isZeroToThresholdTransition
} from "@/lib/jobs/transition";

describe("isZeroToThresholdTransition", () => {
  it("returns true on 0 to threshold+", () => {
    expect(isZeroToThresholdTransition(0, 11, 11)).toBe(true);
  });

  it("returns true on negative to threshold+", () => {
    expect(isZeroToThresholdTransition(-1, 12, 11)).toBe(true);
  });

  it("returns false on 0 to small increase", () => {
    expect(isZeroToThresholdTransition(0, 1, 11)).toBe(false);
  });

  it("returns false when no previous quantity exists", () => {
    expect(isZeroToThresholdTransition(null, 20, 11)).toBe(false);
  });

  it("returns false when quantity stays positive even if large", () => {
    expect(isZeroToThresholdTransition(2, 50, 11)).toBe(false);
  });
});

describe("trigger env defaults", () => {
  it("defaults to threshold mode", () => {
    delete process.env.RESTOCK_TRIGGER_MODE;
    expect(getRestockTriggerMode()).toBe("threshold");
  });

  it("reads manual mode", () => {
    process.env.RESTOCK_TRIGGER_MODE = "manual";
    expect(getRestockTriggerMode()).toBe("manual");
    delete process.env.RESTOCK_TRIGGER_MODE;
  });

  it("defaults threshold to 11", () => {
    delete process.env.RESTOCK_MIN_QTY_FROM_ZERO;
    expect(getRestockMinQtyFromZero()).toBe(11);
  });
});
