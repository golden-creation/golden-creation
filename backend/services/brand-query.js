export function resolveBrandListLimit(value) {
  const parsed = Number(value);
  const requested = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 24;
  return Math.min(500, Math.max(6, requested));
}
