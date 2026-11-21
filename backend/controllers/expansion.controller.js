import ExcelJS from "exceljs";
import db from "../config/db.js";
import {
  releaseEligibleCommissions,
  reverseOrderCommissions,
} from "../services/referral-affiliate.service.js";

const TASK_STATUSES = ["Pending", "Ongoing", "Done", "Not Completed", "Abandoned"];
const ATTENDANCE_STATUSES = ["Present", "Absent", "Half Day", "Leave"];
const ORDER_STATUSES = ["Pending", "Processing", "Dispatched", "In Transit", "Delivered", "Cancelled"];
const RETURN_STATUSES = ["Requested", "Approved", "Return Scheduled", "Picked Up", "Received", "Refund Done", "Rejected", "Cancelled"];
const REPLACEMENT_STATUSES = ["Requested", "Approved", "Pickup Scheduled", "Picked Up", "Received", "Replacement Dispatched", "Replacement In Transit", "Replacement Delivered", "Rejected", "Cancelled"];

function dbQuery(sql, values = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, values, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

function clean(value) {
  return String(value || "").trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slugify(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function pagination(query = {}) {
  const page = Math.max(1, number(query.page, 1));
  const limit = Math.min(100, Math.max(1, number(query.limit, 20)));
  return { page, limit, offset: (page - 1) * limit };
}

function isSuperAdmin(admin) {
  return clean(admin?.role).toLowerCase() === "super admin";
}

function isHrManager(admin) {
  return ["super admin", "technical developer"].includes(clean(admin?.role).toLowerCase());
}

async function ensureHrLiteSchema() {
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS staff_attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      admin_id INT NOT NULL,
      attendance_date DATE NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'Present',
      check_in TIME NULL,
      check_out TIME NULL,
      remarks TEXT NULL,
      marked_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_staff_attendance (admin_id, attendance_date),
      INDEX idx_staff_attendance_date (attendance_date),
      INDEX idx_staff_attendance_admin (admin_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function logActivity(req, action, module, detail = "") {
  try {
    await dbQuery(
      "INSERT INTO admin_activity (admin_id, actor, action, module, detail) VALUES (?, ?, ?, ?, ?)",
      [req.admin?.id || null, req.admin?.name || req.admin?.email || "System", action, module, detail || null]
    );
  } catch (error) {
    console.log("Expansion activity skipped:", error.message);
  }
}

function respondError(res, error, message) {
  console.log(`${message}:`, error);
  res.status(500).json({ message });
}

async function sendWorkbook(res, filename, sheetName, columns, rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Golden Creation";
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map(([header, key, width = 18]) => ({ header, key, width }));
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

const catalogConfig = {
  website: {
    label: "Busy",
    table: "products",
    stock: "COALESCE(p.stock_quantity, 0)",
    reserved: "0",
    reorder: "COALESCE(p.reorder_level, 0)",
    price: "price",
  },
  warehouse: {
    label: "Warehouse",
    table: "products",
    stock: "COALESCE(warehouse_stock.stock_on_hand, 0)",
    reserved: "COALESCE(warehouse_stock.reserved_stock, 0)",
    reorder: "COALESCE(warehouse_stock.reorder_level, p.reorder_level, 0)",
    price: "price",
  },
  store: {
    label: "Shop",
    table: "products",
    stock: "COALESCE(shop_stock.stock_on_hand, 0)",
    reserved: "COALESCE(shop_stock.reserved_stock, 0)",
    reorder: "COALESCE(shop_stock.reorder_level, p.reorder_level, 0)",
    price: "price",
  },
};

function catalogKey(value) {
  const key = clean(value).toLowerCase();
  return catalogConfig[key] ? key : "website";
}

function stockBucket(value) {
  const key = clean(value).toLowerCase();
  if (key === "website" || key === "busy" || key === "master") return "website";
  if (key === "warehouse") return "warehouse";
  if (key === "shop" || key === "store") return "shop";
  return "";
}

async function ensurePhysicalStockRows(productId) {
  const id = number(productId);
  if (!id) return;

  await dbQuery(
    `
      INSERT IGNORE INTO product_stock_counts (product_id, bucket, stock_on_hand, reserved_stock, reorder_level)
      SELECT id, 'warehouse', 0, 0, COALESCE(reorder_level, 0)
      FROM products
      WHERE id = ?
    `,
    [id]
  );
  await dbQuery(
    `
      INSERT IGNORE INTO product_stock_counts (product_id, bucket, stock_on_hand, reserved_stock, reorder_level)
      SELECT id, 'shop', 0, 0, COALESCE(reorder_level, 0)
      FROM products
      WHERE id = ?
    `,
    [id]
  );
}

async function logStockChange(req, productId, bucket, previousStock, newStock, previousReorderLevel, newReorderLevel, adjustmentType, reason = "") {
  await dbQuery(
    `INSERT INTO product_stock_audit_logs
      (product_id, bucket, previous_stock, new_stock, previous_reorder_level, new_reorder_level,
       adjustment_type, quantity_delta, reason, changed_by, actor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      productId,
      bucket,
      number(previousStock),
      number(newStock),
      previousReorderLevel == null ? null : number(previousReorderLevel),
      newReorderLevel == null ? null : number(newReorderLevel),
      adjustmentType || "set",
      number(newStock) - number(previousStock),
      clean(reason) || null,
      req?.admin?.id || null,
      req?.admin?.name || req?.admin?.email || "System",
    ]
  );
}

async function setProductStock(req, productId, bucket, nextStock, nextReorderLevel = null, adjustmentType = "set", reason = "") {
  const id = number(productId);
  const targetBucket = stockBucket(bucket);
  if (!id || !targetBucket) throw new Error("Product and stock bucket are required");
  const stock = Math.max(0, number(nextStock));

  if (targetBucket === "website") {
    const rows = await dbQuery("SELECT stock_quantity, reorder_level FROM products WHERE id = ? AND deleted_at IS NULL LIMIT 1", [id]);
    const current = rows[0];
    if (!current) throw new Error("Product was not found");
    const reorder = nextReorderLevel == null ? number(current.reorder_level, 0) : Math.max(0, number(nextReorderLevel, 0));
    await dbQuery("UPDATE products SET stock_quantity = ?, reorder_level = ? WHERE id = ?", [stock, reorder, id]);
    await logStockChange(req, id, targetBucket, current.stock_quantity, stock, current.reorder_level, reorder, adjustmentType, reason);
    return { previousStock: number(current.stock_quantity), stockOnHand: stock, reorderLevel: reorder };
  }

  await ensurePhysicalStockRows(id);
  const rows = await dbQuery(
    "SELECT stock_on_hand, reorder_level FROM product_stock_counts WHERE product_id = ? AND bucket = ? LIMIT 1",
    [id, targetBucket]
  );
  const current = rows[0] || { stock_on_hand: 0, reorder_level: 0 };
  const reorder = nextReorderLevel == null ? number(current.reorder_level, 0) : Math.max(0, number(nextReorderLevel, 0));
  await dbQuery(
    `INSERT INTO product_stock_counts (product_id, bucket, stock_on_hand, reserved_stock, reorder_level)
     VALUES (?, ?, ?, 0, ?)
     ON DUPLICATE KEY UPDATE stock_on_hand = VALUES(stock_on_hand), reorder_level = VALUES(reorder_level)`,
    [id, targetBucket, stock, reorder]
  );
  await logStockChange(req, id, targetBucket, current.stock_on_hand, stock, current.reorder_level, reorder, adjustmentType, reason);
  return { previousStock: number(current.stock_on_hand), stockOnHand: stock, reorderLevel: reorder };
}

async function orderDispatchQuantities(orderId) {
  const rows = await dbQuery(
    "SELECT product_id, quantity, item_type, bundle_items FROM order_items WHERE order_id = ?",
    [orderId]
  );
  const quantities = new Map();
  for (const row of rows) {
    const rowQuantity = Math.max(1, number(row.quantity, 1));
    if (number(row.product_id)) {
      quantities.set(number(row.product_id), (quantities.get(number(row.product_id)) || 0) + rowQuantity);
    }
    const bundleItems = parseJson(row.bundle_items, []);
    if (Array.isArray(bundleItems)) {
      for (const item of bundleItems) {
        const productId = number(item.product_id || item.productId || item.id);
        if (!productId) continue;
        const itemQuantity = Math.max(1, number(item.quantity || item.qty, 1));
        quantities.set(productId, (quantities.get(productId) || 0) + rowQuantity * itemQuantity);
      }
    }
  }
  return quantities;
}

async function deductDispatchStock(req, orderId, source) {
  const bucket = stockBucket(source);
  if (!["warehouse", "shop"].includes(bucket)) {
    throw new Error("Select Warehouse or Shop stock source before dispatching this order");
  }
  const quantities = await orderDispatchQuantities(orderId);
  for (const [productId] of quantities.entries()) {
    await ensurePhysicalStockRows(productId);
  }

  const shortages = [];
  for (const [productId, quantity] of quantities.entries()) {
    const rows = await dbQuery(
      `SELECT p.name, COALESCE(psc.stock_on_hand, 0) AS stock_on_hand
       FROM products p
       LEFT JOIN product_stock_counts psc
         ON psc.product_id = p.id AND psc.bucket = ?
       WHERE p.id = ?
       LIMIT 1`,
      [bucket, productId]
    );
    const stock = rows[0];
    if (!stock || number(stock.stock_on_hand) < quantity) {
      shortages.push(`${stock?.name || `Product ${productId}`}: available ${number(stock?.stock_on_hand)}, required ${quantity}`);
    }
  }
  if (shortages.length) {
    throw new Error(`Insufficient ${bucket} stock. ${shortages.join("; ")}`);
  }

  for (const [productId, quantity] of quantities.entries()) {
    const rows = await dbQuery(
      "SELECT stock_on_hand, reorder_level FROM product_stock_counts WHERE product_id = ? AND bucket = ? LIMIT 1",
      [productId, bucket]
    );
    const current = rows[0] || { stock_on_hand: 0, reorder_level: 0 };
    await setProductStock(
      req,
      productId,
      bucket,
      number(current.stock_on_hand) - quantity,
      number(current.reorder_level, 0),
      "dispatch",
      `Order ${orderId} dispatch`
    );
  }
  return bucket;
}

async function descendantCategoryIds(categoryId) {
  const id = number(categoryId);
  if (!id) return [];

  const rows = await dbQuery(
    `
      WITH RECURSIVE category_tree AS (
        SELECT id FROM categories WHERE id = ?
        UNION ALL
        SELECT c.id
        FROM categories c
        INNER JOIN category_tree ct ON c.parent_id = ct.id
      )
      SELECT DISTINCT id FROM category_tree
    `,
    [id]
  );

  return rows.map((row) => number(row.id)).filter(Boolean);
}

async function catalogQueryParts(catalog, query = {}) {
  const key = catalogKey(catalog);
  const config = catalogConfig[key];
  const values = [];
  const where = ["p.deleted_at IS NULL"];
  const q = clean(query.q);

  if (q) {
    where.push("(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR c.name LIKE ? OR b.name LIKE ?)");
    values.push(...Array(5).fill(`%${q}%`));
  }
  if (query.categoryId) {
    const categoryIds = await descendantCategoryIds(query.categoryId);
    if (categoryIds.length) {
      where.push("p.category_id IN (?)");
      values.push(categoryIds);
    }
  }
  if (["1", "true", "yes"].includes(clean(query.uncategorized).toLowerCase())) {
    where.push("p.category_id IS NULL");
  }
  if (query.brandId) {
    where.push("p.brand_id = ?");
    values.push(number(query.brandId));
  }
  if (query.status) {
    where.push("p.status = ?");
    values.push(clean(query.status));
  }
  const selectedStockExpression =
    key === "warehouse"
      ? "COALESCE(warehouse_stock.stock_on_hand, 0)"
      : key === "store"
      ? "COALESCE(shop_stock.stock_on_hand, 0)"
      : "COALESCE(p.stock_quantity, 0)";
  const stockStatus = clean(query.stockStatus).toLowerCase();
  const physicalTotalExpression = "(COALESCE(warehouse_stock.stock_on_hand, 0) + COALESCE(shop_stock.stock_on_hand, 0))";
  const busyStockExpression = "COALESCE(p.stock_quantity, 0)";
  if (stockStatus === "in_stock") where.push(`${selectedStockExpression} > 0`);
  if (stockStatus === "out_of_stock") where.push(`${selectedStockExpression} <= 0`);
  if (stockStatus === "low_stock") where.push(`${selectedStockExpression} <= ${config.reorder}`);
  if (["mismatch", "mismatched", "unbalanced"].includes(stockStatus)) where.push(`${busyStockExpression} <> ${physicalTotalExpression}`);
  if (["balanced", "matched"].includes(stockStatus)) where.push(`${busyStockExpression} = ${physicalTotalExpression}`);
  if (["zero", "zero_stock", "zero_busy", "zero_website"].includes(stockStatus)) where.push(`${busyStockExpression} <= 0`);
  const ids = clean(query.ids).split(",").map(number).filter(Boolean);
  if (ids.length) {
    where.push("p.id IN (?)");
    values.push(ids);
  }

  const stock = config.stock;
  const reserved = config.reserved || "0";
  const reorder = config.reorder;
  const price = config.price;
  const join = `
    LEFT JOIN product_stock_counts warehouse_stock
      ON warehouse_stock.product_id = p.id AND warehouse_stock.bucket = 'warehouse'
    LEFT JOIN product_stock_counts shop_stock
      ON shop_stock.product_id = p.id AND shop_stock.bucket = 'shop'
  `;
  const group = "";
  const base = `
    FROM ${config.table} p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN brands b ON b.id = p.brand_id
    ${join}
    WHERE ${where.join(" AND ")}
  `;
  return { key, config, values, base, stock: config.stock, reserved: config.reserved || "0", reorder: config.reorder, price: config.price };
}

async function catalogRows(catalog, query = {}) {
  const { page, limit, offset } = pagination(query);
  const { values, base, stock, reserved, reorder, price } = await catalogQueryParts(catalog, query);
  const rows = await dbQuery(
    `SELECT p.*, c.name AS category_name, b.name AS brand_name, ${price} AS display_price,
      ${stock} AS stock_on_hand, ${reserved} AS reserved_stock, ${reorder} AS reorder_level,
      COALESCE(p.stock_quantity, 0) AS busy_stock,
      COALESCE(p.stock_quantity, 0) AS website_stock,
      COALESCE(warehouse_stock.stock_on_hand, 0) AS warehouse_stock,
      COALESCE(shop_stock.stock_on_hand, 0) AS shop_stock,
      COALESCE(warehouse_stock.stock_on_hand, 0) + COALESCE(shop_stock.stock_on_hand, 0) AS physical_total,
      CASE WHEN COALESCE(p.stock_quantity, 0) = (COALESCE(warehouse_stock.stock_on_hand, 0) + COALESCE(shop_stock.stock_on_hand, 0)) THEN 1 ELSE 0 END AS is_balanced,
      CASE WHEN COALESCE(p.stock_quantity, 0) <= 0 THEN 1 ELSE 0 END AS is_zero_stock,
      CASE WHEN ${stock} <= ${reorder} THEN 1 ELSE 0 END AS is_low_stock,
      COALESCE(p.reorder_level, 0) AS website_reorder_level,
      COALESCE(warehouse_stock.reorder_level, p.reorder_level, 0) AS warehouse_reorder_level,
      COALESCE(shop_stock.reorder_level, p.reorder_level, 0) AS shop_reorder_level
     ${base}
     ORDER BY p.updated_at DESC, p.id DESC LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );
  const countRows = await dbQuery(`SELECT COUNT(DISTINCT p.id) AS total ${base}`, values);
  return {
    rows: rows.map((row) => ({
      ...row,
      busyStock: number(row.busy_stock),
      websiteStock: number(row.website_stock),
      warehouseStock: number(row.warehouse_stock),
      shopStock: number(row.shop_stock),
      physicalTotal: number(row.physical_total),
      isBalanced: Boolean(number(row.is_balanced)),
      isZeroStock: Boolean(number(row.is_zero_stock)),
      isLowStock: Boolean(number(row.is_low_stock)),
      reorderLevel: number(row.reorder_level),
    })),
    pagination: { page, limit, total: number(countRows[0]?.total) },
  };
}

async function catalogSummary(catalog, query = {}) {
  const { values, base, stock, reserved, reorder } = await catalogQueryParts(catalog, query);
  const rows = await dbQuery(
    `SELECT
      COUNT(DISTINCT p.id) AS listed_products,
      COALESCE(SUM(${stock}), 0) AS total_stock,
      COALESCE(SUM(${reserved}), 0) AS reserved_stock,
      SUM(CASE WHEN ${stock} <= ${reorder} THEN 1 ELSE 0 END) AS low_stock,
      SUM(CASE WHEN COALESCE(p.stock_quantity, 0) <> (COALESCE(warehouse_stock.stock_on_hand, 0) + COALESCE(shop_stock.stock_on_hand, 0)) THEN 1 ELSE 0 END) AS mismatched,
      SUM(CASE WHEN COALESCE(p.stock_quantity, 0) = (COALESCE(warehouse_stock.stock_on_hand, 0) + COALESCE(shop_stock.stock_on_hand, 0)) THEN 1 ELSE 0 END) AS balanced,
      SUM(CASE WHEN COALESCE(p.stock_quantity, 0) <= 0 THEN 1 ELSE 0 END) AS zero_stock,
      SUM(CASE WHEN p.category_id IS NULL THEN 1 ELSE 0 END) AS uncategorized
     ${base}`,
    values
  );
  const row = rows[0] || {};
  return {
    listedProducts: number(row.listed_products),
    totalStock: number(row.total_stock),
    reservedStock: number(row.reserved_stock),
    lowStock: number(row.low_stock),
    mismatched: number(row.mismatched),
    balanced: number(row.balanced),
    zeroStock: number(row.zero_stock),
    uncategorized: number(row.uncategorized),
  };
}

async function allCatalogRows(catalog, query = {}) {
  const rows = [];
  let page = 1;
  let total = 0;
  do {
    const result = await catalogRows(catalog, { ...query, page, limit: 100 });
    rows.push(...result.rows);
    total = result.pagination.total;
    page += 1;
  } while (rows.length < total);
  return rows;
}

const PRODUCT_IMPORT_EXPORT_COLUMNS = [
  ["Handle", "handle", 28],
  ["Title", "title", 42],
  ["Body (HTML)", "body_html", 46],
  ["Vendor", "vendor", 22],
  ["Brand", "brand", 22],
  ["Product Category", "product_category", 44],
  ["Type", "type", 22],
  ["Tags", "tags", 34],
  ["Published", "published", 14],
  ["Option1 Name", "option1_name", 18],
  ["Option1 Value", "option1_value", 18],
  ["Option2 Name", "option2_name", 18],
  ["Option2 Value", "option2_value", 18],
  ["Option3 Name", "option3_name", 18],
  ["Option3 Value", "option3_value", 18],
  ["Variant SKU", "variant_sku", 24],
  ["Busy Stock", "busy_stock", 18],
  ["Warehouse Stock", "warehouse_stock", 18],
  ["Shop Stock", "shop_stock", 18],
  ["Variant Price", "variant_price", 16],
  ["Variant Compare At Price", "variant_compare_at_price", 18],
  ["Variant Barcode", "variant_barcode", 22],
  ["Image Src", "image_src", 42],
  ["Image Position", "image_position", 14],
  ["Image Alt Text", "image_alt_text", 30],
  ["HEIGHT (product.metafields.custom.height)", "height", 18],
  ["LENGTH (product.metafields.custom.length)", "length", 18],
  ["WIDTH (product.metafields.custom.width)", "width", 18],
  ["Variant Image", "variant_image", 42],
  ["Variant Weight Unit", "variant_weight_unit", 14],
  ["Cost per item", "cost_per_item", 16],
  ["Reorder Level", "reorder_level", 16],
  ["Status", "status", 14],
  ["ID", "id", 14],
];

function dimensionValue(dimensions, key) {
  const parsed = parseJson(dimensions, {});
  if (!parsed || typeof parsed !== "object") return "";
  return parsed[key] ?? parsed[key === "width" ? "breadth" : key] ?? "";
}

async function categoryPath(categoryId, fallbackName = "") {
  const id = number(categoryId);
  if (!id) return clean(fallbackName);

  const rows = await dbQuery(
    `
      WITH RECURSIVE category_path AS (
        SELECT id, parent_id, name, 0 AS depth
        FROM categories
        WHERE id = ?
        UNION ALL
        SELECT c.id, c.parent_id, c.name, cp.depth + 1
        FROM categories c
        JOIN category_path cp ON cp.parent_id = c.id
      )
      SELECT name FROM category_path ORDER BY depth DESC
    `,
    [id]
  );

  return rows.map((row) => row.name).filter(Boolean).join(" > ") || clean(fallbackName);
}

async function productTags(productIds) {
  if (!productIds.length) return new Map();
  const rows = await dbQuery(
    `
      SELECT pt.product_id, GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR ', ') AS tags
      FROM product_tags pt
      JOIN tags t ON t.id = pt.tag_id
      WHERE pt.product_id IN (?)
      GROUP BY pt.product_id
    `,
    [productIds]
  );
  return new Map(rows.map((row) => [number(row.product_id), row.tags || ""]));
}

async function productImages(productIds) {
  if (!productIds.length) return new Map();
  const rows = await dbQuery(
    `
      SELECT
        id,
        product_id,
        image_url,
        COALESCE(NULLIF(sort_order, 0), id) AS position,
        alt_text
      FROM product_images
      WHERE product_id IN (?)
      ORDER BY product_id, id
    `,
    [productIds]
  );
  const grouped = new Map();
  rows.forEach((row) => {
    const key = number(row.product_id);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  });
  return grouped;
}

async function productVariants(productIds) {
  if (!productIds.length) return new Map();
  const rows = await dbQuery(
    `
      SELECT
        pv.*,
        GROUP_CONCAT(
          DISTINCT
          CASE
            WHEN vo.id IS NULL THEN NULL
            ELSE CONCAT_WS('::', vo.name, vov.value)
          END
          ORDER BY vo.id
          SEPARATOR '||'
        ) AS options_text
      FROM product_variants pv
      LEFT JOIN variant_attribute_map vam ON vam.variant_id = pv.id
      LEFT JOIN variant_options vo ON vo.id = vam.option_id
      LEFT JOIN variant_option_values vov ON vov.id = vam.value_id
      WHERE pv.product_id IN (?)
      GROUP BY pv.id
      ORDER BY pv.product_id, pv.is_default DESC, pv.id
    `,
    [productIds]
  );
  const grouped = new Map();
  rows.forEach((row) => {
    const key = number(row.product_id);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  });
  return grouped;
}

function variantOptions(row) {
  return clean(row.options_text)
    .split("||")
    .map((part) => {
      const [name, value] = part.split("::");
      return name && value ? { name, value } : null;
    })
    .filter(Boolean)
    .slice(0, 3);
}

async function websiteProductExportRows(products) {
  const ids = products.map((product) => number(product.id)).filter(Boolean);
  const [tagsByProduct, imagesByProduct, variantsByProduct] = await Promise.all([
    productTags(ids),
    productImages(ids),
    productVariants(ids),
  ]);
  const pathCache = new Map();
  const rows = [];

  for (const product of products) {
    if (!pathCache.has(number(product.category_id))) {
      pathCache.set(
        number(product.category_id),
        await categoryPath(product.category_id, product.category_name)
      );
    }
    const productCategoryPath = pathCache.get(number(product.category_id)) || "";
    const images = imagesByProduct.get(number(product.id)) || [];
    const variants = variantsByProduct.get(number(product.id)) || [];
    const exportVariants = variants.length ? variants : [{
      sku: product.sku,
      barcode: product.barcode,
      price: product.price,
      compare_price: "",
      cost_price: "",
      stock: product.stock_quantity,
      weight: product.weight,
      weight_unit: product.weight_unit,
      dimensions: product.dimensions,
      image: product.image,
      status: product.status,
      options_text: "",
    }];

    exportVariants.forEach((variant, index) => {
      const optionValues = variantOptions(variant);
      const imageRow = images[index] || images[0] || {};
      const dimensions = variant.dimensions || product.dimensions;
      rows.push({
        handle: product.sku || product.slug || product.id,
        title: product.name,
        body_html: product.description || "",
        vendor: "Golden Creation",
        brand: product.brand_name || "",
        product_category: productCategoryPath,
        type: product.type || product.category_name || "",
        tags: tagsByProduct.get(number(product.id)) || "",
        published: String(product.status || "Active").toLowerCase() === "active" ? "TRUE" : "FALSE",
        option1_name: optionValues[0]?.name || "",
        option1_value: optionValues[0]?.value || "",
        option2_name: optionValues[1]?.name || "",
        option2_value: optionValues[1]?.value || "",
        option3_name: optionValues[2]?.name || "",
        option3_value: optionValues[2]?.value || "",
        variant_sku: variant.sku || product.sku || "",
        busy_stock: number(variant.stock ?? product.stock_quantity),
        warehouse_stock: number(product.warehouse_stock),
        shop_stock: number(product.shop_stock),
        variant_price: number(variant.price ?? product.price),
        variant_compare_at_price: variant.compare_price || "",
        variant_barcode: variant.barcode || product.barcode || "",
        image_src: imageRow.image_url || product.image || "",
        image_position: imageRow.position || index + 1,
        image_alt_text: imageRow.alt_text || product.name || "",
        height: dimensionValue(dimensions, "height"),
        length: dimensionValue(dimensions, "length"),
        width: dimensionValue(dimensions, "width"),
        variant_image: variant.image || imageRow.image_url || product.image || "",
        variant_weight_unit: variant.weight_unit || product.weight_unit || "",
        cost_per_item: variant.cost_price || "",
        reorder_level: number(product.reorder_level || 0),
        status: product.status || "Active",
        id: product.id,
      });
    });
  }

  return rows;
}

export async function getCatalogInventory(req, res) {
  try {
    const catalog = catalogKey(req.query.catalog);
    const [payload, summary] = await Promise.all([
      catalogRows(catalog, req.query),
      catalogSummary(catalog, req.query),
    ]);
    res.json({
      catalog,
      summary,
      products: payload.rows,
      pagination: payload.pagination,
    });
  } catch (error) {
    respondError(res, error, "Failed to load catalog inventory");
  }
}

export async function getProductStockDetail(req, res) {
  const id = number(req.params.id);
  if (!id) return res.status(400).json({ message: "Valid product is required" });

  try {
    await ensurePhysicalStockRows(id);
    const payload = await catalogRows("website", { ids: String(id), limit: 1 });
    const product = payload.rows[0];
    if (!product) return res.status(404).json({ message: "Product was not found" });
    const auditLogs = await dbQuery(
      `SELECT id, bucket, previous_stock, new_stock, previous_reorder_level, new_reorder_level,
              adjustment_type, quantity_delta, reason, actor, created_at
       FROM product_stock_audit_logs
       WHERE product_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 25`,
      [id]
    );
    res.json({ product, auditLogs });
  } catch (error) {
    respondError(res, error, "Failed to load product stock");
  }
}

export async function updateProductStock(req, res) {
  const id = number(req.params.id);
  const bucket = stockBucket(req.body?.bucket);
  const mode = clean(req.body?.mode || "set").toLowerCase();
  if (!id || !bucket || !["set", "increase", "decrease"].includes(mode)) {
    return res.status(400).json({ message: "Product, bucket, and adjustment mode are required" });
  }

  try {
    await ensurePhysicalStockRows(id);
    const rows =
      bucket === "website"
        ? await dbQuery("SELECT stock_quantity AS stock_on_hand, reorder_level FROM products WHERE id = ? AND deleted_at IS NULL LIMIT 1", [id])
        : await dbQuery("SELECT stock_on_hand, reorder_level FROM product_stock_counts WHERE product_id = ? AND bucket = ? LIMIT 1", [id, bucket]);
    const current = rows[0];
    if (!current) return res.status(404).json({ message: "Product stock was not found" });

    const currentStock = number(current.stock_on_hand);
    const quantity = Math.max(0, number(req.body?.quantity ?? req.body?.delta ?? 0));
    let nextStock = currentStock;
    if (mode === "set") nextStock = Math.max(0, number(req.body?.stockOnHand ?? req.body?.stock_on_hand ?? req.body?.stock));
    if (mode === "increase") nextStock = currentStock + quantity;
    if (mode === "decrease") nextStock = currentStock - quantity;
    if (nextStock < 0) {
      return res.status(400).json({ message: `${catalogConfig[bucket === "shop" ? "store" : bucket]?.label || bucket} stock cannot go below zero` });
    }

    const reorderLevel = req.body?.reorderLevel ?? req.body?.reorder_level;
    await setProductStock(
      req,
      id,
      bucket,
      nextStock,
      reorderLevel === undefined || reorderLevel === null || reorderLevel === "" ? null : number(reorderLevel, 0),
      mode,
      req.body?.reason || "Inventory adjustment"
    );
    await refreshLowStockNotifications();
    await logActivity(req, "Updated stock", "Inventory", `Product ${id}: ${bucket} ${currentStock} -> ${nextStock}`);
    const detail = await catalogRows("website", { ids: String(id), limit: 1 });
    res.json({ message: "Stock updated", product: detail.rows[0] });
  } catch (error) {
    if (error?.message?.includes("required") || error?.message?.includes("not found")) {
      return res.status(400).json({ message: error.message });
    }
    respondError(res, error, "Failed to update product stock");
  }
}

export async function getLookups(req, res) {
  const type = clean(req.params.type).toLowerCase();
  const q = clean(req.query.q);
  const like = `%${q}%`;
  const { page, limit, offset } = pagination(req.query);
  try {
    let rows = [];
    let total = 0;
    if (type === "products") {
      const payload = await catalogRows(req.query.catalog, req.query);
      rows = payload.rows.map((row) => ({ id: row.id, label: row.name, subtitle: [row.sku, row.category_name, row.brand_name].filter(Boolean).join(" - "), value: `${catalogKey(req.query.catalog)}:${row.id}`, catalog: catalogKey(req.query.catalog), sku: row.sku || "", price: number(row.display_price) }));
      total = payload.pagination.total;
    } else {
      const map = {
        categories: ["categories", "name", "status = 'Active'", "name", ""],
        collections: ["collections", "name", "deleted_at IS NULL AND status = 'Active'", "name", "slug"],
        brands: ["brands", "name", "deleted_at IS NULL AND status = 'Active'", "name", "slug"],
        customers: ["users", "COALESCE(name, email, phone)", "1=1", "COALESCE(name, email, phone)", "email, phone"],
        orders: ["orders", "order_number", "1=1", "order_number", "customer_name, customer_email, customer_phone, street_address, city, state, zip_code, tax_amount, total_amount"],
        suppliers: ["suppliers", "name", "status <> 'Blocked'", "name", ""],
        staff: ["admins", "name", "status = 'Active'", "name", ""],
      };
      const config = map[type];
      if (!config) return res.status(404).json({ message: "Lookup type not found" });
      const [table, label, where, searchColumn, extraColumns] = config;
      rows = await dbQuery(
        `SELECT id, ${label} AS label${extraColumns ? `, ${extraColumns}` : ""} FROM ${table} WHERE ${where} AND (${searchColumn} LIKE ?) ORDER BY label LIMIT ? OFFSET ?`,
        [like, limit, offset]
      );
      const countRows = await dbQuery(`SELECT COUNT(*) AS total FROM ${table} WHERE ${where} AND (${searchColumn} LIKE ?)`, [like]);
      total = number(countRows[0]?.total);
    }
    res.json({ results: rows, pagination: { page, limit, total } });
  } catch (error) {
    respondError(res, error, "Failed to load lookup results");
  }
}

async function saveOperationalProduct(table, req, res, label) {
  const sku = clean(req.body?.sku);
  const name = clean(req.body?.name);
  if (!sku || !name) return res.status(400).json({ message: "SKU and product name are required" });
  const price = number(req.body?.mrp ?? req.body?.price ?? req.body?.purchasePrice ?? req.body?.purchase_price);
  const categoryId = number(req.body?.categoryId || req.body?.category_id) || null;
  const brandId = number(req.body?.brandId || req.body?.brand_id) || null;
  const reorderLevel = number(req.body?.reorderLevel || req.body?.reorder_level, 0);
  const status = clean(req.body?.status || "Active");
  const specifications = req.body?.specifications ? JSON.stringify(req.body.specifications) : null;
  try {
    const existingRows = await dbQuery(
      "SELECT id FROM products WHERE sku = ? ORDER BY id LIMIT 1",
      [sku]
    );
    if (existingRows[0]) {
      await dbQuery(
        `UPDATE products
         SET barcode = ?, name = ?, description = ?, category_id = ?, brand_id = ?,
             price = ?, reorder_level = ?, specifications = ?, status = ?, deleted_at = NULL
         WHERE id = ?`,
        [
          clean(req.body?.barcode) || null,
          name,
          clean(req.body?.description) || null,
          categoryId,
          brandId,
          price,
          reorderLevel,
          specifications,
          status,
          existingRows[0].id,
        ]
      );
    } else {
      await dbQuery(
        `INSERT INTO products (sku, barcode, name, description, category_id, brand_id, price, reorder_level, specifications, status, stock_quantity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          sku,
          clean(req.body?.barcode) || null,
          name,
          clean(req.body?.description) || null,
          categoryId,
          brandId,
          price,
          reorderLevel,
          specifications,
          status,
        ]
      );
    }
    const rows = await dbQuery("SELECT id, sku, name FROM products WHERE sku = ? LIMIT 1", [sku]);
    await logActivity(req, `Saved ${label} product`, label, `${sku} - ${name}`);
    res.status(201).json({ message: `${label} product saved`, product: rows[0] });
  } catch (error) {
    respondError(res, error, `Failed to save ${label} product`);
  }
}

export function saveWarehouseProduct(req, res) {
  return saveOperationalProduct("warehouse_products", req, res, "Warehouse");
}

export function saveStoreProduct(req, res) {
  return saveOperationalProduct("store_products", req, res, "Store");
}

export async function getOperationalCatalog(req, res) {
  try {
    const catalog = req.params.catalog === "warehouse" ? "warehouse" : "store";
    const payload = await catalogRows(catalog, req.query);
    const movements = await dbQuery(
      catalog === "warehouse"
        ? `SELECT sm.*, COALESCE(p.name, wp.name) AS product_name, COALESCE(p.sku, wp.sku) AS sku
           FROM stock_movements sm
           LEFT JOIN products p ON p.id=sm.product_id
           LEFT JOIN warehouse_products wp ON wp.id=sm.warehouse_product_id
           ORDER BY sm.created_at DESC LIMIT 150`
        : `SELECT sm.*, COALESCE(p.name, sp.name) AS product_name, COALESCE(p.sku, sp.sku) AS sku
           FROM store_movements sm
           LEFT JOIN products p ON p.id=sm.product_id
           LEFT JOIN store_products sp ON sp.id=sm.store_product_id
           ORDER BY sm.created_at DESC LIMIT 150`
    );
    res.json({ catalog, products: payload.rows, pagination: payload.pagination, movements });
  } catch (error) {
    respondError(res, error, "Failed to load operational catalog");
  }
}

export async function saveOperationalStock(req, res) {
  const catalog = req.params.catalog === "warehouse" ? "warehouse" : "store";
  const productId = number(req.body?.productId || req.body?.product_id);
  if (!productId) return res.status(400).json({ message: "Product is required" });
  try {
    await setProductStock(
      req,
      productId,
      catalog === "warehouse" ? "warehouse" : "shop",
      number(req.body?.stockOnHand),
      number(req.body?.reorderLevel, 0),
      "set",
      `${catalog} stock save`
    );
    await refreshLowStockNotifications();
    await logActivity(req, `Saved ${catalog} stock`, catalog, `Product ${productId}`);
    res.json({ message: "Stock saved" });
  } catch (error) {
    respondError(res, error, "Failed to save stock");
  }
}

export async function createOperationalMovement(req, res) {
  const catalog = req.params.catalog === "warehouse" ? "warehouse" : "store";
  const productId = number(req.body?.productId || req.body?.product_id);
  const movementType = clean(req.body?.movementType || req.body?.movement_type);
  const quantity = Math.max(1, number(req.body?.quantity, 1));
  if (!productId || !["Inward", "Outward"].includes(movementType)) return res.status(400).json({ message: "Product and movement type are required" });
  try {
    if (catalog === "warehouse") {
      const warehouseRows = await dbQuery("SELECT id FROM warehouse_locations ORDER BY id LIMIT 1");
      await dbQuery(
        `INSERT INTO stock_movements (product_id, warehouse_product_id, warehouse_id, movement_type, quantity, reference, status, requested_by)
         VALUES (?, NULL, ?, ?, ?, ?, 'Pending', ?)`,
        [productId, warehouseRows[0]?.id, movementType, quantity, clean(req.body?.reference) || null, req.admin?.email || "Staff"]
      );
    } else {
      await dbQuery(
        `INSERT INTO store_movements (product_id, store_product_id, movement_type, quantity, reference, status, requested_by)
         VALUES (?, NULL, ?, ?, ?, 'Pending', ?)`,
        [productId, movementType, quantity, clean(req.body?.reference) || null, req.admin?.email || "Staff"]
      );
    }
    await dbQuery(
      `INSERT INTO admin_notifications (type, title, message, link)
       VALUES ('stock_request', ?, ?, ?)`,
      [`New ${catalog} ${movementType.toLowerCase()} request`, `${quantity} units submitted for approval`, `/${catalog}`]
    );
    await logActivity(req, `Submitted ${catalog} movement`, catalog, `${movementType} ${quantity}`);
    res.status(201).json({ message: "Movement submitted for Super Admin approval" });
  } catch (error) {
    respondError(res, error, "Failed to submit movement");
  }
}

export async function approveOperationalMovement(req, res) {
  if (!isSuperAdmin(req.admin)) return res.status(403).json({ message: "Only Super Admin can approve stock requests" });
  const catalog = req.params.catalog === "warehouse" ? "warehouse" : "store";
  const id = number(req.params.id);
  const status = clean(req.body?.status);
  if (!id || !["Approved", "Rejected"].includes(status)) return res.status(400).json({ message: "Valid approval status is required" });
  try {
    const table = catalog === "warehouse" ? "stock_movements" : "store_movements";
    const rows = await dbQuery(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [id]);
    const movement = rows[0];
    if (!movement || movement.status !== "Pending") return res.status(404).json({ message: "Pending movement not found" });
    if (status === "Approved") {
      const delta = movement.movement_type === "Inward" ? number(movement.quantity) : -number(movement.quantity);
      const canonicalProductId = number(movement.product_id || movement.store_product_id);
      if (!canonicalProductId) {
        return res.status(400).json({ message: "Movement is not linked to a website product" });
      }
      const bucket = catalog === "warehouse" ? "warehouse" : "shop";
      await ensurePhysicalStockRows(canonicalProductId);
      const stockRows = await dbQuery(
        "SELECT stock_on_hand, reorder_level FROM product_stock_counts WHERE product_id = ? AND bucket = ? LIMIT 1",
        [canonicalProductId, bucket]
      );
      const currentStock = number(stockRows[0]?.stock_on_hand);
      const nextStock = currentStock + delta;
      if (nextStock < 0) {
        return res.status(400).json({ message: `Insufficient ${catalog} stock. Available ${currentStock}, requested ${number(movement.quantity)}.` });
      }
      await setProductStock(
        req,
        canonicalProductId,
        bucket,
        nextStock,
        stockRows[0]?.reorder_level ?? null,
        movement.movement_type === "Inward" ? "increase" : "decrease",
        `${catalog} movement ${id}`
      );
    }
    await dbQuery(`UPDATE ${table} SET status=?, approved_by=?, approved_at=NOW() WHERE id=?`, [status, req.admin?.email || "Super Admin", id]);
    await refreshLowStockNotifications();
    await logActivity(req, `${status} ${catalog} movement`, catalog, `Movement ${id}`);
    res.json({ message: `Movement ${status.toLowerCase()}` });
  } catch (error) {
    respondError(res, error, "Failed to update movement");
  }
}

export async function importStoreProducts(req, res) {
  const rows = Array.isArray(req.body?.products) ? req.body.products : [];
  if (!rows.length) return res.status(400).json({ message: "Spreadsheet rows are required" });
  let saved = 0;
  try {
    for (const row of rows) {
      const sku = clean(row.sku || row.SKU || row["Variant SKU"]);
      const name = clean(row.name || row.Name || row.Title);
      if (!sku || !name) continue;
      const existingRows = await dbQuery("SELECT id FROM products WHERE sku=? ORDER BY id LIMIT 1", [sku]);
      const values = [
        clean(row.barcode) || null,
        name,
        clean(row.description) || null,
        number(row.categoryId) || null,
        number(row.brandId) || null,
        number(row.mrp || row.price),
        number(row.reorderLevel, 0),
        clean(row.status || "Active"),
      ];
      let productId = existingRows[0]?.id || null;
      if (existingRows[0]) {
        await dbQuery(
          `UPDATE products
           SET barcode=?, name=?, description=?, category_id=?, brand_id=?, price=?,
               reorder_level=?, status=?, deleted_at=NULL
           WHERE id=?`,
          [...values, existingRows[0].id]
        );
      } else {
        const insertResult = await dbQuery(
          `INSERT INTO products
            (sku, barcode, name, description, category_id, brand_id, price, reorder_level, status, stock_quantity)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [sku, ...values]
        );
        productId = insertResult.insertId;
      }
      if (productId) {
        await setProductStock(
          req,
          productId,
          "shop",
          number(row.stockOnHand || row.stock),
          number(row.reorderLevel, 0),
          "set",
          "Shop spreadsheet import"
        );
      }
      saved += 1;
    }
    await refreshLowStockNotifications();
    await logActivity(req, "Imported Shop products", "Shop", `${saved} rows`);
    res.json({ message: "Shop spreadsheet imported into unified inventory", saved });
  } catch (error) {
    respondError(res, error, "Failed to import Shop spreadsheet");
  }
}

export async function createTask(req, res) {
  if (!isSuperAdmin(req.admin)) return res.status(403).json({ message: "Only Super Admin can assign tasks" });
  const title = clean(req.body?.title);
  const assigneeIds = [...new Set((req.body?.assigneeIds || []).map(number).filter(Boolean))];
  if (!title || !assigneeIds.length) return res.status(400).json({ message: "Task title and staff assignees are required" });
  try {
    const result = await dbQuery("INSERT INTO tasks (title, description, priority, due_at, created_by) VALUES (?, ?, ?, ?, ?)", [title, clean(req.body?.description) || null, clean(req.body?.priority || "Normal"), req.body?.dueAt || null, req.admin?.id || null]);
    for (const staffId of assigneeIds) {
      const assignment = await dbQuery("INSERT INTO task_assignments (task_id, staff_id) VALUES (?, ?)", [result.insertId, staffId]);
      await dbQuery("INSERT INTO task_assignment_history (assignment_id, status, changed_by) VALUES (?, 'Pending', ?)", [assignment.insertId, req.admin?.id || null]);
    }
    await logActivity(req, "Assigned task", "Tasks", title);
    res.status(201).json({ message: "Task assigned", id: result.insertId });
  } catch (error) {
    respondError(res, error, "Failed to assign task");
  }
}

export async function getTasks(req, res) {
  try {
    const staffFilter = isSuperAdmin(req.admin) ? "" : "WHERE ta.staff_id = ?";
    const values = isSuperAdmin(req.admin) ? [] : [req.admin?.id];
    const assignments = await dbQuery(
      `SELECT ta.*, t.title, t.description, t.priority, t.due_at, a.name AS staff_name, a.email AS staff_email,
       (t.due_at IS NOT NULL AND t.due_at < NOW() AND ta.status NOT IN ('Done','Not Completed','Abandoned')) AS is_overdue
       FROM task_assignments ta JOIN tasks t ON t.id=ta.task_id JOIN admins a ON a.id=ta.staff_id
       ${staffFilter} ORDER BY ta.is_unread DESC, t.due_at IS NULL, t.due_at, ta.updated_at DESC`,
      values
    );
    if (!isSuperAdmin(req.admin)) await dbQuery("UPDATE task_assignments SET is_unread=FALSE WHERE staff_id=?", [req.admin?.id]);
    res.json({ assignments, canAssign: isSuperAdmin(req.admin) });
  } catch (error) {
    respondError(res, error, "Failed to load tasks");
  }
}

export async function updateTaskAssignment(req, res) {
  const id = number(req.params.id);
  const status = clean(req.body?.status);
  if (!TASK_STATUSES.includes(status)) return res.status(400).json({ message: "Valid task status is required" });
  try {
    const rows = await dbQuery("SELECT * FROM task_assignments WHERE id=? LIMIT 1", [id]);
    const assignment = rows[0];
    if (!assignment || (!isSuperAdmin(req.admin) && number(assignment.staff_id) !== number(req.admin?.id))) return res.status(404).json({ message: "Task assignment not found" });
    await dbQuery("UPDATE task_assignments SET status=?, remarks=?, completed_at=? WHERE id=?", [status, clean(req.body?.remarks) || null, ["Done", "Not Completed", "Abandoned"].includes(status) ? new Date() : null, id]);
    await dbQuery("INSERT INTO task_assignment_history (assignment_id, status, remarks, changed_by) VALUES (?, ?, ?, ?)", [id, status, clean(req.body?.remarks) || null, req.admin?.id || null]);
    if (["Done", "Not Completed", "Abandoned"].includes(status)) {
      await dbQuery("INSERT INTO admin_notifications (type, title, message, link) VALUES ('task_completed', 'Staff task updated', ?, '/tasks')", [`Assignment ${id} moved to ${status}`]);
    }
    await logActivity(req, "Updated task assignment", "Tasks", `Assignment ${id}: ${status}`);
    res.json({ message: "Task updated" });
  } catch (error) {
    respondError(res, error, "Failed to update task");
  }
}

export async function getHrSummary(req, res) {
  try {
    await ensureHrLiteSchema();
    const ownOnly = !isHrManager(req.admin);
    const where = ownOnly ? "AND a.id = ?" : "";
    const values = ownOnly ? [req.admin?.id] : [];
    const rows = await dbQuery(
      `SELECT a.id, a.name, a.email, a.role, a.status,
       COUNT(ta.id) assigned,
       COALESCE(SUM(ta.status='Done'), 0) done,
       COALESCE(SUM(ta.status='Not Completed'), 0) not_completed,
       COALESCE(SUM(ta.status='Abandoned'), 0) abandoned,
       COALESCE(SUM(ta.status='Pending'), 0) pending,
       COALESCE(SUM(ta.status='Ongoing'), 0) ongoing,
       COALESCE(SUM(t.due_at IS NOT NULL AND t.due_at < NOW() AND ta.status NOT IN ('Done','Not Completed','Abandoned')), 0) overdue,
       COALESCE(SUM(ta.status='Done' AND DATE(ta.completed_at)=CURDATE()), 0) done_today,
       COALESCE(SUM(ta.status='Done' AND YEARWEEK(ta.completed_at,1)=YEARWEEK(CURDATE(),1)), 0) done_week,
       COALESCE(SUM(ta.status='Done' AND YEAR(ta.completed_at)=YEAR(CURDATE()) AND MONTH(ta.completed_at)=MONTH(CURDATE())), 0) done_month
       FROM admins a
       LEFT JOIN task_assignments ta ON ta.staff_id = a.id
       LEFT JOIN tasks t ON t.id=ta.task_id
       WHERE COALESCE(a.status, 'Active') <> 'Deleted'
         AND LOWER(COALESCE(a.role, '')) <> 'affiliate'
         ${where}
       GROUP BY a.id, a.name, a.email, a.role, a.status
       ORDER BY a.name`,
      values
    );

    const attendanceWhere = ownOnly ? "WHERE admin_id = ? AND attendance_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)" : "WHERE attendance_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
    const attendanceRows = await dbQuery(
      `SELECT admin_id,
        COUNT(*) attendance_days,
        COALESCE(SUM(status='Present'), 0) present_days,
        COALESCE(SUM(status='Absent'), 0) absent_days,
        COALESCE(SUM(status='Half Day'), 0) half_days,
        COALESCE(SUM(status='Leave'), 0) leave_days
       FROM staff_attendance
       ${attendanceWhere}
       GROUP BY admin_id`,
      values
    );
    const attendanceMap = new Map(attendanceRows.map((row) => [number(row.admin_id), row]));

    const todayRows = await dbQuery(
      `SELECT a.id AS staff_id, a.name, a.email, a.role, sa.status, sa.check_in, sa.check_out, sa.remarks, sa.updated_at
       FROM admins a
       LEFT JOIN staff_attendance sa ON sa.admin_id = a.id AND sa.attendance_date = CURDATE()
       WHERE COALESCE(a.status, 'Active') <> 'Deleted'
         AND LOWER(COALESCE(a.role, '')) <> 'affiliate'
         ${ownOnly ? "AND a.id = ?" : ""}
       ORDER BY a.name`,
      values
    );

    const staff = rows.map((row) => {
      const assigned = number(row.assigned);
      const done = number(row.done);
      const failed = number(row.not_completed) + number(row.abandoned) + number(row.overdue);
      const attendance = attendanceMap.get(number(row.id)) || {};
      const attendanceDays = number(attendance.attendance_days);
      const presentDays = number(attendance.present_days);
      const halfDays = number(attendance.half_days);
      const attendanceScore = attendanceDays
        ? Math.round(((presentDays + halfDays * 0.5) / attendanceDays) * 100)
        : 0;
      const taskCompletionScore = assigned ? Math.round((done / assigned) * 100) : 100;
      const taskReliabilityScore = assigned ? Math.max(0, Math.round(100 - (failed / assigned) * 100)) : 100;
      const overallScore = Math.round((attendanceScore + taskCompletionScore + taskReliabilityScore) / 3);

      return {
        ...row,
        assigned,
        done,
        not_completed: number(row.not_completed),
        abandoned: number(row.abandoned),
        pending: number(row.pending),
        ongoing: number(row.ongoing),
        overdue: number(row.overdue),
        done_today: number(row.done_today),
        done_week: number(row.done_week),
        done_month: number(row.done_month),
        attendance_days: attendanceDays,
        present_days: presentDays,
        absent_days: number(attendance.absent_days),
        half_days: halfDays,
        leave_days: number(attendance.leave_days),
        attendanceScore,
        taskCompletionScore,
        taskReliabilityScore,
        overallScore,
      };
    });

    const summary = staff.reduce((totals, row) => {
      for (const key of ["assigned", "done", "not_completed", "abandoned", "pending", "ongoing", "overdue", "done_today", "done_week", "done_month", "present_days", "absent_days", "half_days", "leave_days"]) totals[key] += number(row[key]);
      totals.overallScore += number(row.overallScore);
      return totals;
    }, { assigned: 0, done: 0, not_completed: 0, abandoned: 0, pending: 0, ongoing: 0, overdue: 0, done_today: 0, done_week: 0, done_month: 0, present_days: 0, absent_days: 0, half_days: 0, leave_days: 0, overallScore: 0 });
    summary.averageOverallScore = staff.length ? Math.round(summary.overallScore / staff.length) : 0;

    res.json({ summary, staff, todayAttendance: todayRows, attendanceStatuses: ATTENDANCE_STATUSES });
  } catch (error) {
    respondError(res, error, "Failed to load HR summary");
  }
}

export async function saveHrAttendance(req, res) {
  try {
    await ensureHrLiteSchema();
    const ownOnly = !isHrManager(req.admin);
    const staffId = ownOnly ? number(req.admin?.id) : number(req.body?.staffId || req.body?.adminId);
    const date = clean(req.body?.date || req.body?.attendanceDate || new Date().toISOString().slice(0, 10));
    const status = clean(req.body?.status || "Present");
    const checkIn = clean(req.body?.checkIn || req.body?.check_in);
    const checkOut = clean(req.body?.checkOut || req.body?.check_out);
    const remarks = clean(req.body?.remarks);

    if (!staffId) return res.status(400).json({ message: "Staff member is required" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: "Valid attendance date is required" });
    if (!ATTENDANCE_STATUSES.includes(status)) return res.status(400).json({ message: "Valid attendance status is required" });

    const staffRows = await dbQuery(
      "SELECT id, name FROM admins WHERE id = ? AND COALESCE(status, 'Active') <> 'Deleted' LIMIT 1",
      [staffId]
    );
    if (!staffRows.length) return res.status(404).json({ message: "Staff member not found" });

    await dbQuery(
      `INSERT INTO staff_attendance (admin_id, attendance_date, status, check_in, check_out, remarks, marked_by)
       VALUES (?, ?, ?, NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''), ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         check_in = VALUES(check_in),
         check_out = VALUES(check_out),
         remarks = VALUES(remarks),
         marked_by = VALUES(marked_by),
         updated_at = NOW()`,
      [staffId, date, status, checkIn, checkOut, remarks, req.admin?.id || null]
    );

    await logActivity(req, "Marked attendance", "HR Lite", `${staffRows[0].name}: ${status} on ${date}`);
    res.json({ message: "Attendance saved" });
  } catch (error) {
    respondError(res, error, "Failed to save attendance");
  }
}

export async function subscribeNewsletter(req, res) {
  const email = clean(req.body?.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Valid email is required" });
  try {
    await dbQuery(
      `INSERT INTO newsletter_subscribers (email, source, status, unsubscribed_at)
       VALUES (?, ?, 'Subscribed', NULL)
       ON DUPLICATE KEY UPDATE source=VALUES(source), status='Subscribed', unsubscribed_at=NULL`,
      [email, clean(req.body?.source || "website")]
    );
    res.status(201).json({ message: "Subscribed successfully" });
  } catch (error) {
    respondError(res, error, "Failed to subscribe");
  }
}

export async function unsubscribeNewsletter(req, res) {
  const email = clean(req.body?.email || req.query?.email).toLowerCase();
  try {
    await dbQuery("UPDATE newsletter_subscribers SET status='Unsubscribed', unsubscribed_at=NOW() WHERE email=?", [email]);
    res.json({ message: "Unsubscribed successfully" });
  } catch (error) {
    respondError(res, error, "Failed to unsubscribe");
  }
}

export async function getNewsletterSubscribers(req, res) {
  const { page, limit, offset } = pagination(req.query);
  const q = `%${clean(req.query.q)}%`;
  try {
    const rows = await dbQuery("SELECT * FROM newsletter_subscribers WHERE email LIKE ? ORDER BY subscribed_at DESC LIMIT ? OFFSET ?", [q, limit, offset]);
    const countRows = await dbQuery("SELECT COUNT(*) total FROM newsletter_subscribers WHERE email LIKE ?", [q]);
    res.json({ subscribers: rows, pagination: { page, limit, total: number(countRows[0]?.total) } });
  } catch (error) {
    respondError(res, error, "Failed to load subscribers");
  }
}

export async function updateNewsletterSubscriber(req, res) {
  try {
    await dbQuery("UPDATE newsletter_subscribers SET status=?, unsubscribed_at=? WHERE id=?", [clean(req.body?.status || "Subscribed"), clean(req.body?.status) === "Unsubscribed" ? new Date() : null, number(req.params.id)]);
    await logActivity(req, "Updated newsletter subscriber", "Newsletter", `Subscriber ${number(req.params.id)}: ${clean(req.body?.status || "Subscribed")}`);
    res.json({ message: "Subscriber updated" });
  } catch (error) {
    respondError(res, error, "Failed to update subscriber");
  }
}

async function blogRows({ publicOnly = false, query = {} } = {}) {
  const { page, limit, offset } = pagination(query);
  const values = [];
  const where = [];
  if (publicOnly) where.push("status='Published'");
  if (query.q) {
    where.push("(title LIKE ? OR excerpt LIKE ? OR content LIKE ? OR category LIKE ?)");
    values.push(...Array(4).fill(`%${clean(query.q)}%`));
  }
  if (query.category) {
    where.push("category=?");
    values.push(clean(query.category));
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await dbQuery(`SELECT * FROM blog_posts ${whereSql} ORDER BY featured DESC, COALESCE(published_at, created_at) DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
  const countRows = await dbQuery(`SELECT COUNT(*) total FROM blog_posts ${whereSql}`, values);
  return {
    rows: rows.map((row) => ({
      ...row,
      tags: parseJson(row.tags, []),
      media_gallery: parseJson(row.media_gallery, []),
    })),
    pagination: { page, limit, total: number(countRows[0]?.total) },
  };
}

export async function getPublicBlog(req, res) {
  try {
    const result = await blogRows({ publicOnly: true, query: req.query });
    res.json({ posts: result.rows, featured: result.rows.find((post) => post.featured) || result.rows[0] || null, pagination: result.pagination });
  } catch (error) {
    respondError(res, error, "Failed to load blog");
  }
}

export async function getPublicBlogPost(req, res) {
  try {
    const rows = await dbQuery("SELECT * FROM blog_posts WHERE slug=? AND status='Published' LIMIT 1", [slugify(req.params.slug)]);
    if (!rows.length) return res.status(404).json({ message: "Blog post not found" });
    res.json({
      post: {
        ...rows[0],
        tags: parseJson(rows[0].tags, []),
        media_gallery: parseJson(rows[0].media_gallery, []),
      },
    });
  } catch (error) {
    respondError(res, error, "Failed to load blog post");
  }
}

export async function getAdminBlogPosts(req, res) {
  try {
    const result = await blogRows({ query: req.query });
    res.json({ articles: result.rows, pagination: result.pagination });
  } catch (error) {
    respondError(res, error, "Failed to load blog posts");
  }
}

export async function saveAdminBlogPost(req, res) {
  const id = number(req.params.id);
  const title = clean(req.body?.title);
  if (!title) return res.status(400).json({ message: "Blog title is required" });
  const status = clean(req.body?.status || "Draft");
  const values = [
    slugify(req.body?.slug || title), title, clean(req.body?.excerpt || req.body?.desc), clean(req.body?.content || req.body?.desc),
    clean(req.body?.coverImage || req.body?.cover_image || req.body?.image),
    clean(req.body?.featuredMediaType || req.body?.featured_media_type) === "video" ? "video" : "image",
    clean(req.body?.featuredVideoUrl || req.body?.featured_video_url),
    clean(req.body?.videoPoster || req.body?.video_poster),
    JSON.stringify(req.body?.mediaGallery || req.body?.media_gallery || []),
    clean(req.body?.category), JSON.stringify(req.body?.tags || []),
    Boolean(req.body?.featured), status, clean(req.body?.author || req.admin?.name || "Golden Creation"), status === "Published" ? new Date() : null,
    clean(req.body?.metaTitle || req.body?.meta_title),
    clean(req.body?.metaDescription || req.body?.meta_description),
    clean(req.body?.canonicalUrl || req.body?.canonical_url),
    clean(req.body?.robotsDirective || req.body?.robots_directive || "index,follow"),
    clean(req.body?.ogImage || req.body?.og_image),
    clean(req.body?.focusKeyword || req.body?.focus_keyword),
    clean(req.body?.schemaOverrideJson || req.body?.schema_override_json),
  ];
  try {
    if (id) {
      await dbQuery("UPDATE blog_posts SET slug=?, title=?, excerpt=?, content=?, cover_image=?, featured_media_type=?, featured_video_url=?, video_poster=?, media_gallery=?, category=?, tags=?, featured=?, status=?, author=?, published_at=COALESCE(?, published_at), meta_title=?, meta_description=?, canonical_url=?, robots_directive=?, og_image=?, focus_keyword=?, schema_override_json=? WHERE id=?", [...values, id]);
    } else {
      await dbQuery("INSERT INTO blog_posts (slug,title,excerpt,content,cover_image,featured_media_type,featured_video_url,video_poster,media_gallery,category,tags,featured,status,author,published_at,meta_title,meta_description,canonical_url,robots_directive,og_image,focus_keyword,schema_override_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", values);
    }
    await logActivity(req, id ? "Updated blog post" : "Created blog post", "Blog", title);
    res.status(id ? 200 : 201).json({ message: "Blog post saved" });
  } catch (error) {
    respondError(res, error, "Failed to save blog post");
  }
}

export async function deleteAdminBlogPostPersistent(req, res) {
  try {
    await dbQuery("DELETE FROM blog_posts WHERE id=?", [number(req.params.id)]);
    await logActivity(req, "Deleted blog post", "Blog", `Post ${req.params.id}`);
    res.json({ message: "Blog post deleted" });
  } catch (error) {
    respondError(res, error, "Failed to delete blog post");
  }
}

export async function updateShipment(req, res) {
  const id = number(req.params.id);
  const status = clean(req.body?.status);
  if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ message: "Valid order status is required" });
  try {
    const orderRows = await dbQuery("SELECT id, physical_stock_deducted_at, fulfillment_stock_source FROM orders WHERE id = ? LIMIT 1", [id]);
    const order = orderRows[0];
    if (!order) return res.status(404).json({ message: "Order not found" });

    let fulfillmentSource = stockBucket(req.body?.fulfillmentStockSource || req.body?.fulfillment_stock_source);
    if (status === "Dispatched" && !order.physical_stock_deducted_at) {
      try {
        fulfillmentSource = await deductDispatchStock(req, id, fulfillmentSource);
      } catch (error) {
        return res.status(400).json({ message: error.message });
      }
    }

    await dbQuery(
      `UPDATE orders
       SET order_status=?,
           tracking_url=?,
           logistics_provider=?,
           delivered_at=CASE WHEN ? = 'Delivered' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
           fulfillment_stock_source=CASE
             WHEN ? = 'Dispatched' AND ? <> '' THEN ?
             ELSE fulfillment_stock_source
           END,
           physical_stock_deducted_at=CASE
             WHEN ? = 'Dispatched' AND physical_stock_deducted_at IS NULL THEN NOW()
             ELSE physical_stock_deducted_at
           END
       WHERE id=?`,
      [
        status,
        clean(req.body?.trackingUrl) || null,
        clean(req.body?.logisticsProvider) || null,
        status,
        status,
        fulfillmentSource,
        fulfillmentSource,
        status,
        id,
      ]
    );
    await dbQuery(
      "INSERT INTO order_status_history (order_id,status,tracking_url,logistics_provider,fulfillment_stock_source,changed_by) VALUES (?,?,?,?,?,?)",
      [id, status, clean(req.body?.trackingUrl) || null, clean(req.body?.logisticsProvider) || null, status === "Dispatched" ? fulfillmentSource || order.fulfillment_stock_source || null : null, req.admin?.email || "Admin"]
    );
    if (status === "Cancelled") {
      await reverseOrderCommissions(id, "Order cancelled").catch((error) => {
        console.log("Commission reversal skipped:", error.message);
      });
    }
    if (status === "Delivered") {
      await releaseEligibleCommissions().catch((error) => {
        console.log("Commission release skipped:", error.message);
      });
    }
    await logActivity(req, "Updated order shipment", "Orders", `Order ${id}: ${status}`);
    res.json({ message: "Shipment updated" });
  } catch (error) {
    respondError(res, error, "Failed to update shipment");
  }
}

export async function createReturnRequest(req, res) {
  const orderNumber = clean(req.body?.orderNumber);
  const requestType = clean(req.body?.requestType);
  const reason = clean(req.body?.reason);
  if (!["Return", "Replacement"].includes(requestType) || !reason) return res.status(400).json({ message: "Request type and reason are required" });
  try {
    const orderRows = await dbQuery("SELECT * FROM orders WHERE order_number=? LIMIT 1", [orderNumber]);
    const order = orderRows[0];
    if (!order) return res.status(404).json({ message: "Order not found" });
    const isPanel = Boolean(req.admin);
    const email = clean(req.body?.email).toLowerCase();
    const phone = clean(req.body?.phone);
    const ownsOrder = req.customer
      ? number(order.user_id) === number(req.customer.id)
      : (email && email === clean(order.customer_email).toLowerCase()) ||
        (phone && phone === clean(order.customer_phone));
    if (!isPanel && !ownsOrder) return res.status(404).json({ message: "Order not found" });
    const deliveredAt = order.delivered_at ? new Date(order.delivered_at) : null;
    const elapsedDays = deliveredAt ? (Date.now() - deliveredAt.getTime()) / 86400000 : Infinity;
    if (!isPanel && (order.order_status !== "Delivered" || elapsedDays > 10)) return res.status(400).json({ message: "Returns and replacements can be requested within 10 days of delivery" });
    const result = await dbQuery("INSERT INTO return_requests (order_id,request_type,reason,internal_remarks,requested_by) VALUES (?,?,?,?,?)", [order.id, requestType, reason, isPanel ? clean(req.body?.internalRemarks) || null : null, isPanel ? req.admin?.email : clean(req.body?.email || req.body?.phone)]);
    await dbQuery("INSERT INTO return_request_history (request_id,status,internal_remarks,changed_by) VALUES (?,'Requested',?,?)", [result.insertId, isPanel ? clean(req.body?.internalRemarks) || null : null, isPanel ? req.admin?.email : "Customer"]);
    res.status(201).json({ message: `${requestType} request created`, id: result.insertId });
  } catch (error) {
    respondError(res, error, "Failed to create request");
  }
}

export async function getCustomerReturns(req, res) {
  const userId = number(req.customer?.id);
  const email = clean(req.query.email);
  const phone = clean(req.query.phone);
  try {
    const rows = await dbQuery(
      `SELECT rr.id, rr.request_type, rr.status, rr.reason, rr.created_at, rr.updated_at, o.order_number
       FROM return_requests rr JOIN orders o ON o.id=rr.order_id
       WHERE (? > 0 AND o.user_id = ?)
          OR (
            ? = 0
            AND (
              (?<>'' AND o.customer_email=?)
              OR (?<>'' AND o.customer_phone=?)
            )
          )
       ORDER BY rr.updated_at DESC`,
      [userId, userId, userId, email, email, phone, phone]
    );
    res.json({ requests: rows });
  } catch (error) {
    respondError(res, error, "Failed to load requests");
  }
}

export async function getAdminReturns(_req, res) {
  try {
    const rows = await dbQuery("SELECT rr.*, o.order_number, o.customer_name, o.customer_email, o.customer_phone FROM return_requests rr JOIN orders o ON o.id=rr.order_id ORDER BY rr.updated_at DESC");
    res.json({ requests: rows });
  } catch (error) {
    respondError(res, error, "Failed to load return requests");
  }
}

export async function updateReturnRequest(req, res) {
  const id = number(req.params.id);
  try {
    const rows = await dbQuery("SELECT * FROM return_requests WHERE id=? LIMIT 1", [id]);
    const request = rows[0];
    if (!request) return res.status(404).json({ message: "Request not found" });
    const status = clean(req.body?.status);
    const allowed = request.request_type === "Replacement" ? REPLACEMENT_STATUSES : RETURN_STATUSES;
    if (!allowed.includes(status)) return res.status(400).json({ message: "Valid request status is required" });
    await dbQuery("UPDATE return_requests SET status=?, internal_remarks=? WHERE id=?", [status, clean(req.body?.internalRemarks) || null, id]);
    await dbQuery("INSERT INTO return_request_history (request_id,status,internal_remarks,changed_by) VALUES (?,?,?,?)", [id, status, clean(req.body?.internalRemarks) || null, req.admin?.email || "Admin"]);
    if (["Refund Done", "Received", "Replacement Delivered"].includes(status)) {
      await reverseOrderCommissions(
        request.order_id,
        `${request.request_type} ${status}`
      ).catch((error) => {
        console.log("Commission reversal skipped:", error.message);
      });
    }
    await logActivity(req, "Updated return request", "Returns", `Request ${id}: ${status}`);
    res.json({ message: "Request updated" });
  } catch (error) {
    respondError(res, error, "Failed to update request");
  }
}

export async function refreshLowStockNotifications() {
  for (const catalog of ["website", "warehouse", "store"]) {
    const rows = await allCatalogRows(catalog);
    for (const row of rows) {
      const isLow = number(row.stock_on_hand) <= number(row.reorder_level);
      const stateRows = await dbQuery("SELECT * FROM low_stock_alert_state WHERE catalog=? AND product_id=? LIMIT 1", [catalog, row.id]);
      const wasLow = Boolean(stateRows[0]?.is_low);
      if (isLow && !wasLow) {
        const dedupeKey = `low_stock:${catalog}:${row.id}:${Date.now()}`;
        await dbQuery("INSERT INTO admin_notifications (type,title,message,link,dedupe_key) VALUES ('low_stock',?,?,?,?)", [`Low ${catalog} stock`, `${row.name} has ${number(row.stock_on_hand)} unit(s), threshold ${number(row.reorder_level)}`, "/inventory", dedupeKey]);
      }
      await dbQuery(
        `INSERT INTO low_stock_alert_state (catalog,product_id,is_low,last_alerted_at) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE is_low=VALUES(is_low), last_alerted_at=IF(VALUES(last_alerted_at) IS NOT NULL, VALUES(last_alerted_at), last_alerted_at)`,
        [catalog, row.id, isLow, isLow && !wasLow ? new Date() : null]
      );
    }
  }
}

export async function exportAdminXlsx(req, res) {
  const type = clean(req.params.type).toLowerCase();
  try {
    if (["website-products", "warehouse-products", "store-products"].includes(type)) {
      const catalog = type.split("-")[0];
      const rows = await allCatalogRows(catalog, req.query);
      if (catalog === "website") {
        const exportRows = await websiteProductExportRows(rows);
        return sendWorkbook(res, `${type}.xlsx`, "Products", PRODUCT_IMPORT_EXPORT_COLUMNS, exportRows);
      }
      return sendWorkbook(res, `${type}.xlsx`, "Products", [["ID", "id"], ["SKU", "sku"], ["Name", "name", 34], ["Category", "category_name"], ["Brand", "brand_name"], ["Stock", "stock_on_hand"], ["Reorder Level", "reorder_level"], ["Status", "status"]], rows);
    }
    const maps = {
      orders: ["orders", "Orders", [["Order", "order_number"], ["Customer", "customer_name"], ["Email", "customer_email"], ["Phone", "customer_phone"], ["Amount", "total_amount"], ["Status", "order_status"], ["Tracking URL", "tracking_url", 36], ["Created", "created_at"]]],
      bills: ["manual_bills", "Bills", [["Bill", "bill_number"], ["Customer", "customer_name"], ["Email", "customer_email"], ["Amount", "total_amount"], ["Status", "status"], ["Created", "created_at"]]],
      customers: ["users", "Customers", [["ID", "id"], ["Name", "name"], ["Email", "email"], ["Phone", "phone"], ["Verified", "is_verified"], ["Created", "created_at"]]],
      subscribers: ["newsletter_subscribers", "Subscribers", [["Email", "email", 34], ["Source", "source"], ["Status", "status"], ["Subscribed", "subscribed_at"], ["Unsubscribed", "unsubscribed_at"]]],
      suppliers: ["suppliers", "Suppliers", [["Name", "name"], ["Company", "company"], ["Email", "email"], ["Phone", "phone"], ["Status", "status"]]],
      blogs: ["blog_posts", "Blogs", [["Title", "title", 40], ["Slug", "slug"], ["Category", "category"], ["Status", "status"], ["Published", "published_at"]]],
      brands: ["brands", "Brands", [["Name", "name", 30], ["Slug", "slug"], ["Status", "status"], ["Featured", "featured"], ["Website", "website_url", 36]]],
    };
    const config = maps[type];
    if (!config) return res.status(404).json({ message: "Export type not found" });
    const [table, sheet, columns] = config;
    const ids = clean(req.query.ids).split(",").map(number).filter(Boolean);
    const rows = await dbQuery(`SELECT * FROM ${table}${ids.length ? " WHERE id IN (?)" : ""} ORDER BY id DESC`, ids.length ? [ids] : []);
    return sendWorkbook(res, `${type}.xlsx`, sheet, columns, rows);
  } catch (error) {
    respondError(res, error, "Failed to export workbook");
  }
}

export async function bulkAction(req, res) {
  const entity = clean(req.params.entity);
  const action = clean(req.body?.action);
  const ids = [...new Set((req.body?.ids || []).map(number).filter(Boolean))];
  if (!ids.length || !["archive", "delete"].includes(action)) return res.status(400).json({ message: "IDs and a valid action are required" });
  const config = {
    "website-products": ["products", "deleted_at=NOW(), status='Inactive'", "SELECT (SELECT COUNT(*) FROM order_items WHERE product_id=?) + (SELECT COUNT(*) FROM supplier_products WHERE product_id=?) count"],
    "warehouse-products": ["products", "deleted_at=NOW(), status='Inactive'", "SELECT (SELECT COUNT(*) FROM order_items WHERE product_id=?) + (SELECT COUNT(*) FROM manual_bill_items WHERE product_id=?) + (SELECT COUNT(*) FROM stock_movements WHERE product_id=?) + (SELECT COUNT(*) FROM supplier_products WHERE product_id=?) count"],
    "store-products": ["products", "deleted_at=NOW(), status='Inactive'", "SELECT (SELECT COUNT(*) FROM order_items WHERE product_id=?) + (SELECT COUNT(*) FROM manual_bill_items WHERE product_id=?) + (SELECT COUNT(*) FROM store_movements WHERE product_id=?) + (SELECT COUNT(*) FROM supplier_products WHERE product_id=?) count"],
    brands: ["brands", "deleted_at=NOW(), status='Inactive'", "SELECT (SELECT COUNT(*) FROM products WHERE brand_id=?) + (SELECT COUNT(*) FROM warehouse_products WHERE brand_id=?) + (SELECT COUNT(*) FROM store_products WHERE brand_id=?) + (SELECT COUNT(*) FROM supplier_brands WHERE brand_id=?) count"],
    customers: ["users", null, "SELECT COUNT(*) count FROM orders WHERE user_id=?"],
    suppliers: ["suppliers", "status='Blocked'", "SELECT 0 count"],
    subscribers: ["newsletter_subscribers", "status='Unsubscribed', unsubscribed_at=NOW()", "SELECT 0 count"],
    blogs: ["blog_posts", "status='Draft'", "SELECT 0 count"],
  }[entity];
  if (!config) return res.status(404).json({ message: "Bulk entity not found" });
  const [table, archiveSql, referenceSql] = config;
  const result = { archived: [], deleted: [], blocked: [] };
  try {
    for (const id of ids) {
      if (action === "archive" && archiveSql) {
        await dbQuery(`UPDATE ${table} SET ${archiveSql} WHERE id=?`, [id]);
        result.archived.push(id);
        continue;
      }
      if (action === "archive") {
        result.blocked.push({ id, reason: "Archive is not supported for this record type" });
        continue;
      }
      const placeholders = (referenceSql.match(/\?/g) || []).length;
      const refs = await dbQuery(referenceSql, Array(placeholders).fill(id));
      if (number(refs[0]?.count)) {
        result.blocked.push({ id, reason: "Historical references exist" });
        continue;
      }
      await dbQuery(`DELETE FROM ${table} WHERE id=?`, [id]);
      result.deleted.push(id);
    }
    await logActivity(req, `Bulk ${action}`, entity, `${ids.length} selected`);
    res.json({ message: "Bulk action completed", result });
  } catch (error) {
    respondError(res, error, "Failed to complete bulk action");
  }
}

export async function refreshAdminLowStock(_req, res) {
  try {
    await refreshLowStockNotifications();
    res.json({ message: "Low-stock alerts refreshed" });
  } catch (error) {
    respondError(res, error, "Failed to refresh low-stock alerts");
  }
}
