// The categorical label a point renders under, shared by App (category extraction)
// and the color-scale builder so the two never drift.
export function getPointCategoryLabel(point) {
  if (!point) return "other";
  return point.label || point.cluster || "other";
}
