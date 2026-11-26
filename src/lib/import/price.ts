export function suggestSalePrice(cost: number, marginPercent = 30) {
  if (!Number.isFinite(cost) || cost < 0) return 0;
  const margin = Number.isFinite(marginPercent) ? marginPercent : 30;
  const raw = cost * (1 + margin / 100);
  return Math.max(0, Math.round(raw / 100) * 100);
}
