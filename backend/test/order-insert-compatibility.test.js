import test from "node:test";
import assert from "node:assert/strict";
import db from "../config/db.js";
import { createOrderNumber, deductQuoteStock, insertQuotedOrder } from "../services/commerce.service.js";
import { paymentAmountConsistent, razorpayAmountPaise } from "../services/checkout-totals.js";
import { planOrderCancellation, runCancellationTransaction } from "../services/order-cancellation.js";

function quoteItem(productName) {
  return {
    productId: 10,
    variantId: null,
    variantSku: "",
    variantTitle: "",
    variantOptions: [],
    itemType: "Product",
    bundleName: null,
    bundleItems: [],
    productName,
    quantity: 1,
    price: 800,
    lineTotal: 800,
    gstInclusive: true,
    gstRate: 0,
    gstAmount: 0,
  };
}

function quote() {
  return {
    items: [quoteItem("Fountain Pen")],
    subtotal: 800,
    shippingFee: 40,
    taxAmount: 0,
    discountId: null,
    discountCode: null,
    discountAmount: 0,
    totalAmount: 840,
    paymentOptions: {
      lines: [{ lineTotal: 800, amountOnline: 800, amountCod: 0 }],
      fullOnline: { enabled: true, amountOnline: 840, amountCod: 0 },
      fullCod: { enabled: false, amountCod: 0 },
      partialCod: { enabled: false, amountOnline: 840, amountCod: 0 },
    },
  };
}

test("checkout order numbers are generated and fit varchar(40)", () => {
  for (let index = 0; index < 20; index += 1) {
    const orderNumber = createOrderNumber();
    assert.match(orderNumber, /^GC-\d{11}$/);
    assert.ok(orderNumber.length <= 40);
  }
});

test("order items use the new order id and the catalog product name", async () => {
  const calls = [];
  const connection = {
    query(sql, values, callback) {
      calls.push({ sql, values });
      callback(null, sql.includes("INSERT INTO orders") ? { insertId: 42 } : { affectedRows: 1 });
    },
  };
  const created = await insertQuotedOrder(connection, {
    payload: { customer: { name: "Test" } },
    quote: quote(),
    paymentMethod: "Full Online",
    paymentStatus: "Pending",
    orderStatus: "Processing",
    amountPaid: 0,
    codDue: 0,
  });
  assert.equal(created.orderId, 42);
  assert.match(created.orderNumber, /^GC-/);
  const item = calls.find((call) => call.sql.includes("INSERT INTO order_items"));
  assert.equal(item.values[0], 42);
  assert.equal(item.values[9], "Fountain Pen");
  assert.ok(item.values[9].length <= 255);
});

test("a missing product name is rejected before any insert", async () => {
  let queries = 0;
  const connection = {
    query(_sql, _values, callback) {
      queries += 1;
      callback(null, { insertId: 1, affectedRows: 1 });
    },
  };
  await assert.rejects(() => insertQuotedOrder(connection, {
    payload: {},
    quote: { ...quote(), items: [quoteItem(null)] },
    paymentMethod: "Full COD",
    paymentStatus: "COD Due",
    orderStatus: "Processing",
    amountPaid: 0,
    codDue: 840,
  }), /name is missing/);
  assert.equal(queries, 0);
});

test("a product name longer than varchar(255) is rejected instead of truncated", async () => {
  let queries = 0;
  const connection = {
    query(_sql, _values, callback) {
      queries += 1;
      callback(null, { insertId: 1, affectedRows: 1 });
    },
  };
  await assert.rejects(() => insertQuotedOrder(connection, {
    payload: {},
    quote: { ...quote(), items: [quoteItem("N".repeat(300))] },
    paymentMethod: "Full COD",
    paymentStatus: "COD Due",
    orderStatus: "Processing",
    amountPaid: 0,
    codDue: 840,
  }), /was not shortened/);
  assert.equal(queries, 0);
});

test("an order-item failure leaves rollback to the caller and does not commit", async () => {
  const state = { committed: false, rolledBack: false, orders: 0 };
  const connection = {
    query(sql, _values, callback) {
      if (sql.includes("INSERT INTO orders")) {
        state.orders += 1;
        callback(null, { insertId: 7 });
        return;
      }
      callback(new Error("order item insert failed"));
    },
    rollback(callback) {
      state.rolledBack = true;
      state.orders = 0;
      callback();
    },
  };
  await assert.rejects(() => insertQuotedOrder(connection, {
    payload: {},
    quote: quote(),
    paymentMethod: "Full Online",
    paymentStatus: "Pending",
    orderStatus: "Processing",
    amountPaid: 0,
    codDue: 0,
  }));
  assert.equal(state.committed, false);
  await new Promise((resolve) => connection.rollback(resolve));
  assert.equal(state.orders, 0);
  assert.equal(state.rolledBack, true);
});

test("stock deduction failure is thrown so the checkout transaction can roll back", async () => {
  const connection = {
    query(_sql, _values, callback) {
      callback(null, { affectedRows: 0 });
    },
  };
  await assert.rejects(
    () => deductQuoteStock(connection, [{ productName: "Pen", stockLines: [{ productId: 10, variantId: null, quantity: 1 }] }]),
    /enough stock/
  );
});

test("the Razorpay amount is the quoted online amount in paise", () => {
  assert.equal(razorpayAmountPaise(840), 84000);
  assert.equal(paymentAmountConsistent(840, 840), true);
  assert.equal(paymentAmountConsistent(840, 10), false);
});

test("cancellation restores stock once and rolls back when the write fails", async () => {
  const order = {
    id: 3,
    order_status: "Processing",
    payment_status: "COD Due",
    payment_method: "Full COD",
    amount_paid: 0,
    quote_snapshot: "{}",
  };
  const plan = planOrderCancellation(order, {
    items: [{ product_id: 10, quantity: 2, item_type: "Product" }],
    reason: "Customer changed their mind",
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.refund.paymentStatus, "COD Due");
  const calls = [];
  await assert.rejects(() => runCancellationTransaction({
    begin: async () => {},
    query: async (sql) => {
      calls.push(sql);
      if (sql.includes("UPDATE products")) throw new Error("stock write failed");
      return { affectedRows: 1 };
    },
    commit: async () => {
      throw new Error("commit should not run");
    },
    rollback: async () => {
      calls.push("ROLLBACK");
    },
    order,
    items: [{ product_id: 10, quantity: 2, item_type: "Product" }],
    reason: "Customer changed their mind",
    actor: "admin",
  }), /stock write failed/);
  assert.equal(calls.at(-1), "ROLLBACK");
  assert.equal(calls.some((sql) => sql.startsWith("UPDATE orders")), false);
});

test.after(() => {
  db.end(() => {});
});
