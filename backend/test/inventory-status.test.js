import test from "node:test";
import assert from "node:assert/strict";
import { classifyInventoryStatus, inventoryStatusSql, physicalStockFilter } from "../services/inventory-status.js";
import { formatQuantity } from "../../saas-panel/src/lib/formatQuantity.js";

test("both missing physical rows are not recorded", () => {
  assert.equal(classifyInventoryStatus({ busy: 4, warehouse: null, shop: null }), "not_recorded");
});

test("one physical row is not recorded", () => {
  assert.equal(classifyInventoryStatus({ busy: 4, warehouse: 4, shop: null }), "not_recorded");
  assert.equal(classifyInventoryStatus({ busy: 4, warehouse: null, shop: 4 }), "not_recorded");
});

test("zero rows without audit evidence stay unverified", () => {
  assert.equal(classifyInventoryStatus({
    busy: 4,
    warehouse: 0,
    shop: 0,
    warehouseVerified: false,
    shopVerified: false,
  }), "unverified");
  assert.equal(classifyInventoryStatus({
    busy: 0,
    warehouse: 0,
    shop: 0,
  }), "unverified");
});

test("verified quantities can be balanced", () => {
  assert.equal(classifyInventoryStatus({
    busy: 4,
    warehouse: 3,
    shop: 1,
    warehouseVerified: true,
    shopVerified: true,
  }), "balanced");
  assert.equal(classifyInventoryStatus({
    busy: 0,
    warehouse: 0,
    shop: 0,
    warehouseVerified: true,
    shopVerified: true,
  }), "balanced");
});

test("verified quantities can be mismatched", () => {
  assert.equal(classifyInventoryStatus({
    busy: 4,
    warehouse: 3,
    shop: 0,
    warehouseVerified: true,
    shopVerified: true,
  }), "mismatch");
});

test("fractional quantities compare without treating trailing zeros as a mismatch", () => {
  assert.equal(classifyInventoryStatus({
    busy: "4.000000",
    warehouse: 1.5,
    shop: 2.5,
    warehouseVerified: true,
    shopVerified: true,
  }), "balanced");
  assert.equal(classifyInventoryStatus({
    busy: "7.900000",
    warehouse: 4,
    shop: 3,
    warehouseVerified: true,
    shopVerified: true,
  }), "mismatch");
});

test("missing audit evidence does not turn a seeded zero into a mismatch", () => {
  const sql = inventoryStatusSql({ auditAvailable: false });
  assert.match(sql, /'not_recorded'/);
  assert.match(sql, /'unverified'/);
  assert.match(sql, /'balanced'/);
  assert.match(sql, /'mismatch'/);
  assert.doesNotMatch(sql, /product_stock_audit_logs/);
  assert.equal(classifyInventoryStatus({ busy: 2, warehouse: 0, shop: 0, warehouseVerified: false, shopVerified: false }), "unverified");
});

test("warehouse and shop filters ignore missing rows", () => {
  assert.match(physicalStockFilter("warehouse_stock", "out_of_stock"), /warehouse_stock.id IS NOT NULL/);
  assert.match(physicalStockFilter("shop_stock", "in_stock"), /shop_stock.stock_on_hand > 0/);
  assert.doesNotMatch(physicalStockFilter("warehouse_stock", "out_of_stock"), /COALESCE/);
});

test("quantity formatting is unchanged", () => {
  assert.equal(formatQuantity("1.0000"), "1");
  assert.equal(formatQuantity("2.0000"), "2");
  assert.equal(formatQuantity("1.5000"), "1.5");
  assert.equal(formatQuantity("2.2500"), "2.25");
});
