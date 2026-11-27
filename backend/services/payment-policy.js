import { toMoney } from "./checkout-totals.js";

export const DEFAULT_PARTIAL_ADVANCE_PERCENT = 20;
export const DEFAULT_FULL_COD_MIN = 1000;
export const DEFAULT_FULL_COD_MAX = 3000;
export const DEFAULT_PARTIAL_COD_ABOVE = 3000;
export const DEFAULT_COD_DISTANCE_KM = 40;
export const DEFAULT_PORTER_DISTANCE_KM = 40;
export const SHOP_ADDRESS = "Golden Creation, G-38, Baani The Address Shopping Arcade, Sector 56, Golf Course Road, Gurugram, Haryana 122011";
export const SHOP_LATITUDE = 28.42655;
export const SHOP_LONGITUDE = 77.10345;
export const PORTER_DELIVERY_LABEL = "Local Delivery via Porter — At Buyer's Cost";
export const PORTER_PICKUP = "Golden Creation showroom, Sector 56, Gurugram";
export const PORTER_STATUSES = ["Not booked", "Booked", "Picked up", "Delivered", "Cancelled"];
export const PORTER_DISPATCH_STATUSES = ["Booked", "Picked up", "Delivered"];

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

export function paymentBand(unitPrice, settings = {}) {
  const unit = toMoney(unitPrice);
  const minimum = Number(settings.cod_min_amount ?? DEFAULT_FULL_COD_MIN);
  const maximum = Number(settings.cod_max_amount ?? DEFAULT_FULL_COD_MAX);
  const above = Number(settings.partial_cod_above ?? DEFAULT_PARTIAL_COD_ABOVE);
  if (!(maximum > minimum) || unit < minimum) return "online-only";
  if (unit <= maximum) return "full-cod";
  if (unit > above) return "partial-cod";
  return "online-only";
}

export function effectiveUnitPrice(lineTotal, quantity, allocatedDiscount = 0) {
  const qty = Number(quantity);
  if (!(qty > 0)) return 0;
  return toMoney(Math.max(0, Number(lineTotal) - Number(allocatedDiscount || 0)) / qty);
}

export function allocateLineDiscount(lineTotal, merchandise, discountAmount) {
  if (!(merchandise > 0) || !(discountAmount > 0)) return 0;
  return toMoney((Number(lineTotal) / Number(merchandise)) * Number(discountAmount));
}

export function describeUnitPayment(unitPrice, settings = {}) {
  const band = paymentBand(unitPrice, settings);
  const advance = Math.min(100, Math.max(1, Number(settings.default_partial_percent) || DEFAULT_PARTIAL_ADVANCE_PERCENT));
  if (band === "full-cod") {
    return {
      band,
      label: "Full Online or 100% Cash on Delivery",
      fullOnline: true,
      cod: Boolean(Number(settings.full_cod_enabled)),
    };
  }
  if (band === "partial-cod") {
    return {
      band,
      label: `Full Online or ${advance}% online and ${100 - advance}% Cash on Delivery`,
      fullOnline: true,
      cod: Boolean(Number(settings.partial_cod_enabled)),
      advancePercent: advance,
    };
  }
  return {
    band,
    label: "Full Online payment. Cash on Delivery is not available for this price.",
    fullOnline: true,
    cod: false,
  };
}

export function buildPaymentPlan({
  lines = [],
  shippingFee = 0,
  taxAmount = 0,
  settings = {},
  distance = { verified: false, kilometers: null },
  razorpayConfigured = false,
  deliveryMethod = "Standard",
} = {}) {
  const advance = Math.min(100, Math.max(1, Number(settings.default_partial_percent) || DEFAULT_PARTIAL_ADVANCE_PERCENT));
  const codDistance = Number(settings.cod_max_distance_km ?? DEFAULT_COD_DISTANCE_KM);
  const porterDistance = Number(settings.porter_max_distance_km ?? DEFAULT_PORTER_DISTANCE_KM);
  const kilometers = Number(distance.kilometers);
  const distanceVerified = Boolean(distance.verified) && Number.isFinite(kilometers);
  const withinCodDistance = distanceVerified && kilometers <= codDistance;
  const porterSelected = deliveryMethod === "Porter";
  const codAllowed = withinCodDistance && !porterSelected;
  const priced = lines.map((line) => {
    const quantity = Number(line.quantity) || 0;
    const unitPrice = toMoney(line.unitPrice);
    const lineTotal = line.lineTotal == null ? toMoney(unitPrice * quantity) : toMoney(line.lineTotal);
    const band = paymentBand(unitPrice, settings);
    let amountOnline = lineTotal;
    let amountCod = 0;
    if (codAllowed && band === "full-cod" && Number(settings.full_cod_enabled)) {
      amountOnline = 0;
      amountCod = lineTotal;
    } else if (codAllowed && band === "partial-cod" && Number(settings.partial_cod_enabled)) {
      const split = splitPartialAdvance(lineTotal, advance);
      amountOnline = split.amountOnline;
      amountCod = split.amountCod;
    }
    return {
      productId: line.productId || null,
      name: line.name || "",
      band,
      unitPrice,
      quantity,
      lineTotal,
      amountOnline,
      amountCod,
    };
  });
  const productOnline = toMoney(priced.reduce((sum, line) => sum + line.amountOnline, 0));
  const productCod = toMoney(priced.reduce((sum, line) => sum + line.amountCod, 0));
  const extras = toMoney(Number(shippingFee) + Number(taxAmount));
  const everyProductOnCod = priced.length > 0 && priced.every((line) => line.amountOnline === 0 && line.amountCod > 0);
  const codOnline = everyProductOnCod ? 0 : toMoney(productOnline + extras);
  const codBalance = everyProductOnCod ? toMoney(productCod + extras) : productCod;
  const orderTotal = toMoney(productOnline + productCod + extras);
  const distanceReason = !distanceVerified
    ? "Cash on Delivery is unavailable until the road distance from the shop can be verified."
    : kilometers > codDistance
      ? `Cash on Delivery is available only within ${codDistance} km by road.`
      : "";
  const fullCod = {
    enabled: codAllowed && everyProductOnCod && Boolean(Number(settings.full_cod_enabled)),
    amountOnline: 0,
    amountCod: codAllowed && everyProductOnCod ? orderTotal : 0,
    reason: codAllowed && everyProductOnCod ? "" : distanceReason || "Cash on Delivery applies only when every product is in the full COD price range.",
  };
  const partialCod = {
    enabled: Boolean(razorpayConfigured) && codAllowed && productCod > 0 && !everyProductOnCod,
    percentage: advance,
    amountOnline: codOnline,
    amountCod: codBalance,
    reason: codAllowed && productCod > 0 ? "" : distanceReason || "No product in this cart has a Cash on Delivery balance.",
    lines: priced,
  };
  const porterAvailable = Boolean(Number(settings.porter_enabled)) && distanceVerified && kilometers <= porterDistance && !Number(settings.porter_collects_cod);
  return {
    lines: priced,
    distance: {
      verified: distanceVerified,
      kilometers: distanceVerified ? toMoney(kilometers) : null,
      codLimitKm: codDistance,
      porterLimitKm: porterDistance,
      withinCodDistance,
    },
    fullCod,
    partialCod,
    fullOnline: {
      enabled: Boolean(razorpayConfigured) && Boolean(Number(settings.full_online_enabled)),
      amountOnline: orderTotal,
      amountCod: 0,
    },
    porter: {
      available: porterAvailable,
      label: PORTER_DELIVERY_LABEL,
      pickup: PORTER_PICKUP,
      shippingFee: 0,
      buyerPaysCarrier: true,
      requiresFullPayment: true,
      message: porterAvailable
        ? "Porter is available within the road-distance limit. Its delivery charge is paid by you to Porter and is not added to this order. The product amount must be paid in full before booking."
        : distanceVerified
          ? `Porter is available only within ${porterDistance} km by road, and it cannot collect cash.`
          : "Porter is unavailable until the road distance from the shop can be verified.",
    },
  };
}

export function porterDispatchAllowed(order = {}, status = "") {
  if (!PORTER_DISPATCH_STATUSES.includes(status)) return { allowed: true, reason: "" };
  const paid = ["Paid", "Captured"].includes(String(order.payment_status || ""))
    && Number(order.cod_due || 0) === 0
    && Number(order.amount_paid || 0) >= Number(order.total_amount || 0);
  return {
    allowed: paid,
    reason: paid ? "" : "Confirm the full product payment before booking or dispatching Porter",
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
