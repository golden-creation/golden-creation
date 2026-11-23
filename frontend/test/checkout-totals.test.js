import test from "node:test";
import assert from "node:assert/strict";
import { acceptLatestQuote, presentCheckoutAmounts } from "../src/lib/checkoutTotals.js";

test("missing or failed quotes never display zero shipping", () => {
  const waiting = presentCheckoutAmounts(null, { loading: true });
  assert.equal(waiting.shippingAmount, null);
  assert.equal(waiting.shippingLabel, "Calculating...");
  const failed = presentCheckoutAmounts(null, { error: "Unable to calculate delivery" });
  assert.equal(failed.ready, false);
  assert.equal(failed.shippingAmount, null);
  assert.equal(failed.totalAmount, null);
  assert.equal(failed.unavailable, true);
});

test("a confirmed quote can show zero shipping and a stale response is ignored", () => {
  const ready = presentCheckoutAmounts({ subtotal: 800, discountAmount: 80, shippingFee: 0, taxAmount: 144, totalAmount: 864 });
  assert.equal(ready.shippingConfirmed, true);
  assert.equal(ready.shippingAmount, 0);
  assert.equal(ready.taxAmount, 144);
  assert.equal(ready.totalAmount, 864);
  assert.equal(acceptLatestQuote(1, 2, { totalAmount: 1 }), null);
  assert.equal(acceptLatestQuote(2, 2, { totalAmount: 864 }).totalAmount, 864);
});
