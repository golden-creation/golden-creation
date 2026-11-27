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

export function acceptedRoadMeters(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return null;
    value = Number(trimmed);
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}
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
  void defaultPercent;
  void rules;
  void targets;
  return { eligible: true, percentage: APPROVED_ADVANCE_PERCENT, baseline: APPROVED_ADVANCE_PERCENT };
}

export function splitPartialAdvance(total) {
  const percent = APPROVED_ADVANCE_PERCENT;
  const totalPaise = rupeesToPaise(total);
  const amountOnlinePaise = Math.round((totalPaise * percent) / 100);
  const amountCodPaise = totalPaise - amountOnlinePaise;
  return {
    percentage: percent,
    amountOnline: paiseToRupees(amountOnlinePaise),
    amountCod: paiseToRupees(amountCodPaise),
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

export const APPROVED_ADVANCE_PERCENT = 20;
export const APPROVED_DISTANCE_METERS = 40000;

export function rupeesToPaise(value) {
  return Math.round(toMoney(value) * 100);
}

export function paiseToRupees(paise) {
  return toMoney(Number(paise) / 100);
}

export function paymentBand(unitPrice) {
  const unitPaise = rupeesToPaise(unitPrice);
  if (unitPaise < DEFAULT_FULL_COD_MIN * 100) return "online-only";
  if (unitPaise <= DEFAULT_FULL_COD_MAX * 100) return "full-cod";
  return "partial-cod";
}

export function linePaymentBand(linePaise, quantity) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1) return "online-only";
  const unitTimesQuantity = Number(linePaise);
  if (unitTimesQuantity < DEFAULT_FULL_COD_MIN * 100 * qty) return "online-only";
  if (unitTimesQuantity <= DEFAULT_FULL_COD_MAX * 100 * qty) return "full-cod";
  return "partial-cod";
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

export function describeUnitPayment(unitPrice) {
  const band = paymentBand(unitPrice);
  if (band === "full-cod") {
    return {
      band,
      label: "Full Online or 100% Cash on Delivery",
      fullOnline: true,
      cod: true,
    };
  }
  if (band === "partial-cod") {
    return {
      band,
      label: "Full Online or 20% online and 80% Cash on Delivery",
      fullOnline: true,
      cod: true,
      advancePercent: APPROVED_ADVANCE_PERCENT,
    };
  }
  return {
    band,
    label: "Full Online payment. Cash on Delivery is not available for this price.",
    fullOnline: true,
    cod: false,
  };
}

export function allocateDiscountedLines(items = [], discountAmount = 0) {
  const linePaise = items.map((item) => Math.max(0, rupeesToPaise(item.lineTotal)));
  const merchandisePaise = linePaise.reduce((sum, paise) => sum + paise, 0);
  const discountPaise = Math.min(merchandisePaise, Math.max(0, rupeesToPaise(discountAmount)));
  const shares = linePaise.map((paise) => (
    merchandisePaise > 0 ? Math.min(paise, Math.floor((paise * discountPaise) / merchandisePaise)) : 0
  ));
  let leftover = discountPaise - shares.reduce((sum, paise) => sum + paise, 0);
  for (let index = items.length - 1; index >= 0 && leftover > 0; index -= 1) {
    const room = linePaise[index] - shares[index];
    const add = Math.min(room, leftover);
    shares[index] += add;
    leftover -= add;
  }
  return items.map((item, index) => {
    const discountedPaise = linePaise[index] - shares[index];
    const quantity = Number(item.quantity);
    return {
      productId: item.productId || null,
      name: item.productName || item.name || "",
      quantity,
      lineTotal: paiseToRupees(discountedPaise),
      unitPrice: Number.isInteger(quantity) && quantity > 0 ? paiseToRupees(discountedPaise / quantity) : 0,
    };
  });
}

function quoteError(message) {
  return Object.assign(new Error(message), { statusCode: 422 });
}

export function buildPaymentPlan({
  lines = [],
  shippingFee = 0,
  taxAmount = 0,
  settings = {},
  distance = { verified: false, meters: null },
  razorpayConfigured = false,
  deliveryMethod = "Standard",
  quoteTotal = null,
} = {}) {
  const meters = acceptedRoadMeters(distance.meters);
  const distanceVerified = distance.verified === true && meters != null;
  const withinDistance = distanceVerified && meters <= APPROVED_DISTANCE_METERS;
  const porterSelected = deliveryMethod === "Porter";
  const codAllowed = withinDistance && !porterSelected;
  if (Number(shippingFee) < 0 || Number(taxAmount) < 0) {
    throw quoteError("Shipping and tax cannot be negative");
  }
  const priced = lines.map((line) => {
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) throw quoteError("Each product quantity must be a whole number");
    const linePaise = line.lineTotal == null
      ? rupeesToPaise(Number(line.unitPrice) * quantity)
      : rupeesToPaise(line.lineTotal);
    if (linePaise < 0) throw quoteError("A product total cannot be negative");
    const band = linePaymentBand(linePaise, quantity);
    let onlinePaise = linePaise;
    let codPaise = 0;
    if (codAllowed && band === "full-cod" && Number(settings.full_cod_enabled)) {
      onlinePaise = 0;
      codPaise = linePaise;
    } else if (codAllowed && band === "partial-cod" && Number(settings.partial_cod_enabled)) {
      onlinePaise = Math.round((linePaise * APPROVED_ADVANCE_PERCENT) / 100);
      codPaise = linePaise - onlinePaise;
    }
    return {
      productId: line.productId || null,
      name: line.name || "",
      band,
      unitPrice: paiseToRupees(linePaise / quantity),
      quantity,
      lineTotal: paiseToRupees(linePaise),
      amountOnline: paiseToRupees(onlinePaise),
      amountCod: paiseToRupees(codPaise),
      onlinePaise,
      codPaise,
      linePaise,
    };
  });
  const productOnlinePaise = priced.reduce((sum, line) => sum + line.onlinePaise, 0);
  const productCodPaise = priced.reduce((sum, line) => sum + line.codPaise, 0);
  const extrasPaise = rupeesToPaise(shippingFee) + rupeesToPaise(taxAmount);
  const everyProductOnCod = priced.length > 0 && priced.every((line) => line.onlinePaise === 0 && line.codPaise > 0);
  const onlinePaise = everyProductOnCod ? 0 : productOnlinePaise + extrasPaise;
  const codPaise = everyProductOnCod ? productCodPaise + extrasPaise : productCodPaise;
  const totalPaise = productOnlinePaise + productCodPaise + extrasPaise;
  if (onlinePaise < 0 || codPaise < 0 || onlinePaise + codPaise !== totalPaise) {
    throw quoteError("Payment allocation does not balance");
  }
  if (quoteTotal != null && rupeesToPaise(quoteTotal) !== totalPaise) {
    throw quoteError("Payment allocation does not match the quoted total");
  }
  const displayLines = priced.map(({ onlinePaise: _online, codPaise: _cod, linePaise: _line, ...line }) => line);
  const distanceReason = !distanceVerified
    ? "Cash on Delivery is unavailable until the road distance from the shop can be verified."
    : meters > APPROVED_DISTANCE_METERS
      ? "Cash on Delivery is available only within 40 km by road."
      : "";
  const orderTotal = paiseToRupees(totalPaise);
  return {
    lines: displayLines,
    distance: {
      verified: distanceVerified,
      meters: distanceVerified ? meters : null,
      kilometers: distanceVerified ? Number((meters / 1000).toFixed(2)) : null,
      codLimitMeters: APPROVED_DISTANCE_METERS,
      porterLimitMeters: APPROVED_DISTANCE_METERS,
      withinCodDistance: withinDistance,
    },
    fullCod: {
      enabled: codAllowed && everyProductOnCod && Boolean(Number(settings.full_cod_enabled)),
      amountOnline: 0,
      amountCod: codAllowed && everyProductOnCod ? orderTotal : 0,
      reason: codAllowed && everyProductOnCod ? "" : distanceReason || "Cash on Delivery applies only when every product is in the full COD price range.",
    },
    partialCod: {
      enabled: Boolean(razorpayConfigured) && codAllowed && productCodPaise > 0 && !everyProductOnCod,
      percentage: APPROVED_ADVANCE_PERCENT,
      amountOnline: paiseToRupees(onlinePaise),
      amountCod: paiseToRupees(codPaise),
      reason: codAllowed && productCodPaise > 0 ? "" : distanceReason || "No product in this cart has a Cash on Delivery balance.",
      lines: displayLines,
    },
    fullOnline: {
      enabled: Boolean(razorpayConfigured),
      amountOnline: orderTotal,
      amountCod: 0,
    },
    porter: {
      available: Boolean(Number(settings.porter_enabled)) && withinDistance,
      label: PORTER_DELIVERY_LABEL,
      pickup: PORTER_PICKUP,
      shippingFee: 0,
      buyerPaysCarrier: true,
      collectsCod: false,
      requiresFullPayment: true,
      message: Boolean(Number(settings.porter_enabled)) && withinDistance
        ? "Porter is available within 40 km by road. Its delivery charge is paid by you to Porter and is not added to this order. The product amount must be paid in full before booking."
        : distanceVerified
          ? "Porter is available only within 40 km by road, and it cannot collect cash."
          : "Porter is unavailable until the road distance from the shop can be verified.",
    },
  };
}

export function assertCapturedQuote({ quote, paymentMethod, codDue, amountPaid }) {
  const options = quote?.paymentOptions;
  if (!options?.fullOnline || !Array.isArray(options.lines)) {
    throw quoteError("The quoted payment allocation is missing");
  }
  const totalPaise = rupeesToPaise(quote.totalAmount);
  if (rupeesToPaise(options.fullOnline.amountOnline) !== totalPaise || rupeesToPaise(options.fullOnline.amountCod) !== 0) {
    throw quoteError("The full online amount does not match the quoted total");
  }
  for (const line of options.lines) {
    if (rupeesToPaise(line.amountOnline) < 0 || rupeesToPaise(line.amountCod) < 0) {
      throw quoteError("A product payment allocation cannot be negative");
    }
    if (rupeesToPaise(line.amountOnline) + rupeesToPaise(line.amountCod) !== rupeesToPaise(line.lineTotal)) {
      throw quoteError("A product payment allocation does not match its price");
    }
  }
  if (paymentMethod === "Full Online") {
    if (rupeesToPaise(codDue) !== 0) throw quoteError("Full online payment cannot leave a COD balance");
  } else if (paymentMethod === "Partial COD") {
    if (!options.partialCod?.enabled) throw quoteError("Partial COD is not available for this cart");
    if (rupeesToPaise(options.partialCod.amountOnline) + rupeesToPaise(options.partialCod.amountCod) !== totalPaise) {
      throw quoteError("The partial COD split does not match the quoted total");
    }
    if (rupeesToPaise(codDue) !== rupeesToPaise(options.partialCod.amountCod)) {
      throw quoteError("The COD balance does not match the quoted split");
    }
  } else if (paymentMethod === "Full COD" || paymentMethod === "Cash on Delivery" || paymentMethod === "COD") {
    if (!options.fullCod?.enabled) throw quoteError("Cash on Delivery is currently unavailable");
    if (rupeesToPaise(codDue) !== totalPaise || rupeesToPaise(amountPaid) !== 0) {
      throw quoteError("Cash on Delivery must leave the full quoted total unpaid");
    }
  }
}

export function porterDispatchAllowed(order = {}, status = "") {
  if (!PORTER_DISPATCH_STATUSES.includes(status)) return { allowed: true, reason: "" };
  const paid = ["Paid", "Captured"].includes(String(order.payment_status || ""))
    && rupeesToPaise(order.cod_due) === 0
    && rupeesToPaise(order.amount_paid) >= rupeesToPaise(order.total_amount)
    && rupeesToPaise(order.amount_paid) > 0;
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
