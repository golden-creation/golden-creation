import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCancellationWrites,
  planOrderCancellation,
  runCancellationTransaction,
  statusTransitionAllowed,
  websiteRestorationLines,
} from "../services/order-cancellation.js";

const item = { product_id: 7, variant_id: null, quantity: 2, item_type: "Product" };
const variantItem = { product_id: 7, variant_id: 15, quantity: 3, item_type: "Product" };

function order(overrides) {
  return {
    id: 40,
    order_status: "Processing",
    payment_status: "COD Due",
    payment_method: "Full COD",
    amount_paid: 0,
    quote_snapshot: "{\"ok\":true}",
    stock_restored_at: null,
    physical_stock_deducted_at: null,
    fulfillment_stock_source: null,
    ...overrides,
  };
}

function recordingQuery(selectRows = [{ stock_on_hand: 5, reorder_level: 1 }]) {
  const calls = [];
  const query = async (sql, values) => {
    calls.push({ sql, values });
    if (sql.startsWith("SELECT")) return selectRows;
    if (sql.startsWith("UPDATE orders")) return { affectedRows: 1 };
    return { affectedRows: 1 };
  };
  return { calls, query };
}

test("pending and processing orders plan website restoration", () => {
  for (const status of ["Pending", "Processing"]) {
    const plan = planOrderCancellation(order({ order_status: status, payment_status: status === "Pending" ? "Pending" : "COD Due" }), {
      items: [item],
      reason: "Customer changed their mind",
    });
    assert.equal(plan.ok, true);
    assert.equal(plan.restoreWebsite, true);
    assert.deepEqual(plan.websiteLines, [{ productId: 7, variantId: null, quantity: 2 }]);
    assert.equal(plan.physical, null);
  }
});

test("website stock is not restored twice or when it was never deducted", () => {
  const restored = planOrderCancellation(order({ stock_restored_at: "2026-01-01" }), {
    items: [item],
    reason: "Again",
  });
  assert.equal(restored.restoreWebsite, false);
  assert.deepEqual(restored.websiteLines, []);

  const adminOrder = planOrderCancellation(order({ quote_snapshot: null, razorpay_order_id: null, payment_method: "Cash on Delivery" }), {
    items: [item],
    reason: "Admin order",
  });
  assert.equal(adminOrder.restoreWebsite, false);
});

test("variant quantities restore the variant bucket only", () => {
  const lines = websiteRestorationLines([variantItem]);
  assert.deepEqual(lines, [{ productId: 7, variantId: 15, quantity: 3 }]);
  const plan = planOrderCancellation(order(), { items: [variantItem], reason: "Wrong item" });
  assert.equal(plan.websiteLines[0].variantId, 15);
  assert.equal(plan.websiteLines[0].quantity, 3);
});

test("bundle website lines do not include the parent product", () => {
  const lines = websiteRestorationLines([{
    product_id: 1,
    quantity: 2,
    item_type: "Bundle",
    bundle_items: JSON.stringify([{ product_id: 8, quantity: 1 }, { product_id: 9, variant_id: 4, quantity: 2 }]),
  }]);
  assert.deepEqual(lines, [
    { productId: 8, variantId: null, quantity: 2 },
    { productId: 9, variantId: 4, quantity: 4 },
  ]);
});

test("blank quantity is not invented", () => {
  const lines = websiteRestorationLines([{ product_id: 7, quantity: 0, item_type: "Product" }]);
  assert.deepEqual(lines, []);
});

test("delivered and repeated cancellation are rejected", () => {
  const delivered = planOrderCancellation(order({ order_status: "Delivered" }), { items: [item], reason: "Too late" });
  assert.equal(delivered.ok, false);
  assert.equal(delivered.statusCode, 409);

  const repeated = planOrderCancellation(order({ order_status: "Cancelled" }), { items: [item], reason: "Again" });
  assert.equal(repeated.ok, false);
  assert.match(repeated.message, /already cancelled/);
  assert.equal(statusTransitionAllowed("Cancelled", "Processing"), false);
  assert.equal(statusTransitionAllowed("Delivered", "Cancelled"), false);
});

test("dispatched order is unchanged without an explicit resolution", () => {
  const plan = planOrderCancellation(order({
    order_status: "Dispatched",
    physical_stock_deducted_at: "2026-01-01",
    fulfillment_stock_source: "warehouse",
  }), { items: [item], reason: "Stop the courier" });
  assert.equal(plan.ok, false);
  assert.match(plan.message, /Physical stock was not restored/);
});

test("warehouse and shop stock restore only the deducted bucket", () => {
  const warehouse = planOrderCancellation(order({
    order_status: "Dispatched",
    physical_stock_deducted_at: "2026-01-01",
    fulfillment_stock_source: "warehouse",
  }), { items: [item], reason: "Courier intercepted", resolution: "carrier_intercepted" });
  assert.equal(warehouse.physical.bucket, "warehouse");
  assert.deepEqual(warehouse.physical.lines, [{ productId: 7, quantity: 2 }]);

  const shop = planOrderCancellation(order({
    order_status: "In Transit",
    physical_stock_deducted_at: "2026-01-01",
    fulfillment_stock_source: "shop",
  }), { items: [variantItem], reason: "Returned", resolution: "return_received" });
  assert.equal(shop.physical.bucket, "shop");
  assert.equal(shop.physical.lines[0].productId, 7);
  assert.equal(shop.physical.lines.some((line) => line.bucket === "warehouse"), false);
});

test("physical restoration is skipped when it was already recorded", () => {
  const plan = planOrderCancellation(order({
    order_status: "Processing",
    physical_stock_deducted_at: "2026-01-01",
    fulfillment_stock_source: "shop",
  }), { items: [item], reason: "Retry", physicalAlreadyRestored: true });
  assert.equal(plan.physical, null);
  assert.match(plan.warnings[0], /already restored/);
});

test("paid order stays paid and is not marked refunded", async () => {
  const plan = planOrderCancellation(order({
    payment_status: "Paid",
    amount_paid: 500,
    razorpay_order_id: "order_test",
  }), { items: [item], reason: "Paid cancellation" });
  assert.equal(plan.refund.required, true);
  assert.equal(plan.refund.status, "pending_provider_confirmation");
  assert.equal(plan.refund.paymentStatus, "Paid");
  const { calls, query } = recordingQuery();
  await applyCancellationWrites(query, plan, "admin@example.com");
  const statusUpdate = calls.find((call) => call.sql.includes("UPDATE orders"));
  assert.equal(statusUpdate.values[0], "Paid");
  assert.equal(calls.some((call) => /refund/i.test(call.sql)), false);
});

test("writes restore website stock and record one cancellation", async () => {
  const plan = planOrderCancellation(order(), { items: [variantItem], reason: "Customer request" });
  const { calls, query } = recordingQuery();
  await applyCancellationWrites(query, plan);
  assert.equal(calls.filter((call) => call.sql.includes("product_variants")).length, 1);
  assert.equal(calls.some((call) => call.sql.includes("stock_quantity")), false);
  assert.equal(calls.filter((call) => call.sql.includes("order_status_history")).length, 1);
  assert.equal(calls.find((call) => call.sql.includes("UPDATE orders")).values[1], 1);
});

test("warehouse write uses the warehouse bucket and an audit row", async () => {
  const plan = planOrderCancellation(order({
    order_status: "Dispatched",
    physical_stock_deducted_at: "2026-01-01",
    fulfillment_stock_source: "warehouse",
  }), { items: [item], reason: "Intercepted", resolution: "carrier_intercepted" });
  const { calls, query } = recordingQuery();
  await applyCancellationWrites(query, plan);
  const update = calls.find((call) => call.sql.includes("product_stock_counts SET"));
  assert.deepEqual(update.values, [7, 7, "warehouse"]);
  const audit = calls.find((call) => call.sql.includes("product_stock_audit_logs"));
  assert.equal(audit.values[1], "warehouse");
  assert.equal(audit.values[6], 2);
});

test("shop write uses the shop bucket", async () => {
  const plan = planOrderCancellation(order({
    order_status: "Processing",
    physical_stock_deducted_at: "2026-01-01",
    fulfillment_stock_source: "shop",
  }), { items: [item], reason: "Before dispatch" });
  const { calls, query } = recordingQuery([{ stock_on_hand: 1, reorder_level: 0 }]);
  await applyCancellationWrites(query, plan);
  const update = calls.find((call) => call.sql.includes("product_stock_counts SET"));
  assert.equal(update.values[2], "shop");
  assert.equal(update.values[0], 3);
});

test("a failed write rolls back and does not commit", async () => {
  let committed = false;
  let rolledBack = false;
  await assert.rejects(() => runCancellationTransaction({
    begin() {},
    query() {
      throw new Error("stock write failed");
    },
    commit() {
      committed = true;
    },
    rollback() {
      rolledBack = true;
    },
    order: order(),
    items: [item],
    reason: "Failure",
  }));
  assert.equal(committed, false);
  assert.equal(rolledBack, true);
});

test("rejected cancellation rolls back without writes", async () => {
  let writes = 0;
  const result = await runCancellationTransaction({
    begin() {},
    query() {
      writes += 1;
    },
    commit() {
      throw new Error("rejected plan committed");
    },
    rollback() {},
    order: order({ order_status: "Delivered" }),
    items: [item],
    reason: "No",
  });
  assert.equal(result.ok, false);
  assert.equal(writes, 0);
});
