export type RestockTriggerMode = "threshold" | "manual";

export function getRestockTriggerMode(): RestockTriggerMode {
  const mode = process.env.RESTOCK_TRIGGER_MODE?.toLowerCase();
  if (mode === "manual") return "manual";
  return "threshold";
}

export function getRestockMinQtyFromZero(): number {
  const raw = process.env.RESTOCK_MIN_QTY_FROM_ZERO;
  const parsed = raw ? Number(raw) : 11;
  if (!Number.isFinite(parsed) || parsed < 1) return 11;
  return Math.floor(parsed);
}

export function isZeroToThresholdTransition(
  previousQty: number | null,
  nextQty: number,
  minQtyFromZero = getRestockMinQtyFromZero()
): boolean {
  if (previousQty === null) return false;
  return previousQty <= 0 && nextQty >= minQtyFromZero;
}
