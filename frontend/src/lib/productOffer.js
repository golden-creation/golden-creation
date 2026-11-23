export function roundMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function sellingPriceFromMrp(mrp, percent) {
  const base = roundMoney(mrp);
  const rate = Number(percent);
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(rate) || rate <= 0 || rate >= 100) {
    return null;
  }
  const selling = roundMoney(base * (1 - rate / 100));
  if (selling <= 0 || selling >= base) return null;
  return selling;
}

export function resolveProductOffer({ price, comparePrice, mrp, percent } = {}) {
  const selling = roundMoney(Math.max(0, Number(price) || 0));
  const compared = [comparePrice, mrp]
    .map((value) => (value === null || value === undefined || value === "" ? null : roundMoney(value)))
    .find((value) => value && value > selling);

  if (!compared) {
    return { sellingPrice: selling, mrp: selling, percent: 0, savings: 0, active: false };
  }

  const savings = roundMoney(compared - selling);
  const computedPercent = Math.min(100, Math.max(0, Math.round((savings / compared) * 100)));
  const requestedPercent = Number(percent);
  const shownPercent = Number.isFinite(requestedPercent) && requestedPercent > 0 && requestedPercent < 100
    ? Math.round(requestedPercent)
    : computedPercent;

  if (!shownPercent) {
    return { sellingPrice: selling, mrp: selling, percent: 0, savings: 0, active: false };
  }

  return {
    sellingPrice: selling,
    mrp: compared,
    percent: shownPercent,
    savings,
    active: true,
  };
}
