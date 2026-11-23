import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptLatestQuote,
  categoryGstTotal,
  composeCheckoutTotal,
  paymentAmountConsistent,
  razorpayAmountPaise,
  sellingLineTotal,
} from "../services/checkout-totals.js";
import { calculateDiscountAmount, evaluateDiscount } from "../services/discount.service.js";
import { selectShippingRuleCandidate } from "../services/commerce.service.js";
import { sellingPriceFromMrp } from "../../frontend/src/lib/productOffer.js";
import db from "../config/db.js";

test.after(async () => {
  await new Promise((resolve) => db.end(() => resolve()));
});

const cart = (extra = {}) => ({
  subtotal: 800,
  shippingFee: 80,
  taxAmount: 0,
  items: [{ productId: 1, categoryId: 4, brand: "Golden", quantity: 1, price: 800, lineTotal: 800 }],
  ...extra,
});

test("MRP discount stays on the selling price and is not applied twice", () => {
  assert.equal(sellingPriceFromMrp(1000, 20), 800);
  assert.equal(sellingLineTotal({ price: 800, quantity: 2 }), 1600);
  const priced = composeCheckoutTotal({ subtotal: 800, shippingFee: 50, taxAmount: 0 });
  assert.equal(priced.totalAmount, 850);
});

test("percentage, fixed, capped, and category coupons use the selling subtotal", async () => {
  const percent = calculateDiscountAmount({ discount_type: "percentage", value: 10, applies_to: { scope: "all" } }, cart());
  assert.equal(percent, 80);
  const fixed = calculateDiscountAmount({ discount_type: "fixed", value: 50, applies_to: { scope: "all" } }, cart());
  assert.equal(fixed, 50);
  const capped = calculateDiscountAmount({ discount_type: "percentage", value: 50, max_discount_amount: 100, applies_to: { scope: "all" } }, cart());
  assert.equal(capped, 100);
  const wrongCategory = await evaluateDiscount(
    { discount_type: "percentage", value: 10, status: "Active", applies_to: { scope: "categories", categoryIds: [9] } },
    cart()
  );
  assert.equal(wrongCategory.valid, false);
});

test("product discount plus coupon and free shipping stay separate", () => {
  const coupon = calculateDiscountAmount({ discount_type: "percentage", value: 10, applies_to: { scope: "all" } }, cart());
  const priced = composeCheckoutTotal({
    subtotal: 800,
    productDiscountAmount: coupon,
    shippingFee: 80,
    taxAmount: 40,
  });
  assert.equal(priced.discountedSubtotal, 720);
  assert.equal(priced.totalAmount, 840);

  const freeShipping = calculateDiscountAmount({ discount_type: "free_shipping", value: 0, min_order_value: 500, applies_to: { scope: "all" } }, cart());
  const shipped = composeCheckoutTotal({
    subtotal: 800,
    shippingFee: 80,
    shippingDiscountAmount: freeShipping,
    taxAmount: 0,
  });
  assert.equal(freeShipping, 80);
  assert.equal(shipped.shippingFee, 0);
  assert.equal(shipped.totalAmount, 800);
});

test("GST uses category rates and inclusive prices add no extra tax", () => {
  const exclusive = categoryGstTotal(
    [{ taxComponents: [{ categoryId: 4, amount: 800, gstInclusive: false }] }],
    new Map([[4, 18]]),
    800,
    800
  );
  assert.equal(exclusive.total, 144);
  assert.equal(exclusive.items[0].gstRate, 18);
  assert.equal(exclusive.items[0].gstAmount, 144);
  const inclusive = categoryGstTotal(
    [{ taxComponents: [{ categoryId: 4, amount: 800, gstInclusive: true }] }],
    new Map([[4, 18]]),
    800,
    800
  );
  assert.equal(inclusive.total, 0);
  assert.equal(inclusive.items[0].gstRate, 18);
  assert.equal(inclusive.items[0].gstAmount, 122.03);
  const payable = composeCheckoutTotal({ subtotal: 800, taxAmount: inclusive.total });
  assert.equal(payable.totalAmount, 800);
});

test("shipping follows the address and quantity or variant changes the merchandise total", () => {
  const rules = [{ id: 1, priority: 1, min_order_value: 0, charge: 40 }, { id: 2, priority: 2, min_order_value: 0, charge: 90 }];
  const delhi = selectShippingRuleCandidate({
    rules,
    targetMap: new Map(),
    locationMap: new Map([[2, [{ location_type: "state", location_value: "Delhi" }]], [1, [{ location_type: "All India", location_value: "" }]]]),
    categoryMap: new Map(),
    items: [],
    address: { state: "Delhi" },
  });
  const mumbai = selectShippingRuleCandidate({
    rules,
    targetMap: new Map(),
    locationMap: new Map([[2, [{ location_type: "state", location_value: "Delhi" }]], [1, [{ location_type: "All India", location_value: "" }]]]),
    categoryMap: new Map(),
    items: [],
    address: { state: "Maharashtra" },
  });
  assert.equal(Number(delhi.charge), 90);
  assert.equal(Number(mumbai.charge), 40);
  assert.equal(sellingLineTotal({ price: 800, quantity: 3 }), 2400);
  assert.equal(sellingLineTotal({ price: 450, quantity: 1 }), 450);
});

test("invalid and expired coupons are rejected before a total is reduced", async () => {
  const invalid = await evaluateDiscount({ discount_type: "percentage", value: 10, status: "Inactive", applies_to: { scope: "all" } }, cart());
  assert.equal(invalid.valid, false);
  const expired = await evaluateDiscount(
    { discount_type: "percentage", value: 10, status: "Active", ends_at: "2000-01-01", applies_to: { scope: "all" } },
    cart()
  );
  assert.match(expired.reason, /expired/);
  const belowMinimum = await evaluateDiscount(
    { discount_type: "fixed", value: 20, status: "Active", min_order_value: 1000, applies_to: { scope: "all" } },
    cart()
  );
  assert.match(belowMinimum.reason, /Minimum order/);
});

test("a stale quote is dropped and the gateway amount matches the quoted total", () => {
  assert.equal(acceptLatestQuote(1, 2, { totalAmount: 10 }), null);
  const current = acceptLatestQuote(2, 2, { totalAmount: 840 });
  assert.equal(current.totalAmount, 840);
  assert.equal(razorpayAmountPaise(840), 84000);
  assert.equal(paymentAmountConsistent(840, 840), true);
  assert.equal(paymentAmountConsistent(840, 10), false);
});
