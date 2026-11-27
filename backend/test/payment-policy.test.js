import test from "node:test";
import assert from "node:assert/strict";
import { razorpayAmountPaise } from "../services/checkout-totals.js";
import { ALLOWED_CHANGE_FIELDS } from "../services/admin-audit.js";
import { measureRoadDistance } from "../services/road-distance.js";
import {
  DEFAULT_PARTIAL_ADVANCE_PERCENT,
  allocateLineDiscount,
  buildPaymentPlan,
  effectiveUnitPrice,
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

function planFor(unitPrice, quantity = 1, distance = { verified: true, kilometers: 10 }, extra = {}) {
  return buildPaymentPlan({
    lines: [{ productId: 1, name: "Item", unitPrice, quantity }],
    settings: policySettings,
    distance,
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

test("an explicit higher partial COD rule still raises only that cart", () => {
  const decision = resolvePartialCodAdvance(20, [
    { target_type: "Product", target_id: 4, percentage: 40, eligible: 1, status: "Active" },
  ], { productIds: [4], categoryIds: [], collectionIds: [] });
  assert.equal(decision.percentage, 40);
  const untouched = resolvePartialCodAdvance(20, [
    { target_type: "Product", target_id: 4, percentage: 40, eligible: 0, status: "Active" },
  ], { productIds: [9], categoryIds: [], collectionIds: [] });
  assert.equal(untouched.percentage, 20);
  assert.equal(untouched.eligible, true);
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
    assert.equal(paymentBand(Number(price), policySettings), band);
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
    distance: { verified: true, kilometers: 39 },
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
  assert.equal(effectiveUnitPrice(2000, 1, 1100), 900);
  assert.equal(paymentBand(900, policySettings), "online-only");
  const merchandise = 7000;
  const coupon = 700;
  const allocated = allocateLineDiscount(5000, merchandise, coupon);
  const unit = effectiveUnitPrice(5000, 1, allocated);
  const result = planFor(unit);
  assert.equal(allocated, 500);
  assert.equal(unit, 4500);
  assert.equal(result.lines[0].band, "partial-cod");
  assert.equal(result.partialCod.amountOnline, 900);
  assert.equal(result.partialCod.amountCod, 3600);
});

test("COD and Porter follow verified road distance and fail closed", () => {
  assert.equal(planFor(2000, 1, { verified: true, kilometers: 39 }).fullCod.enabled, true);
  assert.equal(planFor(2000, 1, { verified: true, kilometers: 40 }).fullCod.enabled, true);
  assert.equal(planFor(2000, 1, { verified: true, kilometers: 41 }).fullCod.enabled, false);
  assert.equal(planFor(5000, 1, { verified: true, kilometers: 41 }).partialCod.enabled, false);
  assert.equal(planFor(2000, 1, { verified: false, kilometers: null }).fullCod.enabled, false);
  assert.equal(planFor(5000, 1, { verified: false, kilometers: null }).partialCod.enabled, false);
  assert.equal(planFor(2000, 1, { verified: true, kilometers: 40 }).porter.available, true);
  assert.equal(planFor(2000, 1, { verified: true, kilometers: 41 }).porter.available, false);
  assert.equal(planFor(2000, 1, { verified: false, kilometers: null }).porter.available, false);
  assert.equal(planFor(2000, 1, { verified: true, kilometers: 10 }, { deliveryMethod: "Porter" }).fullCod.enabled, false);
  assert.equal(planFor(5000, 1, { verified: true, kilometers: 10 }, { deliveryMethod: "Porter" }).partialCod.enabled, false);
});

test("stored zero COD bounds do not treat the maximum as unlimited", () => {
  const result = buildPaymentPlan({
    lines: [{ unitPrice: 2000, quantity: 1 }],
    settings: { ...policySettings, cod_min_amount: 0, cod_max_amount: 0 },
    distance: { verified: true, kilometers: 10 },
    razorpayConfigured: true,
  });
  assert.equal(result.lines[0].band, "online-only");
  assert.equal(result.fullCod.enabled, false);
  assert.equal(result.fullOnline.enabled, true);
});

test("Porter cannot be booked before full payment and does not collect cash", () => {
  const unpaid = { payment_status: "Pending", total_amount: 5000, amount_paid: 1000, cod_due: 4000 };
  const paid = { payment_status: "Paid", total_amount: 5000, amount_paid: 5000, cod_due: 0 };
  assert.equal(porterDispatchAllowed(unpaid, "Booked").allowed, false);
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
    distance: { verified: true, kilometers: 10 },
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

test("road distance uses the routing response and fails closed without calling a customer distance", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("geocode")) {
      return { ok: true, json: async () => ({ features: [{ geometry: { coordinates: [77.2, 28.5] } }] }) };
    }
    return { ok: true, json: async () => ({ features: [{ properties: { summary: { distance: 39000 } } }] }) };
  };
  const result = await measureRoadDistance({ address: "Sector 14, Gurugram", apiKey: "test-key", fetchImpl });
  assert.equal(result.verified, true);
  assert.equal(result.kilometers, 39);
  const missing = await measureRoadDistance({ address: "Sector 14, Gurugram", apiKey: "", fetchImpl });
  assert.equal(missing.verified, false);
  const failed = await measureRoadDistance({
    address: "Sector 14, Gurugram",
    apiKey: "test-key",
    fetchImpl: async () => {
      throw new Error("routing unavailable");
    },
  });
  assert.equal(failed.verified, false);
});
