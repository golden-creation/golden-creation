import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PARTIAL_ADVANCE_PERCENT,
  evaluateFullCod,
  porterAvailability,
  restrictPorterPayments,
  resolvePartialCodAdvance,
  splitPartialAdvance,
  storedOrderAmounts,
} from "../services/payment-policy.js";

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

test("full online and full COD use the payable total without an advance", () => {
  const online = { amountOnline: 1250, amountCod: 0 };
  const cod = evaluateFullCod({ enabled: true, total: 1250 });
  assert.deepEqual(online, { amountOnline: 1250, amountCod: 0 });
  assert.equal(cod.enabled, true);
  assert.equal(cod.amountOnline, 0);
  assert.equal(cod.amountCod, 1250);
});

test("full COD respects the configured amount range and PIN list", () => {
  assert.equal(evaluateFullCod({ enabled: true, total: 100, minAmount: 200 }).enabled, false);
  assert.equal(evaluateFullCod({ enabled: true, total: 5000, maxAmount: 3000 }).enabled, false);
  assert.equal(evaluateFullCod({ enabled: true, total: 500, minAmount: 200, maxAmount: 3000 }).enabled, true);
  assert.equal(
    evaluateFullCod({ enabled: true, total: 500, restricted: true, pins: "122001, 122011", pin: "122002" }).enabled,
    false
  );
  assert.equal(
    evaluateFullCod({ enabled: true, total: 500, restricted: true, pins: "122001", pin: "122001" }).enabled,
    true
  );
  assert.equal(evaluateFullCod({ enabled: true, total: 500, restricted: false, pin: "560001" }).enabled, true);
});

test("Porter delivery is manual, free of a second shipping charge, and cannot collect COD", () => {
  const nearby = porterAvailability({ enabled: true, pin: "122011", pins: "122011,122002" });
  assert.equal(nearby.available, true);
  assert.equal(nearby.shippingFee, 0);
  assert.match(nearby.label, /Porter/);
  assert.equal(porterAvailability({ enabled: true, pin: "110001", pins: "122011" }).available, false);

  const options = restrictPorterPayments(
    {
      fullCod: { enabled: true, amountCod: 800 },
      partialCod: { enabled: true, amountOnline: 200, amountCod: 800 },
      fullOnline: { enabled: true, amountOnline: 1000, amountCod: 0 },
    },
    { deliveryMethod: "Porter", porterCollectsCod: false }
  );
  assert.equal(options.fullCod.enabled, false);
  assert.equal(options.partialCod.enabled, false);
  assert.equal(options.fullOnline.enabled, true);
  assert.equal(options.fullOnline.amountOnline, 1000);
});
