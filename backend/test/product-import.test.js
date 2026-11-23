import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import test from "node:test";

import {
  brandSourceFromRow,
  duplicateSkuInGroup,
  resolveImportBrand,
  resolveImportCategory,
  resolveImportProduct,
  stockColumnsFromRows,
} from "../services/product-import.js";
import {
  PRODUCT_IMPORT_HEADERS,
  importResultMessage,
  readSpreadsheetRows,
} from "../../saas-panel/src/lib/spreadsheetImport.js";

const categories = [
  { id: 1, name: "Office Stationery", parent_id: null },
  { id: 2, name: "Pens", parent_id: 1 },
  { id: 3, name: "Art", parent_id: null },
  { id: 4, name: "Pens", parent_id: 3 },
];

const brands = [
  { id: 8, name: "Parker", deleted_at: null },
  { id: 9, name: "Pilot", deleted_at: null },
];

const products = [
  { id: 10, sku: "PEN-1", name: "Existing Pen", price: 45, category_id: 2, brand_id: 8, image: "keep.jpg", description: "keep" },
  { id: 11, sku: "PEN-2", name: "Existing Pen", price: 50, category_id: 2, brand_id: 8, image: "", description: "" },
  { id: 12, sku: "DIARY-1", name: "Diary", price: 100, category_id: 1, brand_id: 8, image: "", description: "" },
];

const variants = [
  { product_id: 10, sku: "PEN-1-BLUE" },
  { product_id: 12, sku: "DIARY-RED" },
];

function sameName(left, right) {
  return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
}

function catalogQuery(extraBrands = brands) {
  return async (sql, params) => {
    if (sql.includes("FROM categories WHERE id = ?")) {
      return categories.filter((category) => category.id === params[0]).slice(0, 2);
    }
    if (sql.includes("FROM categories") && sql.includes("parent_id <=> ?")) {
      const [name, parentId] = params;
      return categories.filter((category) => sameName(category.name, name) && (category.parent_id ?? null) === (parentId ?? null));
    }
    if (sql.includes("FROM categories")) {
      return categories.filter((category) => sameName(category.name, params[0]));
    }
    if (sql.includes("FROM brands")) {
      return extraBrands.filter((brand) => !brand.deleted_at && sameName(brand.name, params[0]));
    }
    if (sql.includes("FROM products WHERE id = ?")) {
      return products.filter((product) => product.id === params[0]).slice(0, 1);
    }
    if (sql.includes("FROM products WHERE sku IN") && sql.includes("id <>")) {
      const id = params.at(-1);
      const skus = params.slice(0, -1).map((sku) => String(sku).toLowerCase());
      return products.filter((product) => skus.includes(String(product.sku).toLowerCase()) && product.id !== id);
    }
    if (sql.includes("FROM products WHERE sku IN")) {
      const skus = params.map((sku) => String(sku).toLowerCase());
      return products.filter((product) => skus.includes(String(product.sku).toLowerCase()));
    }
    if (sql.includes("FROM product_variants") && sql.includes("product_id <>")) {
      const id = params.at(-1);
      const skus = params.slice(0, -1).map((sku) => String(sku).toLowerCase());
      return variants.filter((variant) => skus.includes(variant.sku.toLowerCase()) && variant.product_id !== id);
    }
    if (sql.includes("FROM product_variants")) {
      const skus = params.map((sku) => String(sku).toLowerCase());
      return variants.filter((variant) => skus.includes(variant.sku.toLowerCase()));
    }
    if (sql.includes("FROM products")) {
      return products.filter((product) => sameName(product.name, params[0])).slice(0, 3);
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
}

test("category path matches the parent and does not pick the other Pens", async () => {
  const query = catalogQuery();
  const byPath = await resolveImportCategory(query, { "Product Category": "Office Stationery > Pens" });
  assert.equal(byPath.id, 2);

  const byColumns = await resolveImportCategory(query, {
    "Parent Category": "Art",
    Subcategory: "Pens",
    "Product Category": "Office Stationery > Pens",
  });
  assert.equal(byColumns.id, 4);

  const byId = await resolveImportCategory(query, { "Category ID": "2" });
  assert.equal(byId.id, 2);
});

test("ambiguous, missing, and blank categories are reported without a match", async () => {
  const query = catalogQuery();
  const ambiguous = await resolveImportCategory(query, { Category: "Pens" });
  assert.match(ambiguous.error, /more than one category/);

  const missing = await resolveImportCategory(query, { category_name: "Ink" });
  assert.match(missing.error, /was not found/);

  const missingId = await resolveImportCategory(query, { "Category ID": "99" });
  assert.match(missingId.error, /was not found/);

  const blank = await resolveImportCategory(query, { Title: "Pen", Type: "Premium Pens" });
  assert.equal(blank.blank, true);
});

test("brand matches case-insensitively and Vendor is only a fallback", async () => {
  const query = catalogQuery();
  const brand = await resolveImportBrand(query, { Brand: "  parker ", Vendor: "Someone Else" });
  assert.equal(brand.id, 8);
  assert.equal(brand.fromVendor, false);

  const vendor = await resolveImportBrand(query, { Vendor: "Parker" });
  assert.equal(vendor.id, 8);
  assert.equal(vendor.fromVendor, true);
  assert.equal(brandSourceFromRow({ Brand: "Pilot", Vendor: "Parker" }).name, "Pilot");

  const unknown = await resolveImportBrand(query, { "Brand Name": "Missing Brand" });
  assert.match(unknown.error, /was not found/);

  const blank = await resolveImportBrand(query, { Title: "Pen" });
  assert.equal(blank.blank, true);

  const ambiguous = await resolveImportBrand(catalogQuery([
    { id: 2, name: "Pilot", deleted_at: null },
    { id: 3, name: " pilot ", deleted_at: null },
  ]), { brand: "Pilot" });
  assert.match(ambiguous.error, /more than one brand/);
});

test("products match by id, sku, or variant sku and do not update by name", async () => {
  const query = catalogQuery();
  const bySku = await resolveImportProduct(query, { sku: "pen-1", name: "Existing Pen" });
  assert.equal(bySku.product.id, 10);
  assert.equal(bySku.matchedBy, "sku");

  const byVariant = await resolveImportProduct(query, { variantSkus: ["PEN-1-BLUE"], name: "Existing Pen" });
  assert.equal(byVariant.product.id, 10);
  assert.equal(byVariant.matchedBy, "variant_sku");

  const byId = await resolveImportProduct(query, { productId: 12, sku: "DIARY-1" });
  assert.equal(byId.product.id, 12);

  const missingId = await resolveImportProduct(query, { productId: 99, sku: "NEW-1" });
  assert.match(missingId.error, /product ID 99/);

  const byName = await resolveImportProduct(query, { name: "Existing Pen" });
  assert.match(byName.error, /already exists/);

  const created = await resolveImportProduct(query, { sku: "NEW-1", name: "Brand New Pen" });
  assert.equal(created.create, true);

  const conflicting = await resolveImportProduct(query, { productId: 12, variantSkus: ["PEN-1-BLUE"] });
  assert.match(conflicting.error, /already belongs to product 10/);
});

test("blank stock columns stay untouched and duplicate SKUs are detected", () => {
  assert.deepEqual(stockColumnsFromRows([{ Title: "Pen", "Variant Price": "10" }]), {
    busy: false,
    warehouse: false,
    shop: false,
  });
  assert.deepEqual(stockColumnsFromRows([{ "Busy Stock": "0", "Warehouse Stock": "", "Shop Stock": "4" }]), {
    busy: true,
    warehouse: false,
    shop: true,
  });
  assert.equal(duplicateSkuInGroup(["PEN-1", "pen-1"]), "pen-1");
  assert.equal(duplicateSkuInGroup(["PEN-1", "PEN-2"]), "");
});

test("xlsx and csv rows are read, and binary xls is rejected", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Products");
  sheet.addRow(PRODUCT_IMPORT_HEADERS);
  sheet.addRow(["sample-pen", "Sample Pen", "", "", "Parker", "Office Stationery > Pens"]);
  const buffer = await workbook.xlsx.writeBuffer();
  const xlsxRows = await readSpreadsheetRows(new File([buffer], "products.xlsx"));
  assert.equal(xlsxRows[0].Title, "Sample Pen");
  assert.equal(xlsxRows[0]["Product Category"], "Office Stationery > Pens");
  assert.equal(xlsxRows[0]["Parent Category"], "");

  const csvRows = await readSpreadsheetRows(new File(
    ["Title,Variant SKU,Brand\nSample Pen,NEW-1,Parker\n"],
    "products.csv"
  ));
  assert.equal(csvRows[0]["Variant SKU"], "NEW-1");

  await assert.rejects(
    () => readSpreadsheetRows(new File(["not-a-workbook"], "products.xls")),
    /Binary \.xls files are not supported/
  );

  const message = importResultMessage({ created: 0, updated: 0, skipped: 2, errors: [{ row: 2, message: "category was not found" }] });
  assert.match(message, /Import failed/);
  assert.doesNotMatch(message, /Import complete/);
});
