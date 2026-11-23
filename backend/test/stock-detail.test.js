import test from "node:test";
import assert from "node:assert/strict";
import { auditHistoryAvailable, parseStockQuantity, readStockDetail, stockDetailProduct, stockWritePlan } from "../services/stock-detail.js";
import { formatQuantity } from "../../saas-panel/src/lib/formatQuantity.js";

test("a missing audit table does not count as permission to write stock", async () => {
  const available = await auditHistoryAvailable(async () => {
    const error = new Error("missing");
    error.code = "ER_NO_SUCH_TABLE";
    throw error;
  });
  assert.equal(available, false);
});

const product3814 = {
  id: 3814,
  sku: "GC-3814",
  name: "Synthetic pen",
  stock_quantity: 4,
  reorder_level: 1,
  warehouse_stock: null,
  shop_stock: 2.25,
  warehouse_reorder_level: null,
  shop_reorder_level: 1,
};

test("complete stock records keep busy, warehouse, and shop apart", () => {
  const product = stockDetailProduct({
    ...product3814,
    warehouse_stock: 6,
    warehouse_reorder_level: 2,
  });
  assert.equal(product.busyStock, 4);
  assert.equal(product.warehouseStock, 6);
  assert.equal(product.shopStock, 2.25);
  assert.equal(formatQuantity(product.busyStock), "4");
  assert.equal(formatQuantity(2), "2");
  assert.equal(formatQuantity(1.5), "1.5");
  assert.equal(formatQuantity(2.25), "2.25");
});

test("missing stock-count records stay unrecorded", () => {
  const product = stockDetailProduct(product3814);
  assert.equal(product.busyStock, 4);
  assert.equal(product.warehouseStock, null);
  assert.equal(product.shopStock, 2.25);
  assert.equal(product.warehouse_reorder_level, null);
});

test("product 3814 can be read without a stock write", async () => {
  const calls = [];
  const detail = await readStockDetail(async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes("product_stock_audit_logs")) {
      const error = new Error("Table 'lekhanmart.product_stock_audit_logs' doesn't exist");
      error.code = "ER_NO_SUCH_TABLE";
      error.errno = 1146;
      throw error;
    }
    assert.equal(values[0], 3814);
    return [product3814];
  }, 3814);
  assert.equal(detail.ok, true);
  assert.equal(detail.product.id, 3814);
  assert.equal(detail.product.busyStock, 4);
  assert.equal(detail.product.shopStock, 2.25);
  assert.deepEqual(detail.auditLogs, []);
  assert.equal(calls.some((call) => /\b(insert|update|delete)\b/i.test(call.sql)), false);
});

test("blank quantity is rejected and explicit zero is accepted", () => {
  assert.equal(parseStockQuantity("").ok, false);
  assert.equal(parseStockQuantity("   ").ok, false);
  assert.equal(parseStockQuantity(0).value, 0);
  assert.equal(parseStockQuantity("1.5").value, 1.5);
  assert.equal(parseStockQuantity(-1).ok, false);
  assert.equal(stockWritePlan({ bucket: "shop", mode: "set", stockOnHand: "" }).ok, false);
  assert.equal(stockWritePlan({ bucket: "warehouse", mode: "set", stockOnHand: 0 }).quantity, 0);
  assert.equal(stockWritePlan({ bucket: "website", mode: "set", stockOnHand: 4 }).bucket, "website");
});

test("invalid product id and SQL errors do not write", async () => {
  const missing = await readStockDetail(async () => [], 0);
  assert.equal(missing.status, 400);
  await assert.rejects(() => readStockDetail(async () => {
    const error = new Error("syntax");
    error.code = "ER_PARSE_ERROR";
    throw error;
  }, 3814));
});

test("stock buckets are not rewritten by another bucket plan", () => {
  const busy = stockWritePlan({ bucket: "website", mode: "set", stockOnHand: 3 });
  const shop = stockWritePlan({ bucket: "shop", mode: "increase", quantity: 1 });
  assert.equal(busy.bucket, "website");
  assert.equal(shop.bucket, "shop");
  assert.notEqual(busy.bucket, shop.bucket);
});
