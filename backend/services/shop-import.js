import { hasImportValue, importValue, strictImportId } from "./product-import.js";

export const SHOP_EXPORT_COLUMNS = [
  ["ID", "id"],
  ["SKU", "sku"],
  ["Name", "name", 34],
  ["Category", "category_name"],
  ["Brand", "brand_name"],
  ["Barcode", "barcode"],
  ["Stock", "stock_on_hand"],
  ["Reorder Level", "reorder_level"],
  ["Status", "status"],
];

const SHOP_STOCK_KEYS = ["Stock", "Shop Stock", "Store Stock", "stock_on_hand", "shop_stock", "store_stock", "stockOnHand"];
const REORDER_KEYS = ["Reorder Level", "reorder_level", "reorderLevel"];
const NAME_KEYS = ["Name", "Title", "name"];
const SKU_KEYS = ["SKU", "sku", "Variant SKU"];
const ID_KEYS = ["ID", "id", "Product ID"];
const CATEGORY_KEYS = ["Category", "category_name", "category"];
const BRAND_KEYS = ["Brand", "brand_name", "brand"];
const BARCODE_KEYS = ["Barcode", "barcode"];
const STATUS_KEYS = ["Status", "status"];
const PRICE_KEYS = ["Price", "MRP", "price", "mrp"];
const DESCRIPTION_KEYS = ["Description", "description"];

function cellText(value) {
  if (value && typeof value === "object") {
    if (value.hyperlink) return cellText(value.hyperlink);
    if (value.text) return cellText(value.text);
    if (value.result !== undefined) return cellText(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((item) => cellText(item.text)).join("").trim();
  }
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function cellValue(row, keys) {
  const lookup = Object.entries(row || {}).reduce((map, [key, value]) => {
    map[key.toLowerCase().replace(/[^a-z0-9]+/g, "")] = value;
    return map;
  }, {});
  for (const key of keys) {
    const value = lookup[key.toLowerCase().replace(/[^a-z0-9]+/g, "")];
    if (value !== undefined && value !== null && cellText(value) !== "") return cellText(value);
  }
  return "";
}

function optionalNumber(row, keys) {
  const text = cellValue(row, keys);
  if (text === "") return { present: false };
  if (!/^[+-]?(?:\d+\.\d+|\d+)$/.test(text)) {
    return { present: true, error: `"${text}" is not a valid quantity` };
  }
  return { present: true, value: Number(text) };
}

function uniqueByName(records, name) {
  const key = String(name || "").trim().toLowerCase();
  const matches = (records || []).filter((record) => String(record.name || "").trim().toLowerCase() === key);
  if (!matches.length) return { error: `unknown name "${name}"` };
  if (matches.length > 1) return { error: `ambiguous name "${name}"` };
  return { id: Number(matches[0].id) };
}

export function planShopImport(rows, catalog = {}) {
  const products = catalog.products || [];
  const byId = new Map(products.map((product) => [Number(product.id), product]));
  const bySku = new Map();
  for (const product of products) {
    const key = String(product.sku || "").trim().toLowerCase();
    if (!key) continue;
    const list = bySku.get(key) || [];
    list.push(product);
    bySku.set(key, list);
  }

  const seenSku = new Map();
  const seenId = new Map();
  const planned = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const errors = [];
    const sku = importValue(row, SKU_KEYS);
    const idText = importValue(row, ID_KEYS);
    const id = idText ? strictImportId(idText) : 0;
    if (idText && !id) errors.push("Product ID must be a whole number");

    const skuKey = sku.toLowerCase();
    if (skuKey) {
      if (seenSku.has(skuKey)) errors.push(`Duplicate SKU ${sku} in this file`);
      else seenSku.set(skuKey, rowNumber);
    }
    if (id) {
      if (seenId.has(id)) errors.push(`Duplicate product ID ${id} in this file`);
      else seenId.set(id, rowNumber);
    }
    if (!sku && !id) errors.push("SKU or product ID is required");

    let product = null;
    if (!errors.length && id) {
      product = byId.get(id) || null;
      if (!product) errors.push(`Unknown product ID ${id}`);
      else if (sku && String(product.sku || "").trim().toLowerCase() !== skuKey) {
        errors.push(`SKU ${sku} does not match product ID ${id}`);
      }
    } else if (!errors.length && skuKey) {
      const matches = bySku.get(skuKey) || [];
      if (!matches.length) errors.push(`Unknown SKU ${sku}`);
      else if (matches.length > 1) errors.push(`Ambiguous SKU ${sku}`);
      else product = matches[0];
    }

    const stock = optionalNumber(row, SHOP_STOCK_KEYS);
    const reorder = optionalNumber(row, REORDER_KEYS);
    if (stock.error) errors.push(`Stock ${stock.error}`);
    if (reorder.error) errors.push(`Reorder level ${reorder.error}`);
    if (stock.present && stock.value < 0) errors.push("Stock cannot be negative");
    if (reorder.present && reorder.value < 0) errors.push("Reorder level cannot be negative");

    const fields = {};
    if (product && !errors.length) {
      const name = importValue(row, NAME_KEYS);
      const barcode = importValue(row, BARCODE_KEYS);
      const description = importValue(row, DESCRIPTION_KEYS);
      const status = importValue(row, STATUS_KEYS);
      const price = optionalNumber(row, PRICE_KEYS);
      if (price.error) errors.push(`Price ${price.error}`);
      if (name) fields.name = name;
      if (barcode) fields.barcode = barcode;
      if (description) fields.description = description;
      if (status) fields.status = status;
      if (price.present && !price.error) fields.price = price.value;

      if (hasImportValue(row, CATEGORY_KEYS)) {
        const resolved = uniqueByName(catalog.categories, importValue(row, CATEGORY_KEYS));
        if (resolved.error) errors.push(`Category is ${resolved.error}`);
        else fields.category_id = resolved.id;
      }
      if (hasImportValue(row, BRAND_KEYS)) {
        const resolved = uniqueByName(catalog.brands, importValue(row, BRAND_KEYS));
        if (resolved.error) errors.push(`Brand is ${resolved.error}`);
        else fields.brand_id = resolved.id;
      }
    }

    const actionable = Boolean(product) && !errors.length && (Object.keys(fields).length || stock.present || reorder.present);
    planned.push({
      row: rowNumber,
      action: errors.length ? "error" : actionable ? "update" : "skip",
      productId: product?.id || null,
      currentShopStock: product ? Number(product.shop_stock || 0) : null,
      fields: errors.length ? {} : fields,
      shopStock: errors.length || !stock.present ? undefined : stock.value,
      reorderLevel: errors.length || !reorder.present ? undefined : reorder.value,
      errors,
    });
  });

  for (const [sku, rowNumber] of seenSku) {
    const matches = planned.filter((item) => importValue(rows[item.row - 2], SKU_KEYS).toLowerCase() === sku);
    if (matches.length < 2) continue;
    for (const item of matches) {
      item.action = "error";
      item.fields = {};
      item.shopStock = undefined;
      item.reorderLevel = undefined;
      if (!item.errors.some((error) => error.startsWith("Duplicate SKU"))) {
        item.errors.push(`Duplicate SKU on row ${rowNumber}`);
      }
    }
  }

  const errors = planned.filter((item) => item.action === "error").map((item) => ({
    row: item.row,
    message: item.errors.join("; "),
  }));

  return {
    rows: planned,
    errors,
    created: 0,
    updated: planned.filter((item) => item.action === "update").length,
    skipped: planned.filter((item) => item.action === "skip").length,
  };
}

export async function applyShopImportPlan(plan, { dryRun = false, write } = {}) {
  if (dryRun) return { applied: false, writes: 0 };
  let writes = 0;
  for (const item of plan.rows) {
    if (item.action !== "update") continue;
    if (Object.keys(item.fields).length) {
      await write("product", item);
      writes += 1;
    }
    if (item.shopStock !== undefined || item.reorderLevel !== undefined) {
      await write("shop-stock", item);
      writes += 1;
    }
  }
  return { applied: true, writes };
}
