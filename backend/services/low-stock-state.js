export function planLowStockStateWrite({ existingCount = 0, isLow = false, wasLow = false } = {}) {
  const enteringLow = Boolean(isLow) && !wasLow;
  if (Number(existingCount) > 0) {
    return { mode: "update", isLow: Boolean(isLow), setAlertedAt: enteringLow };
  }
  return { mode: "insert", isLow: Boolean(isLow), setAlertedAt: enteringLow };
}
