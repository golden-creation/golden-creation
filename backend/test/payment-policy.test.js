import test from "node:test";
import assert from "node:assert/strict";
import { razorpayAmountPaise } from "../services/checkout-totals.js";
import { ALLOWED_CHANGE_FIELDS } from "../services/admin-audit.js";
import {
  DRIVING_DIRECTIONS_URL,
  GEOCODE_SEARCH_URL,
  clearRoadDistanceCache,
  configuredShopLocation,
  measureRoadDistance,
  roadDistanceCacheSnapshot,
  selectDeliveryCoordinate,
} from "../services/road-distance.js";
import { DEFAULT_NCR_PINS, pinIsEligible, sanitizeEligiblePinText } from "../services/ncr-pins.js";
import {
  APPROVED_ADVANCE_PERCENT,
  DEFAULT_PARTIAL_ADVANCE_PERCENT,
  acceptedRoadMeters,
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
  eligibility_mode: "road",
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
    "eligibility_mode",
    "eligible_pins",
  ]) {
    assert.equal(ALLOWED_CHANGE_FIELDS.has(field), true);
  }
});

function locatedFeature(longitude, latitude, confidence = 0.92, extra = {}) {
  return {
    geometry: { coordinates: [longitude, latitude] },
    properties: {
      layer: "address",
      confidence,
      match_type: "exact",
      postalcode: "122001",
      street: "Sector 14",
      ...extra,
    },
  };
}

const preciseAddress = "House 12, Sector 14, Gurugram, Haryana 122001";
const preciseSelection = { pin: "122001", street: "House 12, Sector 14" };

test("road distance keeps raw metres, hides the API key, and fails closed", async () => {
  clearRoadDistanceCache();
  const seen = [];
  const fetchImpl = async (url, options = {}) => {
    seen.push({ url, authorization: options.headers?.Authorization || "" });
    if (String(url).startsWith(GEOCODE_SEARCH_URL)) {
      return { ok: true, json: async () => ({ features: [locatedFeature(77.2, 28.5)] }) };
    }
    return { ok: true, json: async () => ({ features: [{ properties: { summary: { distance: 40000 } } }] }) };
  };
  const result = await measureRoadDistance({ address: preciseAddress, apiKey: "secret-routing-key", fetchImpl });
  assert.equal(result.verified, true);
  assert.equal(result.meters, 40000);
  assert.equal(result.withinLimit, true);
  assert.equal(result.kilometers, 40);
  assert.equal(seen.every((call) => !String(call.url).includes("secret-routing-key")), true);
  assert.equal(seen.every((call) => call.authorization === "secret-routing-key"), true);
  assert.equal(seen[0].url.startsWith(`${GEOCODE_SEARCH_URL}?`), true);
  assert.equal(seen[1].url, DRIVING_DIRECTIONS_URL);
  assert.equal(seen.some((call) => String(call.url).includes("openrouteservice.org")), false);
  const shop = configuredShopLocation({
    GOLDEN_CREATION_SHOP_LATITUDE: "28.43000",
    GOLDEN_CREATION_SHOP_LONGITUDE: "not-a-coordinate",
  });
  assert.equal(shop.latitude, 28.43);
  assert.equal(shop.longitude, 77.10345);
  assert.equal(selectDeliveryCoordinate([locatedFeature(77.2, 28.5, 0.4)], preciseSelection), null);
  assert.equal(selectDeliveryCoordinate([
    locatedFeature(77.1, 28.4, 0.9),
    locatedFeature(77.4, 28.7, 0.88),
  ], preciseSelection), null);
  const missing = await measureRoadDistance({ address: preciseAddress, apiKey: "", fetchImpl });
  assert.equal(missing.verified, false);
  assert.equal(missing.meters, null);
  clearRoadDistanceCache();
  const failed = await measureRoadDistance({
    address: preciseAddress,
    apiKey: "secret-routing-key",
    fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
  });
  assert.equal(failed.verified, false);
  assert.equal(failed.meters, null);
  clearRoadDistanceCache();
  const timedOut = await measureRoadDistance({
    address: preciseAddress,
    apiKey: "secret-routing-key",
    timeoutMs: 20,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")));
    }),
  });
  assert.equal(timedOut.verified, false);
  assert.equal(timedOut.meters, null);
});

test("missing, empty, negative, and non-numeric distances never become zero", () => {
  for (const meters of [null, undefined, "", " ", "abc", -1, Number.NaN, Number.POSITIVE_INFINITY, false]) {
    assert.equal(acceptedRoadMeters(meters), null);
    const plan = buildPaymentPlan({
      lines: [{ unitPrice: 2000, quantity: 1, lineTotal: 2000 }],
      settings: policySettings,
      distance: { verified: true, meters },
      razorpayConfigured: true,
    });
    assert.equal(plan.distance.verified, false);
    assert.equal(plan.distance.meters, null);
    assert.equal(plan.fullCod.enabled, false);
    assert.equal(plan.partialCod.enabled, false);
    assert.equal(plan.porter.available, false);
    assert.equal(plan.fullOnline.enabled, true);
    assert.equal(plan.fullOnline.amountOnline, 2000);
  }
});

test("ambiguous addresses, locality matches, and slow response bodies fail closed", async () => {
  clearRoadDistanceCache();
  const locality = await measureRoadDistance({
    address: preciseAddress,
    apiKey: "secret-routing-key",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ features: [locatedFeature(77.2, 28.5, 0.95, { layer: "locality" })] }),
    }),
  });
  assert.equal(locality.verified, false);
  assert.equal(locality.meters, null);
  clearRoadDistanceCache();
  const coarseStreet = await measureRoadDistance({
    address: preciseAddress,
    apiKey: "secret-routing-key",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ features: [locatedFeature(77.2, 28.5, 0.95, { layer: "street" })] }),
    }),
  });
  assert.equal(coarseStreet.verified, false);
  clearRoadDistanceCache();
  const wrongPin = await measureRoadDistance({
    address: preciseAddress,
    apiKey: "secret-routing-key",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ features: [locatedFeature(77.2, 28.5, 0.95, { postalcode: "110001" })] }),
    }),
  });
  assert.equal(wrongPin.verified, false);
  clearRoadDistanceCache();
  const imprecise = await measureRoadDistance({
    address: "Gurugram 122001",
    apiKey: "secret-routing-key",
    fetchImpl: async () => {
      throw new Error("routing should not run for an imprecise address");
    },
  });
  assert.equal(imprecise.verified, false);
  assert.equal(imprecise.meters, null);
  clearRoadDistanceCache();
  const blankDistance = await measureRoadDistance({
    address: preciseAddress,
    apiKey: "secret-routing-key",
    fetchImpl: async (url) => {
      if (String(url).startsWith(GEOCODE_SEARCH_URL)) {
        return { ok: true, json: async () => ({ features: [locatedFeature(77.2, 28.5)] }) };
      }
      return { ok: true, json: async () => ({ features: [{ properties: { summary: { distance: null } } }] }) };
    },
  });
  assert.equal(blankDistance.verified, false);
  assert.equal(blankDistance.meters, null);
  clearRoadDistanceCache();
  const overLimit = await measureRoadDistance({
    address: preciseAddress,
    apiKey: "secret-routing-key",
    fetchImpl: async (url) => {
      if (String(url).startsWith(GEOCODE_SEARCH_URL)) {
        return { ok: true, json: async () => ({ features: [locatedFeature(77.2, 28.5)] }) };
      }
      return { ok: true, json: async () => ({ features: [{ properties: { summary: { distance: 40001 } } }] }) };
    },
  });
  assert.equal(overLimit.verified, true);
  assert.equal(overLimit.meters, 40001);
  assert.equal(overLimit.withinLimit, false);
  assert.equal(planFor(2000, 1, 40000).fullCod.enabled, true);
  assert.equal(planFor(2000, 1, 40001).fullCod.enabled, false);
  clearRoadDistanceCache();
  const slowBody = await measureRoadDistance({
    address: preciseAddress,
    apiKey: "secret-routing-key",
    timeoutMs: 30,
    fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }),
  });
  assert.equal(slowBody.verified, false);
  assert.equal(slowBody.meters, null);
});

test("identical routing requests are deduplicated without storing the address", async () => {
  clearRoadDistanceCache();
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    if (String(url).startsWith(GEOCODE_SEARCH_URL)) {
      return { ok: true, json: async () => ({ features: [locatedFeature(77.2, 28.5)] }) };
    }
    return { ok: true, json: async () => ({ features: [{ properties: { summary: { distance: 40000 } } }] }) };
  };
  const first = measureRoadDistance({ address: preciseAddress, apiKey: "secret-routing-key", fetchImpl });
  const second = measureRoadDistance({ address: preciseAddress, apiKey: "secret-routing-key", fetchImpl });
  const [left, right] = await Promise.all([first, second]);
  assert.equal(left.meters, 40000);
  assert.equal(right.meters, 40000);
  assert.equal(calls, 2);
  const repeated = await measureRoadDistance({ address: preciseAddress, apiKey: "secret-routing-key", fetchImpl });
  assert.equal(repeated.meters, 40000);
  assert.equal(calls, 2);
  const snapshot = roadDistanceCacheSnapshot();
  assert.equal(snapshot.length, 1);
  assert.match(snapshot[0].key, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(snapshot).includes("Sector"), false);
  assert.equal(JSON.stringify(snapshot).includes("secret-routing-key"), false);
  clearRoadDistanceCache();
});

test("Delhi-NCR PIN mode uses exact post-office codes and keeps full online available", () => {
  const pins = new Set(DEFAULT_NCR_PINS.map((entry) => entry.pin));
  assert.equal(pins.has("110001"), true);
  assert.equal(pins.has("122011"), true);
  assert.equal(pins.has("122051"), true);
  assert.equal(pins.has("121001"), true);
  assert.equal(pins.has("201301"), true);
  assert.equal(pins.has("201310"), true);
  assert.equal(pins.has("201001"), true);
  assert.equal(pins.has("400001"), false);
  assert.equal(pins.has("122"), false);
  assert.throws(() => sanitizeEligiblePinText("Gurugram\n122"), /exact 6-digit/);
  const pinSettings = { ...policySettings, eligibility_mode: "pin", porter_enabled: 1, eligible_pins: null };
  const prices = { 999: "online-only", 1000: "full-cod", 1600: "full-cod", 3000: "full-cod", 4000: "partial-cod" };
  for (const [price, band] of Object.entries(prices)) {
    const inside = buildPaymentPlan({
      lines: [{ unitPrice: Number(price), quantity: 1, lineTotal: Number(price) }],
      settings: pinSettings,
      distance: { verified: false, meters: null },
      pin: "122011",
      razorpayConfigured: true,
    });
    assert.equal(inside.lines[0].band, band);
    assert.equal(inside.fullOnline.enabled, true);
    assert.equal(inside.eligibility.mode, "pin");
    assert.equal(inside.fullCod.enabled, band === "full-cod");
    assert.equal(inside.partialCod.enabled, band === "partial-cod");
    if (band === "partial-cod") {
      assert.equal(inside.partialCod.amountOnline, 800);
      assert.equal(inside.partialCod.amountCod, 3200);
    }
    assert.equal(inside.porter.available, true);
  }
  const mixed = buildPaymentPlan({
    lines: [
      { unitPrice: 999, quantity: 1, lineTotal: 999 },
      { unitPrice: 1600, quantity: 1, lineTotal: 1600 },
      { unitPrice: 4000, quantity: 1, lineTotal: 4000 },
    ],
    settings: pinSettings,
    distance: { verified: false },
    pin: "110001",
    razorpayConfigured: true,
  });
  assert.deepEqual(mixed.lines.map((line) => [line.amountOnline, line.amountCod]), [
    [999, 0],
    [0, 1600],
    [800, 3200],
  ]);
  assert.equal(mixed.fullOnline.amountOnline, 6599);
  for (const pin of ["", "122", "12201", "Gurugram", "400001", "000000"]) {
    const outside = buildPaymentPlan({
      lines: [{ unitPrice: 1600, quantity: 1, lineTotal: 1600 }],
      settings: pinSettings,
      distance: { verified: true, meters: 1000 },
      pin,
      razorpayConfigured: true,
    });
    assert.equal(pinIsEligible(pin, pins), false);
    assert.equal(outside.fullCod.enabled, false);
    assert.equal(outside.partialCod.enabled, false);
    assert.equal(outside.porter.available, false);
    assert.equal(outside.fullOnline.enabled, true);
    assert.equal(outside.fullOnline.amountOnline, 1600);
  }
  const removed = buildPaymentPlan({
    lines: [{ unitPrice: 1600, quantity: 1, lineTotal: 1600 }],
    settings: { ...pinSettings, eligible_pins: "110001" },
    pin: "122011",
    razorpayConfigured: true,
  });
  assert.equal(removed.fullCod.enabled, false);
  assert.equal(removed.fullOnline.enabled, true);
});
