import test, { after } from "node:test";
import assert from "node:assert/strict";
import db from "../config/db.js";
import {
  checkoutPayloadHash,
  decideCheckoutAttempt,
  normalizeIdempotencyKey,
} from "../services/checkout-attempt.js";
import { locationMatches } from "../services/commerce.service.js";

after(() => new Promise((resolve) => db.end(() => resolve())));

const websiteKey = "website-checkout-key-0001";

test("a legacy Android request without a client key is rejected", () => {
  const juneCheckoutBody = {
    customer: { paymentMethod: "UPI", zipCode: "" },
    items: [{ productId: 1, quantity: 1 }],
  };

  assert.equal(juneCheckoutBody.idempotencyKey, undefined);
  assert.throws(
    () => normalizeIdempotencyKey(juneCheckoutBody.idempotencyKey),
    /stable checkout key/
  );
  assert.throws(() => normalizeIdempotencyKey(""), /stable checkout key/);
});

test("a modern website key deduplicates instead of starting another order", () => {
  const payload = {
    userId: 4,
    paymentMode: "Full COD",
    customer: { phoneNumber: "9999999999", zipCode: "122001" },
    items: [{ productId: 9, quantity: 1 }],
  };
  const hash = checkoutPayloadHash(payload);

  assert.equal(normalizeIdempotencyKey(websiteKey), websiteKey);
  assert.deepEqual(
    decideCheckoutAttempt(
      { payload_hash: hash, status: "completed", order_id: 42, response_json: "{}" },
      hash
    ),
    { action: "stored", attempt: { payload_hash: hash, status: "completed", order_id: 42, response_json: "{}" } }
  );
  assert.equal(
    decideCheckoutAttempt({ payload_hash: "different", status: "completed" }, hash).action,
    "reject"
  );
});

test("an empty PIN matches only an All India shipping location", () => {
  const address = { state: "", zipCode: "" };

  assert.equal(locationMatches({ location_type: "All India", location_value: "" }, address), true);
  assert.equal(locationMatches({ location_type: "Pincode", location_value: "122001" }, address), false);
  assert.equal(locationMatches({ location_type: "Pincode", location_value: "" }, address), true);
  assert.equal(locationMatches({ location_type: "State", location_value: "Haryana" }, address), false);
});
