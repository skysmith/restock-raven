export function isZeroToPositiveTransition(previousQty: number | null, nextQty: number): boolean {
  if (previousQty === null) return false;
  return previousQty <= 0 && nextQty > 0;
}
