import { toMoney } from "./checkout-totals.js";

export const DEFAULT_PARTIAL_ADVANCE_PERCENT = 20;
export const PORTER_DELIVERY_LABEL = "Local Delivery via Porter — At Buyer's Cost";
export const PORTER_PICKUP = "Golden Creation showroom, Sector 56, Gurugram";
export const PORTER_STATUSES = ["Not booked", "Booked", "Picked up", "Delivered", "Cancelled"];

export function normalizePin(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 6 ? digits.slice(-6) : "";
}

export function parsePinList(value) {
  return [...new Set(String(value || "").split(/[^0-9]+/).map(normalizePin).filter(Boolean))];
}

export function resolvePartialCodAdvance(defaultPercent, rules = [], targets = {}) {
  const baseline = Math.min(100, Math.max(1, Number(defaultPercent) || DEFAULT_PARTIAL_ADVANCE_PERCENT));
  let percentage = baseline;
  let eligible = true;
  const idsByType = {
    Product: new Set((targets.productIds || []).map(Number)),
    Collection: new Set((targets.collectionIds || []).map(Number)),
    Category: new Set((targets.categoryIds || []).map(Number)),
  };
  for (const rule of rules) {
    if (rule.status && rule.status !== "Active") continue;
    const ids = idsByType[rule.target_type];
    if (!ids || !ids.has(Number(rule.target_id))) continue;
    if (!Number(rule.eligible)) {
      eligible = false;
      continue;
    }
    if (rule.percentage === null || rule.percentage === undefined || rule.percentage === "") continue;
    const rulePercent = Number(rule.percentage);
    if (Number.isFinite(rulePercent) && rulePercent > percentage) {
      percentage = Math.min(100, rulePercent);
    }
  }
  return { eligible, percentage, baseline };
}

export function splitPartialAdvance(total, percentage = DEFAULT_PARTIAL_ADVANCE_PERCENT) {
  const percent = Math.min(100, Math.max(1, Number(percentage) || DEFAULT_PARTIAL_ADVANCE_PERCENT));
  const amountOnline = toMoney((Number(total) * percent) / 100);
  return {
    percentage: percent,
    amountOnline,
    amountCod: toMoney(Number(total) - amountOnline),
  };
}

export function storedOrderAmounts(order = {}) {
  return {
    totalAmount: toMoney(order.total_amount ?? order.totalAmount),
    amountPaid: toMoney(order.amount_paid ?? order.amountPaid),
    codDue: toMoney(order.cod_due ?? order.codDue),
  };
}

export function evaluateFullCod({
  enabled = false,
  total = 0,
  pin = "",
  minAmount = 0,
  maxAmount = 0,
  restricted = false,
  pins = "",
} = {}) {
  const payable = toMoney(total);
  if (!enabled) {
    return { enabled: false, amountOnline: 0, amountCod: payable, reason: "Cash on Delivery is turned off" };
  }
  const minimum = Number(minAmount) || 0;
  const maximum = Number(maxAmount) || 0;
  if (minimum > 0 && payable < minimum) {
    return { enabled: false, amountOnline: 0, amountCod: payable, reason: `Cash on Delivery requires an order of at least Rs. ${minimum.toFixed(2)}` };
  }
  if (maximum > 0 && payable > maximum) {
    return { enabled: false, amountOnline: 0, amountCod: payable, reason: `Cash on Delivery is available up to Rs. ${maximum.toFixed(2)}` };
  }
  if (restricted && !parsePinList(pins).includes(normalizePin(pin))) {
    return { enabled: false, amountOnline: 0, amountCod: payable, reason: "Cash on Delivery is not available for this PIN code" };
  }
  return { enabled: true, amountOnline: 0, amountCod: payable, reason: "" };
}

export function porterAvailability({ enabled = false, pin = "", pins = "" } = {}) {
  const allowed = parsePinList(pins);
  const available = Boolean(Number(enabled)) && allowed.includes(normalizePin(pin));
  return {
    available,
    label: PORTER_DELIVERY_LABEL,
    pickup: PORTER_PICKUP,
    shippingFee: 0,
    buyerPaysCarrier: true,
    message: available
      ? "Porter collects its own delivery charge from you. Golden Creation does not add that charge to this order."
      : "Local Porter delivery is available only for configured Gurugram PIN codes.",
  };
}

export function restrictPorterPayments(options, { deliveryMethod = "Standard", porterCollectsCod = false } = {}) {
  if (deliveryMethod !== "Porter" || porterCollectsCod) return options;
  return {
    ...options,
    fullCod: {
      ...options.fullCod,
      enabled: false,
      reason: "Porter cannot collect cash for this order. Pay the full amount online.",
    },
    partialCod: {
      ...options.partialCod,
      enabled: false,
      reason: "Partial COD is unavailable because Porter cannot collect the balance on delivery.",
    },
  };
}
