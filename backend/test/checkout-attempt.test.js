import test from "node:test";
import assert from "node:assert/strict";
import {
  beginCheckoutAttempt,
  claimCheckoutQuote,
  checkoutPayloadHash,
  decideCheckoutAttempt,
  normalizeIdempotencyKey,
  recordCommitUncertainty,
} from "../services/checkout-attempt.js";

const key = "checkout-key-123456";
const hash = checkoutPayloadHash({
  userId: 4,
  paymentMode: "Full COD",
  items: [{ productId: 9, quantity: 1 }],
  customer: { phoneNumber: "9999999999", zipCode: "122001" },
});

test("checkout keys and payload hashes are stable", () => {
  assert.equal(normalizeIdempotencyKey(key), key);
  assert.throws(() => normalizeIdempotencyKey("short"), /stable checkout key/);
  const again = checkoutPayloadHash({
    paymentMode: "Full COD",
    userId: 4,
    customer: { zipCode: "122001", phone: "9999999999" },
    items: [{ id: 9, quantity: "1" }],
  });
  assert.equal(again, hash);
  const changed = checkoutPayloadHash({
    paymentMode: "Full COD",
    userId: 4,
    customer: { phoneNumber: "9999999999", zipCode: "122001" },
    items: [{ productId: 9, quantity: 2 }],
  });
  assert.notEqual(changed, hash);
});

test("the same key with a different payload is rejected", () => {
  const decision = decideCheckoutAttempt({ payload_hash: "other", status: "completed" }, hash);
  assert.equal(decision.action, "reject");
  assert.equal(decision.statusCode, 409);
});

test("a completed key is replayed and a busy key is not duplicated", () => {
  assert.equal(decideCheckoutAttempt({
    payload_hash: hash,
    status: "completed",
    response_json: "{}",
  }, hash).action, "stored");
  assert.equal(decideCheckoutAttempt({
    payload_hash: hash,
    status: "processing",
    updated_at: new Date().toISOString(),
  }, hash).action, "busy");
});

test("a quote failure marks the attempt retryable and the same key resumes", async () => {
  let status = "processing";
  const query = async (sql, values = []) => {
    if (sql.startsWith("INSERT")) {
      const error = new Error("duplicate");
      error.code = "ER_DUP_ENTRY";
      throw error;
    }
    if (sql.startsWith("UPDATE") && values[0] === "retryable") {
      status = "retryable";
      return { affectedRows: 1 };
    }
    if (sql.includes("FROM checkout_attempts")) {
      return [{ id: 4, payload_hash: hash, status, response_json: null, updated_at: new Date().toISOString() }];
    }
    if (sql.includes("SET status = 'processing'")) {
      assert.equal(status, "retryable");
      status = "processing";
      return { affectedRows: 1 };
    }
    return { affectedRows: 1 };
  };

  await assert.rejects(
    () => claimCheckoutQuote({
      query,
      attemptId: 4,
      buildQuote: async () => {
        throw new Error("quote failed");
      },
    }),
    /quote failed/
  );
  assert.equal(status, "retryable");
  const resumed = await beginCheckoutAttempt(query, { key, payloadHash: hash });
  assert.equal(resumed.mode, "execute");
  assert.equal(resumed.attemptId, 4);
  assert.equal(decideCheckoutAttempt({
    payload_hash: hash,
    status: "processing",
    updated_at: new Date().toISOString(),
  }, hash).action, "busy");
});

test("an ambiguous attempt is reconciled instead of started again", () => {
  assert.equal(decideCheckoutAttempt({ payload_hash: hash, status: "ambiguous" }, hash).action, "reconcile");
});

test("begin stores one attempt and a duplicate does not insert again", async () => {
  const calls = [];
  const query = async (sql) => {
    calls.push(sql);
    if (sql.startsWith("INSERT")) {
      const error = new Error("duplicate");
      error.code = "ER_DUP_ENTRY";
      throw error;
    }
    if (sql.includes("FROM checkout_attempts")) {
      return [{ id: 7, payload_hash: hash, status: "completed", response_json: JSON.stringify({ order: { id: "GC-1" } }) }];
    }
    throw new Error(sql);
  };
  const result = await beginCheckoutAttempt(query, { key, payloadHash: hash });
  assert.equal(result.mode, "stored");
  assert.equal(result.response.order.id, "GC-1");
  assert.equal(calls.filter((sql) => sql.startsWith("INSERT")).length, 1);
});

test("uncertain commit with a saved order does not restore stock", async () => {
  const updates = [];
  const query = async (sql) => {
    updates.push(sql);
    if (sql.includes("FROM orders")) return [{ id: 11, order_number: "GC-11" }];
    return { affectedRows: 1 };
  };
  const outcome = await recordCommitUncertainty(query, 3, new Error("lost packet"));
  assert.equal(outcome.committed, true);
  assert.equal(outcome.order.id, 11);
  assert.equal(updates.some((sql) => sql.includes("stock")), false);
});

test("uncertain commit without an order stays retryable and does not restore stock", async () => {
  const updates = [];
  const query = async (sql, values) => {
    updates.push([sql, values]);
    if (sql.includes("FROM orders")) return [];
    return { affectedRows: 1 };
  };
  const outcome = await recordCommitUncertainty(query, 3, new Error("lost packet"));
  assert.equal(outcome.committed, false);
  assert.equal(outcome.error.statusCode, 503);
  assert.match(updates.at(-1)[0], /retryable/);
  assert.equal(updates.some(([sql]) => sql.includes("stock")), false);
});

test("a failed reconciliation stays ambiguous", async () => {
  const statuses = [];
  const query = async (sql, values) => {
    if (sql.includes("FROM orders")) throw new Error("lookup down");
    statuses.push(values[0]);
    return { affectedRows: 1 };
  };
  const outcome = await recordCommitUncertainty(query, 3, new Error("lost packet"));
  assert.equal(outcome.committed, false);
  assert.equal(statuses[0].startsWith("lost packet"), true);
  assert.match(outcome.error.message, /not restored/);
});
