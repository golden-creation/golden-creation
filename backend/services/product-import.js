function cleanString(value) {
  if (value && typeof value === "object") {
    if (value.hyperlink) return cleanString(value.hyperlink);
    if (value.text) return cleanString(value.text);
    if (value.result !== undefined) return cleanString(value.result);
    if (Array.isArray(value.richText)) {
      return value.richText.map((item) => cleanString(item.text)).join("").trim();
    }
  }

  return String(value || "").trim();
}

function normalizeImportKey(value) {
  return cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function importValue(row, keys, fallbackValue = "") {
  const normalizedRow = Object.entries(row || {}).reduce((lookup, [key, value]) => {
    lookup[normalizeImportKey(key)] = value;
    return lookup;
  }, {});

  for (const key of keys) {
    const value = normalizedRow[normalizeImportKey(key)];
    if (value !== undefined && value !== null && cleanString(value) !== "") {
      return cleanString(value);
    }
  }

  return fallbackValue;
}

export function hasImportValue(row, keys) {
  return keys.some((key) => importValue(row, [key], "") !== "");
}

export function strictImportId(value) {
  const text = cleanString(value);
  return /^\d+$/.test(text) ? Number(text) : 0;
}

export function splitCategoryPath(value) {
  return cleanString(value)
    .split(/\s*(?:>|→|›|»|\/)\s*/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

const CATEGORY_ID_KEYS = ["Category ID", "category_id", "Category Id"];
const PARENT_CATEGORY_KEYS = ["Parent Category", "parent_category", "Parent Category Name"];
const SUBCATEGORY_KEYS = ["Subcategory", "Sub Category", "subcategory", "Child Category"];
const CATEGORY_PATH_KEYS = ["Product Category", "category", "category_name", "Category", "Category Path"];
const BRAND_KEYS = ["Brand", "Brand Name", "brand_name", "brand"];
const VENDOR_KEYS = ["Vendor", "vendor"];
const BUSY_STOCK_KEYS = [
  "Busy Stock",
  "busy_stock",
  "busyStock",
  "Website Stock",
  "website_stock",
  "websiteStock",
  "Variant Inventory Qty",
  "variant_stock",
  "stock_quantity",
  "stock",
  "Stock",
];
const WAREHOUSE_STOCK_KEYS = ["Warehouse Stock", "warehouse_stock", "warehouseStock"];
const SHOP_STOCK_KEYS = ["Shop Stock", "Store Stock", "shop_stock", "store_stock", "shopStock", "storeStock"];
const PRODUCT_MATCH_COLUMNS = "id, sku, name, price, category_id, brand_id, image, description";

function categorySegments(row) {
  const parentName = importValue(row, PARENT_CATEGORY_KEYS);
  const childName = importValue(row, SUBCATEGORY_KEYS);
  const pathText = importValue(row, CATEGORY_PATH_KEYS);

  if (parentName && childName) {
    return [...splitCategoryPath(parentName), ...splitCategoryPath(childName)];
  }
  if (parentName && pathText) {
    return [...splitCategoryPath(parentName), ...splitCategoryPath(pathText)];
  }
  if (pathText) return splitCategoryPath(pathText);
  if (parentName) return splitCategoryPath(parentName);
  if (childName) return splitCategoryPath(childName);
  return [];
}

async function queryRows(query, sql, params) {
  const rows = await query(sql, params);
  return Array.isArray(rows) ? rows : [];
}

async function queryVariantRows(query, sql, params) {
  try {
    return await queryRows(query, sql, params);
  } catch (error) {
    if (error?.code === "ER_NO_SUCH_TABLE") return [];
    throw error;
  }
}

export async function resolveImportCategory(query, row) {
  const requestedId = strictImportId(importValue(row, CATEGORY_ID_KEYS));
  const segments = categorySegments(row);

  if (!requestedId && !segments.length) {
    return { blank: true, id: null, path: [] };
  }

  if (requestedId) {
    const rows = await queryRows(
      query,
      "SELECT id, name, parent_id FROM categories WHERE id = ? LIMIT 2",
      [requestedId]
    );
    if (!rows.length) return { error: `category ID ${requestedId} was not found` };
    return { id: rows[0].id, name: rows[0].name, path: [rows[0].name], matchedBy: "id" };
  }

  let parentId = null;
  const matched = [];

  for (const name of segments) {
    const rows = await queryRows(
      query,
      `SELECT id, name, parent_id
       FROM categories
       WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
         AND parent_id <=> ?
       ORDER BY id`,
      [name, parentId]
    );

    if (rows.length > 1) {
      return { error: `category "${segments.join(" > ")}" is ambiguous at "${name}"` };
    }

    if (rows.length === 1) {
      matched.push(rows[0]);
      parentId = rows[0].id;
      continue;
    }

    if (segments.length === 1) {
      const anyName = await queryRows(
        query,
        `SELECT id, name, parent_id
         FROM categories
         WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
         ORDER BY id`,
        [name]
      );
      if (anyName.length === 1) {
        return { id: anyName[0].id, name: anyName[0].name, path: [anyName[0].name], matchedBy: "name" };
      }
      if (anyName.length > 1) {
        return { error: `category "${name}" matches more than one category; include the full parent path` };
      }
    }

    return { error: `category "${segments.join(" > ")}" was not found` };
  }

  const last = matched[matched.length - 1];
  return {
    id: last.id,
    name: last.name,
    path: matched.map((item) => item.name),
    matchedBy: "path",
  };
}

export function brandSourceFromRow(row) {
  const brandName = importValue(row, BRAND_KEYS);
  if (brandName) return { name: brandName, fromVendor: false };
  const vendor = importValue(row, VENDOR_KEYS);
  if (vendor) return { name: vendor, fromVendor: true };
  return { name: "", fromVendor: false };
}

export async function resolveImportBrand(query, row) {
  const source = brandSourceFromRow(row);
  if (!source.name) return { blank: true, id: null };

  const rows = await queryRows(
    query,
    `SELECT id, name
     FROM brands
     WHERE deleted_at IS NULL
       AND LOWER(TRIM(name)) = LOWER(TRIM(?))
     ORDER BY id`,
    [source.name]
  );

  if (rows.length > 1) return { error: `brand "${source.name}" matches more than one brand` };
  if (!rows.length) return { error: `brand "${source.name}" was not found` };
  return { id: rows[0].id, name: rows[0].name, fromVendor: source.fromVendor };
}

function uniqueSkus(sku, variantSkus) {
  return [...new Set([sku, ...(variantSkus || [])].map((item) => cleanString(item)).filter(Boolean))];
}

function placeholders(values) {
  return values.map(() => "?").join(", ");
}

export async function resolveImportProduct(query, { productId = 0, sku = "", variantSkus = [], name = "" } = {}) {
  const skus = uniqueSkus(sku, variantSkus);

  if (productId) {
    const rows = await queryRows(
      query,
      `SELECT ${PRODUCT_MATCH_COLUMNS} FROM products WHERE id = ? LIMIT 1`,
      [productId]
    );
    if (!rows[0]) return { error: `product ID ${productId} was not found` };

    if (skus.length) {
      const otherProducts = await queryRows(
        query,
        `SELECT id, sku FROM products WHERE sku IN (${placeholders(skus)}) AND id <> ?`,
        [...skus, productId]
      );
      if (otherProducts.length) {
        return { error: `SKU ${otherProducts[0].sku} already belongs to product ${otherProducts[0].id}` };
      }

      const otherVariants = await queryVariantRows(
        query,
        `SELECT product_id, sku FROM product_variants WHERE sku IN (${placeholders(skus)}) AND product_id <> ?`,
        [...skus, productId]
      );
      if (otherVariants.length) {
        return { error: `variant SKU ${otherVariants[0].sku} already belongs to product ${otherVariants[0].product_id}` };
      }
    }

    return { product: rows[0], matchedBy: "id" };
  }

  if (skus.length) {
    const productRows = await queryRows(
      query,
      `SELECT ${PRODUCT_MATCH_COLUMNS} FROM products WHERE sku IN (${placeholders(skus)}) ORDER BY id`,
      skus
    );
    const variantRows = await queryVariantRows(
      query,
      `SELECT product_id, sku FROM product_variants WHERE sku IN (${placeholders(skus)}) ORDER BY id`,
      skus
    );
    const ids = [...new Set([...productRows.map((row) => row.id), ...variantRows.map((row) => row.product_id)])];

    if (ids.length > 1) {
      return { error: `SKU matches more than one product (${ids.join(", ")})` };
    }

    if (productRows.length === 1) {
      return { product: productRows[0], matchedBy: "sku" };
    }

    if (ids.length === 1) {
      const rows = await queryRows(
        query,
        `SELECT ${PRODUCT_MATCH_COLUMNS} FROM products WHERE id = ? LIMIT 1`,
        [ids[0]]
      );
      if (!rows[0]) return { error: `variant SKU matches missing product ${ids[0]}` };
      return { product: rows[0], matchedBy: "variant_sku" };
    }
  }

  if (cleanString(name)) {
    const named = await queryRows(
      query,
      `SELECT id, sku, name
       FROM products
       WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
       ORDER BY id
       LIMIT 3`,
      [name]
    );
    if (named.length) {
      return {
        error: `product name "${cleanString(name)}" already exists on product ${named.map((row) => row.id).join(", ")}; provide the product ID or SKU to update it`,
      };
    }
  }

  return { product: null, create: true };
}

export function stockColumnsFromRows(rows) {
  const wrapped = rows.map((row) => ({ row }));
  const present = (keys) => wrapped.some(({ row }) => hasImportValue(row, keys));
  return {
    busy: present(BUSY_STOCK_KEYS),
    warehouse: present(WAREHOUSE_STOCK_KEYS),
    shop: present(SHOP_STOCK_KEYS),
  };
}

export function duplicateSkuInGroup(skus) {
  const seen = new Set();
  for (const sku of skus.map((item) => cleanString(item)).filter(Boolean)) {
    const key = sku.toLowerCase();
    if (seen.has(key)) return sku;
    seen.add(key);
  }
  return "";
}
