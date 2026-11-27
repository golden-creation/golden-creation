import test from "node:test";
import assert from "node:assert/strict";
import { razorpayAmountPaise } from "../services/checkout-totals.js";
import { ALLOWED_CHANGE_FIELDS } from "../services/admin-audit.js";
import { measureRoadDistance, selectDeliveryCoordinate } from "../services/road-distance.js";
import {
  APPROVED_ADVANCE_PERCENT,
  DEFAULT_PARTIAL_ADVANCE_PERCENT,
  allocateDiscountedLines,
  buildPaymentPlan,
  paymentBand,
  porterDispatchAllowed,
  resolvePartialCodAdvance,
  restrictPorterPayments,
  splitPartialAdvance,
  storedOrderAmounts,
} from "../services/payment-policy.js";

const policySettings = {
  full_online_enabled: 1,
  full_cod_enabled: 1,
  partial_cod_enabled: 1,
  default_partial_percent: 20,
  cod_min_amount: 1000,
  cod_max_amount: 3000,
  partial_cod_above: 3000,
  cod_max_distance_km: 40,
  porter_enabled: 1,
  porter_max_distance_km: 40,
  porter_collects_cod: 0,
};

function planFor(unitPrice, quantity = 1, meters = 10000, extra = {}) {
  return buildPaymentPlan({
    lines: [{ productId: 1, name: "Item", unitPrice, quantity, lineTotal: Number((unitPrice * quantity).toFixed(2)) }],
    settings: policySettings,
    distance: { verified: true, meters },
    razorpayConfigured: true,
    ...extra,
  });
}

test("partial COD advance defaults to 20 percent and is calculated once", () => {
  assert.equal(DEFAULT_PARTIAL_ADVANCE_PERCENT, 20);
  assert.deepEqual(splitPartialAdvance(1000), { percentage: 20, amountOnline: 200, amountCod: 800 });
  assert.deepEqual(splitPartialAdvance(999.99, 20), { percentage: 20, amountOnline: 200, amountCod: 799.99 });
});

test("stored 10 percent product, category, and collection rules do not lower the 20 percent advance", () => {
  const rules = [
    { target_type: "Product", target_id: 4, percentage: 10, eligible: 1, status: "Active" },
    { target_type: "Category", target_id: 8, percentage: null, eligible: 1, status: "Active" },
    { target_type: "Collection", target_id: 3, percentage: 10, eligible: 1, status: "Active" },
    { target_type: "Product", target_id: 99, percentage: 50, eligible: 1, status: "Inactive" },
  ];
  const decision = resolvePartialCodAdvance(20, rules, {
    productIds: [4],
    categoryIds: [8],
    collectionIds: [3],
  });
  assert.equal(decision.baseline, 20);
  assert.equal(decision.percentage, 20);
  assert.equal(decision.eligible, true);
  assert.deepEqual(splitPartialAdvance(1000, decision.percentage), {
    percentage: 20,
    amountOnline: 200,
    amountCod: 800,
  });
});

test("stored partial COD overrides cannot change the approved 20 percent advance", () => {
  const raised = resolvePartialCodAdvance(10, [
    { target_type: "Product", target_id: 4, percentage: 40, eligible: 0, status: "Active" },
  ], { productIds: [4], categoryIds: [], collectionIds: [] });
  assert.equal(raised.percentage, APPROVED_ADVANCE_PERCENT);
  assert.equal(raised.eligible, true);
  const result = buildPaymentPlan({
    lines: [{ unitPrice: 5000, quantity: 1, lineTotal: 5000 }],
    settings: { ...policySettings, default_partial_percent: 5, cod_min_amount: 0, cod_max_amount: 100000, partial_cod_above: 100, cod_max_distance_km: 100 },
    distance: { verified: true, meters: 10000 },
    razorpayConfigured: true,
  });
  assert.equal(result.partialCod.percentage, 20);
  assert.equal(result.partialCod.amountOnline, 1000);
  assert.equal(result.partialCod.amountCod, 4000);
});

test("a stored order keeps its original payment split", () => {
  const historical = storedOrderAmounts({ total_amount: 1000, amount_paid: 100, cod_due: 900 });
  assert.deepEqual(historical, { totalAmount: 1000, amountPaid: 100, codDue: 900 });
  assert.notEqual(historical.amountPaid, splitPartialAdvance(historical.totalAmount, 20).amountOnline);
});

test("product eligibility follows the selling unit price and keeps full online available", () => {
  const expected = {
    499: "online-only",
    999: "online-only",
    999.99: "online-only",
    1000: "full-cod",
    2000: "full-cod",
    3000: "full-cod",
    3000.01: "partial-cod",
    5000: "partial-cod",
    70000: "partial-cod",
  };
  for (const [price, band] of Object.entries(expected)) {
    const result = planFor(Number(price));
    assert.equal(paymentBand(Number(price)), band);
    assert.equal(result.lines[0].band, band);
    assert.equal(result.fullOnline.enabled, true);
    assert.equal(result.fullOnline.amountOnline, Number(price));
    if (band === "online-only") {
      assert.equal(result.fullCod.enabled, false);
      assert.equal(result.partialCod.enabled, false);
      assert.equal(result.lines[0].amountOnline, Number(price));
      assert.equal(result.lines[0].amountCod, 0);
    } else if (band === "full-cod") {
      assert.equal(result.fullCod.enabled, true);
      assert.equal(result.fullCod.amountCod, Number(price));
      assert.equal(result.partialCod.enabled, false);
    } else {
      const split = splitPartialAdvance(Number(price), 20);
      assert.equal(result.fullCod.enabled, false);
      assert.equal(result.partialCod.enabled, true);
      assert.equal(result.partialCod.amountOnline, split.amountOnline);
      assert.equal(result.partialCod.amountCod, split.amountCod);
    }
  }
});

test("quantity does not move a low-priced product into a COD band", () => {
  const result = planFor(500, 10);
  assert.equal(result.lines[0].unitPrice, 500);
  assert.equal(result.lines[0].lineTotal, 5000);
  assert.equal(result.lines[0].band, "online-only");
  assert.equal(result.fullCod.enabled, false);
  assert.equal(result.partialCod.amountOnline, 5000);
  assert.equal(result.partialCod.enabled, false);
});

test("a mixed cart splits each product and still offers the full amount online", () => {
  const result = buildPaymentPlan({
    lines: [
      { productId: 1, name: "Small", unitPrice: 500, quantity: 1 },
      { productId: 2, name: "Middle", unitPrice: 2000, quantity: 1 },
      { productId: 3, name: "Large", unitPrice: 5000, quantity: 1 },
    ],
    settings: policySettings,
    distance: { verified: true, meters: 39000 },
    razorpayConfigured: true,
  });
  assert.deepEqual(result.lines.map((line) => [line.amountOnline, line.amountCod]), [
    [500, 0],
    [0, 2000],
    [1000, 4000],
  ]);
  assert.equal(result.partialCod.amountOnline, 1500);
  assert.equal(result.partialCod.amountCod, 6000);
  assert.equal(result.fullOnline.amountOnline, 7500);
  assert.equal(result.fullCod.enabled, false);
  assert.equal(razorpayAmountPaise(result.partialCod.amountOnline), 150000);
  assert.equal(razorpayAmountPaise(result.fullOnline.amountOnline), 750000);
});

test("a product discount and an allocated coupon use the effective unit price", () => {
  const lines = allocateDiscountedLines(
    [
      { productId: 1, name: "Pen", lineTotal: 2000, quantity: 1 },
      { productId: 2, name: "Set", lineTotal: 5000, quantity: 1 },
    ],
    700
  );
  const pen = buildPaymentPlan({
    lines: [lines[0]],
    settings: policySettings,
    distance: { verified: true, meters: 10000 },
    razorpayConfigured: true,
  });
  const set = buildPaymentPlan({
    lines: [lines[1]],
    settings: policySettings,
    distance: { verified: true, meters: 10000 },
    razorpayConfigured: true,
    shippingFee: 49.5,
    taxAmount: 12.34,
    quoteTotal: 4561.84,
  });
  assert.equal(lines[0].lineTotal, 1800);
  assert.equal(pen.lines[0].band, "full-cod");
  assert.equal(lines[1].lineTotal, 4500);
  assert.equal(set.lines[0].band, "partial-cod");
  assert.equal(set.partialCod.amountOnline, 961.84);
  assert.equal(set.partialCod.amountCod, 3600);
  assert.equal(razorpayAmountPaise(set.partialCod.amountOnline) + razorpayAmountPaise(set.partialCod.amountCod), razorpayAmountPaise(set.fullOnline.amountOnline));
});

test("COD and Porter use raw metres and ignore a rounded 40 km display", () => {
  for (const meters of [39999, 40000]) {
    assert.equal(planFor(2000, 1, meters).fullCod.enabled, true);
    assert.equal(planFor(5000, 1, meters).partialCod.enabled, true);
    assert.equal(planFor(2000, 1, meters).porter.available, true);
  }
  const justOver = planFor(2000, 1, 40001);
  assert.equal(justOver.distance.kilometers, 40);
  assert.equal(justOver.fullCod.enabled, false);
  assert.equal(planFor(5000, 1, 40001).partialCod.enabled, false);
  assert.equal(justOver.porter.available, false);
  assert.equal(planFor(2000, 1, 40000, {
    settings: { ...policySettings, cod_max_distance_km: 100, porter_max_distance_km: 100, porter_collects_cod: 1 },
  }).fullCod.enabled, true);
  assert.equal(buildPaymentPlan({
    lines: [{ unitPrice: 2000, quantity: 1, lineTotal: 2000 }],
    settings: policySettings,
    distance: { verified: true, kilometers: 40 },
    razorpayConfigured: true,
  }).fullCod.enabled, false);
  assert.equal(planFor(2000, 1, 10000, { deliveryMethod: "Porter" }).fullCod.enabled, false);
  assert.equal(planFor(5000, 1, 10000, { deliveryMethod: "Porter" }).partialCod.enabled, false);
  assert.equal(planFor(2000, 1, 10000, { deliveryMethod: "Porter", settings: { ...policySettings, porter_collects_cod: 1 } }).fullOnline.enabled, true);
});

test("admin price bounds cannot move a product out of its approved band", () => {
  const widened = buildPaymentPlan({
    lines: [{ unitPrice: 499, quantity: 1, lineTotal: 499 }, { unitPrice: 5000, quantity: 1, lineTotal: 100 }],
    settings: { ...policySettings, cod_min_amount: 0, cod_max_amount: 0, full_online_enabled: 0 },
    distance: { verified: true, meters: 10000 },
    razorpayConfigured: true,
  });
  assert.equal(widened.lines[0].band, "online-only");
  assert.equal(widened.lines[1].band, "online-only");
  assert.equal(widened.fullOnline.enabled, true);
  assert.equal(widened.fullCod.enabled, false);
});

test("Porter cannot be booked before full payment and does not collect cash", () => {
  const unpaid = { payment_status: "Pending", total_amount: 5000, amount_paid: 1000, cod_due: 4000 };
  const paid = { payment_status: "Paid", total_amount: 5000, amount_paid: 5000, cod_due: 0 };
  assert.equal(porterDispatchAllowed(unpaid, "Booked").allowed, false);
  assert.equal(porterDispatchAllowed(unpaid, "Booked", { porterRequiresFullPayment: false }).allowed, false);
  assert.equal(porterDispatchAllowed({ ...paid, cod_due: 0.01 }, "Delivered").allowed, false);
  assert.equal(porterDispatchAllowed(paid, "Booked").allowed, true);
  assert.equal(porterDispatchAllowed(unpaid, "Not booked").allowed, true);
  const blocked = restrictPorterPayments(
    {
      fullCod: { enabled: true, amountCod: 800 },
      partialCod: { enabled: true, amountOnline: 200, amountCod: 800 },
      fullOnline: { enabled: true, amountOnline: 1000, amountCod: 0 },
    },
    { deliveryMethod: "Porter", porterCollectsCod: false }
  );
  assert.equal(blocked.fullCod.enabled, false);
  assert.equal(blocked.partialCod.enabled, false);
  assert.equal(blocked.fullOnline.enabled, true);
});

test("a legacy Android COD request is rejected unless every product is full COD", () => {
  const low = planFor(499);
  const mixed = buildPaymentPlan({
    lines: [
      { unitPrice: 500, quantity: 1 },
      { unitPrice: 2000, quantity: 1 },
    ],
    settings: policySettings,
    distance: { verified: true, meters: 10000 },
    razorpayConfigured: true,
  });
  assert.equal(low.fullCod.enabled, false);
  assert.equal(mixed.fullCod.enabled, false);
  assert.equal(planFor(2000).fullCod.enabled, true);
});

test("payment setting changes are included in the Super Admin audit allowlist", () => {
  for (const field of [
    "full_online_enabled",
    "full_cod_enabled",
    "partial_cod_enabled",
    "default_partial_percent",
    "cod_min_amount",
    "cod_max_amount",
    "partial_cod_above",
    "cod_max_distance_km",
    "porter_enabled",
    "porter_max_distance_km",
    "porter_requires_full_payment",
    "porter_customer_pays_delivery",
  ]) {
    assert.equal(ALLOWED_CHANGE_FIELDS.has(field), true);
  }
});

function locatedFeature(longitude, latitude, confidence = 0.92) {
  return {
    geometry: { coordinates: [longitude, latitude] },
    properties: { layer: "address", confidence, match_type: "exact" },
  };
}

test("road distance keeps raw metres, hides the API key, and fails closed", async () => {
  const seen = [];
  const fetchImpl = async (url, options = {}) => {
    seen.push({ url, authorization: options.headers?.Authorization || "" });
    if (String(url).includes("geocode")) {
      return { ok: true, json: async () => ({ features: [locatedFeature(77.2, 28.5)] }) };
    }
    return { ok: true, json: async () => ({ features: [{ properties: { summary: { distance: 40000 } } }] }) };
  };
  const result = await measureRoadDistance({ address: "Sector 14, Gurugram", apiKey: "secret-routing-key", fetchImpl });
  assert.equal(result.verified, true);
  assert.equal(result.meters, 40000);
  assert.equal(result.kilometers, 40);
  assert.equal(seen.every((call) => !String(call.url).includes("secret-routing-key")), true);
  assert.equal(seen.every((call) => call.authorization === "secret-routing-key"), true);
  assert.equal(selectDeliveryCoordinate([locatedFeature(77.2, 28.5, 0.4)]), null);
  assert.equal(selectDeliveryCoordinate([
    locatedFeature(77.1, 28.4, 0.9),
    locatedFeature(77.4, 28.7, 0.88),
  ]), null);
  const missing = await measureRoadDistance({ address: "Sector 14, Gurugram", apiKey: "", fetchImpl });
  assert.equal(missing.verified, false);
  const failed = await measureRoadDistance({
    address: "Sector 14, Gurugram",
    apiKey: "secret-routing-key",
    fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
  });
  assert.equal(failed.verified, false);
  const timedOut = await measureRoadDistance({
    address: "Sector 14, Gurugram",
    apiKey: "secret-routing-key",
    timeoutMs: 20,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")));
    }),
  });
  assert.equal(timedOut.verified, false);
});
