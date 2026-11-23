import test from "node:test";
import assert from "node:assert/strict";
import { applyShopImportPlan, planShopImport, SHOP_EXPORT_COLUMNS } from "../services/shop-import.js";

const catalog = {
  products: [
    { id: 9, sku: "PEN-1", shop_stock: 12 },
    { id: 10, sku: "PEN-1", shop_stock: 4 },
    { id: 11, sku: "BOOK-1", shop_stock: 8 },
  ],
  categories: [{ id: 3, name: "Stationery" }],
  brands: [{ id: 5, name: "Golden" }, { id: 6, name: "Golden" }],
};

function rowFor(sku, extra = {}) {
  return { SKU: sku, Name: "Kept name", ...extra };
}

test("blank shop stock does not plan a stock write", () => {
  const plan = planShopImport([rowFor("BOOK-1", { Stock: "" })], catalog);
  assert.equal(plan.rows[0].shopStock, undefined);
  assert.equal(plan.rows[0].action, "update");
  assert.deepEqual(plan.rows[0].fields, { name: "Kept name" });
});

test("missing stock column does not plan a stock write", () => {
  const plan = planShopImport([rowFor("BOOK-1")], catalog);
  assert.equal(plan.rows[0].shopStock, undefined);
});

test("explicit zero updates shop stock only", () => {
  const plan = planShopImport([rowFor("BOOK-1", { Stock: 0, Category: "", Brand: "", Status: "" })], catalog);
  assert.equal(plan.rows[0].shopStock, 0);
  assert.equal(plan.rows[0].fields.category_id, undefined);
  assert.equal(plan.rows[0].fields.brand_id, undefined);
  assert.equal(plan.rows[0].fields.status, undefined);
  assert.equal(plan.rows[0].fields.busy_stock, undefined);
  assert.equal(plan.rows[0].fields.warehouse_stock, undefined);
});

test("one positive and one decimal row update shop stock", () => {
  const plan = planShopImport([
    { SKU: "BOOK-1", Stock: "4" },
    { ID: 11, "Shop Stock": "2.25" },
  ], catalog);
  assert.equal(plan.rows[0].shopStock, 4);
  assert.equal(plan.rows[1].shopStock, 2.25);
  assert.equal(plan.rows[1].productId, 11);
});

test("existing SKU matches one product and unknown SKU is rejected", () => {
  const plan = planShopImport([
    { SKU: "book-1", Stock: "3" },
    { SKU: "MISSING", Stock: "9", Name: "New" },
  ], catalog);
  assert.equal(plan.rows[0].productId, 11);
  assert.equal(plan.rows[1].action, "error");
  assert.match(plan.errors[0].message, /Unknown SKU MISSING/);
});

test("duplicate SKU in the file and in the catalog is rejected", () => {
  const file = planShopImport([
    { SKU: "BOOK-1", Stock: "1" },
    { SKU: "BOOK-1", Stock: "2" },
  ], catalog);
  assert.equal(file.updated, 0);
  assert.equal(file.rows.every((item) => item.shopStock === undefined), true);

  const database = planShopImport([{ SKU: "PEN-1", Stock: "1" }], catalog);
  assert.equal(database.rows[0].action, "error");
  assert.match(database.errors[0].message, /Ambiguous SKU/);
});

test("exported shop headers round-trip without clearing blank fields", () => {
  const headers = SHOP_EXPORT_COLUMNS.map(([header]) => header);
  assert.deepEqual(headers, ["ID", "SKU", "Name", "Category", "Brand", "Barcode", "Stock", "Reorder Level", "Status"]);
  const exported = {
    ID: "11",
    SKU: "BOOK-1",
    Name: "Notebook",
    Category: "Stationery",
    Brand: "",
    Barcode: "",
    Stock: "8",
    "Reorder Level": "",
    Status: "Active",
  };
  const plan = planShopImport([exported], catalog);
  assert.equal(plan.rows[0].action, "update");
  assert.equal(plan.rows[0].shopStock, 8);
  assert.equal(plan.rows[0].reorderLevel, undefined);
  assert.equal(plan.rows[0].fields.category_id, 3);
  assert.equal(plan.rows[0].fields.brand_id, undefined);
  assert.equal(plan.rows[0].fields.barcode, undefined);
  assert.equal(plan.rows[0].fields.status, "Active");
  assert.equal(plan.rows[0].fields.price, undefined);
});

test("dry run performs no writes", async () => {
  const plan = planShopImport([{ SKU: "BOOK-1", Stock: 0 }], catalog);
  const result = await applyShopImportPlan(plan, {
    dryRun: true,
    write() {
      throw new Error("dry run wrote");
    },
  });
  assert.equal(result.applied, false);
  assert.equal(result.writes, 0);
});

test("apply writes shop stock and not a product row when only stock changed", async () => {
  const plan = planShopImport([{ SKU: "BOOK-1", Stock: 0 }], catalog);
  const writes = [];
  const result = await applyShopImportPlan(plan, {
    dryRun: false,
    write: async (kind, item) => writes.push([kind, item.shopStock, item.fields]),
  });
  assert.equal(result.writes, 1);
  assert.deepEqual(writes, [["shop-stock", 0, {}]]);
});
