import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PARTIAL_ADVANCE_PERCENT,
  evaluateFullCod,
  porterAvailability,
  restrictPorterPayments,
  splitPartialAdvance,
  storedOrderAmounts,
} from "../services/payment-policy.js";

test("partial COD advance defaults to 20 percent and is calculated once", () => {
  assert.equal(DEFAULT_PARTIAL_ADVANCE_PERCENT, 20);
  assert.deepEqual(splitPartialAdvance(1000), { percentage: 20, amountOnline: 200, amountCod: 800 });
  assert.deepEqual(splitPartialAdvance(999.99, 20), { percentage: 20, amountOnline: 200, amountCod: 799.99 });
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
