import test from "node:test";
import assert from "node:assert/strict";
import { placeRazorpayCheckout } from "../services/checkout-transaction.js";
import { checkoutItemName, checkoutQuantity } from "../services/commerce.service.js";
import db from "../config/db.js";

function harness(overrides = {}) {
  const events = [];
  const stock = { restored: 0 };
  const connection = { id: 1 };
  const deps = {
    connection,
    begin: async () => events.push("begin"),
    commit: async () => events.push("commit"),
    rollback: async () => events.push("rollback"),
    release: async () => events.push("release"),
    prepare: async () => {
      events.push("prepare");
      return { quote: { totalAmount: 840 } };
    },
    work: async () => {
      events.push("work");
      return { orderId: 9, orderNumber: "GC-123" };
    },
    callProvider: async (created) => {
      events.push("provider");
      return { created, paid: false };
    },
    compensate: async () => {
      events.push("compensate");
      stock.restored += 1;
    },
    ...overrides,
  };
  return { events, stock, deps };
}

test("failure before begin does not open or roll back a transaction", async () => {
  const { events, deps, stock } = harness({
    prepare: async () => {
      events.push("prepare");
      throw new Error("quote failed");
    },
  });
  await assert.rejects(() => placeRazorpayCheckout(deps), /quote failed/);
  assert.deepEqual(events, ["prepare", "release"]);
  assert.equal(stock.restored, 0);
});

test("failure immediately after begin rolls back before release", async () => {
  const { events, deps } = harness({
    work: async () => {
      events.push("work");
      throw new Error("after begin");
    },
  });
  await assert.rejects(() => placeRazorpayCheckout(deps), /after begin/);
  assert.deepEqual(events, ["prepare", "begin", "work", "rollback", "release"]);
});

test("order insert failure rolls back and does not restore stock again", async () => {
  const { events, deps, stock } = harness({
    work: async () => {
      events.push("order-insert");
      throw new Error("order insert failed");
    },
  });
  await assert.rejects(() => placeRazorpayCheckout(deps), /order insert failed/);
  assert.equal(events.filter((event) => event === "compensate").length, 0);
  assert.equal(stock.restored, 0);
  assert.equal(events.at(-2), "rollback");
  assert.equal(events.at(-1), "release");
});

test("order item insert failure rolls back the order", async () => {
  const { events, deps } = harness({
    work: async () => {
      events.push("order-insert");
      events.push("item-insert");
      throw new Error("order item insert failed");
    },
  });
  await assert.rejects(() => placeRazorpayCheckout(deps), /order item insert failed/);
  assert.deepEqual(events, ["prepare", "begin", "order-insert", "item-insert", "rollback", "release"]);
});

test("stock deduction failure rolls back without a second restoration", async () => {
  const { events, deps, stock } = harness({
    work: async () => {
      events.push("order-insert");
      events.push("stock");
      throw new Error("no longer has enough stock");
    },
  });
  await assert.rejects(() => placeRazorpayCheckout(deps), /enough stock/);
  assert.equal(stock.restored, 0);
  assert.equal(events.includes("commit"), false);
  assert.equal(events.at(-2), "rollback");
});

test("failure before commit rolls back on the same connection", async () => {
  const { events, deps } = harness({
    commit: async () => {
      events.push("commit");
      throw new Error("commit failed");
    },
  });
  await assert.rejects(() => placeRazorpayCheckout(deps), /commit failed/);
  assert.deepEqual(events, ["prepare", "begin", "work", "commit", "rollback", "release"]);
});

test("successful commit calls the provider once and does not roll back", async () => {
  const { events, deps } = harness();
  const result = await placeRazorpayCheckout(deps);
  assert.equal(result.paid, false);
  assert.deepEqual(events, ["prepare", "begin", "work", "commit", "provider", "release"]);
});

test("provider failure after commit compensates once", async () => {
  const { events, deps, stock } = harness({
    callProvider: async () => {
      events.push("provider");
      throw new Error("Razorpay unavailable");
    },
  });
  await assert.rejects(() => placeRazorpayCheckout(deps), /Razorpay unavailable/);
  assert.equal(stock.restored, 1);
  assert.equal(events.filter((event) => event === "compensate").length, 1);
  assert.equal(events.includes("rollback"), false);
  assert.equal(events.at(-1), "release");
});

test("compensation failure is surfaced after it is recorded", async () => {
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try {
    const { deps } = harness({
      callProvider: async () => {
        throw new Error("Razorpay unavailable");
      },
      compensate: async () => {
        throw new Error("restore failed");
      },
    });
    await assert.rejects(() => placeRazorpayCheckout(deps), /stock compensation failed/);
  } finally {
    console.error = original;
  }
  assert.equal(errors.some((line) => line.includes("compensation failed")), true);
});

test("empty, null, and overlong names are rejected and valid names pass", () => {
  assert.throws(() => checkoutItemName("", "product"), /name is missing/);
  assert.throws(() => checkoutItemName(null, "product"), /name is missing/);
  assert.throws(() => checkoutItemName("A".repeat(256), "product"), /was not shortened/);
  assert.equal(checkoutItemName("Blue Ink Variant", "product"), "Blue Ink Variant");
  assert.equal(checkoutItemName("Gift Bundle", "bundle"), "Gift Bundle");
});

test("an uncertain commit does not roll back or compensate", async () => {
  const { events, deps, stock } = harness({
    commit: async () => {
      events.push("commit");
      throw new Error("commit packet lost");
    },
    onUncertainCommit: async () => {
      events.push("reconcile");
      return { committed: false, error: Object.assign(new Error("unresolved"), { statusCode: 503 }) };
    },
  });
  await assert.rejects(() => placeRazorpayCheckout(deps), /unresolved/);
  assert.equal(events.includes("rollback"), false);
  assert.equal(events.includes("compensate"), false);
  assert.equal(stock.restored, 0);
  assert.equal(events.at(-1), "release");
});

test("a confirmed order after an uncertain commit is not created again", async () => {
  const { events, deps } = harness({
    commit: async () => {
      events.push("commit");
      throw new Error("commit packet lost");
    },
    onUncertainCommit: async () => {
      events.push("reconcile");
      return { committed: true, created: { orderId: 9, orderNumber: "GC-123" } };
    },
  });
  const result = await placeRazorpayCheckout(deps);
  assert.equal(result.created.orderId, 9);
  assert.equal(events.includes("rollback"), false);
  assert.equal(events.filter((event) => event === "work").length, 1);
  assert.equal(events.includes("provider"), true);
});

test("fractional checkout quantities are rejected and whole numbers stay exact", () => {
  assert.equal(checkoutQuantity(1), 1);
  assert.equal(checkoutQuantity("1.000000"), 1);
  assert.throws(() => checkoutQuantity("1.5"), /Fractional quantities/);
  assert.throws(() => checkoutQuantity(""), /whole number/);
  assert.throws(() => checkoutQuantity(null), /whole number/);
});

test.after(() => {
  db.end(() => {});
});
