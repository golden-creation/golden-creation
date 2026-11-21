import bcrypt from "bcrypt";
import fs from "fs";
import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";
import db from "../config/db.js";
import { uploadBufferToSpaces } from "../services/media-storage.service.js";
import { copyRemoteImageToSpaces } from "../services/remote-media.service.js";
import { replaceProductVariants } from "../services/variant.service.js";
import { sendOrderConfirmationSms } from "../services/sms.service.js";
import { ensureProductSlug } from "../services/seo.service.js";
import {
  releaseEligibleCommissions,
  reverseOrderCommissions,
} from "../services/referral-affiliate.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INVOICE_LOGO_PATH = path.join(__dirname, "..", "assets", "golden-creation-official-logo.png");
const INVOICE_WATERMARK_PATH = path.join(__dirname, "..", "assets", "invoice-watermark.png");

function dbQuery(sql, values = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, values, (error, results) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(results);
    });
  });
}

function parseJson(value, fallbackValue = []) {
  if (!value) {
    return fallbackValue;
  }

  if (Array.isArray(value) || typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallbackValue;
  }
}

const permissionCatalog = [
  { key: "dashboard", label: "Dashboard", group: "Core" },
  { key: "products", label: "Website Products", group: "Website Management" },
  { key: "categories", label: "Manage Categories", group: "Website Management" },
  { key: "brands", label: "Brand Management", group: "Website Management" },
  { key: "tags", label: "Tag Management", group: "Website Management" },
  { key: "collections", label: "Collection Management", group: "Website Management" },
  { key: "menus", label: "Menu Management", group: "Website Management" },
  { key: "bundles", label: "Bundle Management", group: "Website Management" },
  { key: "orders", label: "Order Management", group: "Website Management" },
  { key: "returns", label: "Returns & Replacements", group: "Website Management" },
  { key: "billing", label: "Billing Management", group: "Business Management" },
  { key: "customers", label: "Customers", group: "Website Management" },
  { key: "corporate_enquiries", label: "Corporate Enquiries", group: "Website Management" },
  { key: "contact_enquiries", label: "Enquiry Management", group: "Website Management" },
  { key: "newsletter", label: "Newsletter Subscribers", group: "Website Management" },
  { key: "shipping", label: "Shipping", group: "Website Management" },
  { key: "payments", label: "Payment Management", group: "Website Management" },
  { key: "discounts", label: "Discount Management", group: "Website Management" },
  { key: "referral_affiliate", label: "Referral & Affiliate", group: "Website Management" },
  { key: "seo_marketing", label: "SEO & Marketing", group: "Website Management" },
  { key: "blog", label: "Blog", group: "Website Management" },
  { key: "inventory", label: "Inventory", group: "Business Management" },
  { key: "warehouse", label: "Warehouse Management", group: "Business Management" },
  { key: "store", label: "Shop Products & Store Settings", group: "Business Management" },
  { key: "tasks", label: "To-Do Workspace", group: "Business Management" },
  { key: "hr", label: "HR Lite", group: "Business Management" },
  { key: "suppliers", label: "Supplier Management", group: "Business Management" },
  { key: "reports", label: "Reports", group: "Business Management" },
  { key: "leads", label: "Lead Management", group: "Sales" },
  { key: "sales_catalogs", label: "Catalog Sharing", group: "Sales" },
  { key: "drive", label: "Drive Storage", group: "Files & Media" },
  { key: "media", label: "Media Uploads", group: "Files & Media" },
  { key: "profile", label: "Profile Details", group: "Account" },
  { key: "users", label: "Staff Management", group: "Admin" },
  { key: "roles", label: "Role Management", group: "Admin" },
];

const permissionKeys = permissionCatalog.map((permission) => permission.key);

function normalizePermissions(permissions) {
  if (!Array.isArray(permissions)) return [];
  const expanded = new Set();

  permissions.forEach((permission) => {
    const key = String(permission?.key || permission || "").trim();
    if (key) expanded.add(key);
  });

  if (expanded.has("products")) {
    expanded.add("categories");
    expanded.add("bundles");
    expanded.add("media");
  }
  if (expanded.has("customers")) {
    expanded.add("contact_enquiries");
    expanded.add("corporate_enquiries");
    expanded.add("newsletter");
  }
  if (expanded.has("orders")) {
    expanded.add("returns");
    expanded.add("billing");
  }
  if (expanded.has("users")) {
    expanded.add("hr");
  }
  if (expanded.has("blog") || expanded.has("brands") || expanded.has("collections") || expanded.has("menus") || expanded.has("bundles")) {
    expanded.add("media");
  }

  return permissionKeys.filter((key) => expanded.has(key));
}

async function ensureDefaultRoleSeeds() {
  const adsExecutivePermissions = normalizePermissions([
    "dashboard",
    "seo_marketing",
    "reports",
    "leads",
    "contact_enquiries",
    "corporate_enquiries",
  ]);

  await dbQuery(
    `
      INSERT INTO roles (name, description, permissions, status)
      VALUES (?, ?, ?, 'Active')
      ON DUPLICATE KEY UPDATE
        description = VALUES(description),
        permissions = VALUES(permissions),
        status = 'Active'
    `,
    [
      "Ads Executive",
      "Runs Google, Meta, and campaign tracking workflows",
      JSON.stringify(adsExecutivePermissions),
    ]
  );
}

function numericId(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

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

function queueOrderConfirmationSms({ phone, customerName, orderNumber, totalAmount }) {
  if (!cleanString(phone)) return;

  void sendOrderConfirmationSms({
    phone,
    customerName,
    orderNumber,
    totalAmount,
  }).catch((error) => {
    console.error(`Order confirmation SMS failed for ${orderNumber}:`, error.message);
  });
}

function slugify(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function createOrderNumber() {
  return `LM-${Date.now().toString().slice(-8)}`;
}

function createBillNumber() {
  return `BILL-${Date.now().toString().slice(-8)}`;
}

function csvRows(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.split(",").map((cell) => cell.replace(/^"|"$/g, "").trim()))
    .filter((row) => row.some(Boolean));
}

function googleSheetCsvUrl(value) {
  const source = cleanString(value);
  if (!source) return "";
  if (source.includes("/export?format=csv") || source.includes("output=csv")) return source;

  const idMatch = source.match(/\/spreadsheets\/d\/([^/]+)/) || source.match(/^([a-zA-Z0-9-_]{20,})$/);
  const gidMatch = source.match(/[?&]gid=(\d+)/);
  const id = idMatch?.[1];

  return id
    ? `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gidMatch ? `&gid=${gidMatch[1]}` : ""}`
    : source;
}

function warehouseProductRef(body = {}) {
  const ref = cleanString(body.product_ref || body.productRef);
  const productType = cleanString(body.product_type || body.productType).toLowerCase();
  const refMatch = ref.match(/^(website|warehouse|store):(\d+)$/i);

  if (refMatch) {
    if (refMatch[1].toLowerCase() === "warehouse") return { productId: null, warehouseProductId: Number(refMatch[2]), storeProductId: null };
    if (refMatch[1].toLowerCase() === "store") return { productId: null, warehouseProductId: null, storeProductId: Number(refMatch[2]) };
    return { productId: Number(refMatch[2]), warehouseProductId: null, storeProductId: null };
  }

  const storeProductId = Number(body.store_product_id || body.storeProductId);
  const warehouseProductId = Number(body.warehouse_product_id || body.warehouseProductId);
  const productId = Number(body.product_id || body.productId);

  if (productType === "store" || storeProductId) {
    return { productId: null, warehouseProductId: null, storeProductId: storeProductId || productId || null };
  }
  if (productType === "warehouse" || warehouseProductId) {
    return { productId: null, warehouseProductId: warehouseProductId || productId || null, storeProductId: null };
  }

  return { productId: productId || null, warehouseProductId: null, storeProductId: null };
}

function productRefLabel({ productId, warehouseProductId }) {
  return warehouseProductId
    ? `Warehouse product ${warehouseProductId}`
    : `Website product ${productId}`;
}

function billMessage(bill) {
  const amount = Number(bill.total_amount || bill.totalAmount || 0).toFixed(2);
  return `Hello ${bill.customer_name || bill.customerName || "Customer"}, your Lekhanmart bill ${bill.bill_number || bill.billNumber} for Rs. ${amount} is ready. Payment link: ${bill.payment_link || bill.paymentLink || "Payment link will be shared shortly."}`;
}

function whatsappLink(phone, message) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : "";
}

function mailtoLink(email, subject, message) {
  return email ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}` : "";
}

function smsLink(phone, message) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits ? `sms:${digits}?body=${encodeURIComponent(message)}` : "";
}

function sqlDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: sqlDate(start), end: sqlDate(end) };
}

function reportDateRange(query = {}) {
  if (query.from && query.to) {
    return {
      start: cleanString(query.from),
      end: cleanString(query.to),
      label: "Custom",
    };
  }

  const now = new Date();
  const period = cleanString(query.period || "monthly").toLowerCase();
  let start;

  if (period === "today") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === "weekly") {
    start = new Date(now);
    start.setDate(now.getDate() - 6);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return {
    start: sqlDate(start),
    end: sqlDate(now),
    label: period,
  };
}

function moduleResponse(res, error, message) {
  console.log(message, error);
  res.status(error?.statusCode || 500).json({ message: error?.statusCode ? error.message : message });
}

function normalizeImportKey(value) {
  return cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function importValue(row, keys, fallbackValue = "") {
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

function importNumber(row, keys, fallbackValue = 0) {
  const rawValue = importValue(row, keys, "");
  const normalizedValue = rawValue.replace(/^'/, "").replace(/[₹,\s]/g, "");
  const parsed = Number(normalizedValue);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function hasImportValue(row, keys) {
  return keys.some((key) => importValue(row, [key], "") !== "");
}

function hasImportValueInRows(rows, keys) {
  return rows.some(({ row }) => hasImportValue(row, keys));
}

function firstImportNumberInRows(rows, keys, fallbackValue = 0) {
  for (const { row } of rows) {
    if (hasImportValue(row, keys)) {
      return importNumber(row, keys, fallbackValue);
    }
  }
  return fallbackValue;
}

async function ensureProductPhysicalStockRows(productId) {
  if (!productId) return;
  await dbQuery(
    `
      INSERT IGNORE INTO product_stock_counts (product_id, bucket, stock_on_hand, reserved_stock, reorder_level)
      SELECT id, 'warehouse', 0, 0, COALESCE(reorder_level, 0)
      FROM products
      WHERE id = ?
    `,
    [productId]
  );
  await dbQuery(
    `
      INSERT IGNORE INTO product_stock_counts (product_id, bucket, stock_on_hand, reserved_stock, reorder_level)
      SELECT id, 'shop', 0, 0, COALESCE(reorder_level, 0)
      FROM products
      WHERE id = ?
    `,
    [productId]
  );
}

async function setPhysicalStockFromImport(req, productId, bucket, stockOnHand, reorderLevel = null) {
  if (!productId || !["warehouse", "shop"].includes(bucket)) return false;
  await ensureProductPhysicalStockRows(productId);
  const rows = await dbQuery(
    "SELECT stock_on_hand, reorder_level FROM product_stock_counts WHERE product_id = ? AND bucket = ? LIMIT 1",
    [productId, bucket]
  );
  const current = rows[0] || { stock_on_hand: 0, reorder_level: 0 };
  const nextStock = Math.max(0, Number(stockOnHand) || 0);
  const nextReorder = reorderLevel == null ? Number(current.reorder_level || 0) : Math.max(0, Number(reorderLevel) || 0);
  const changed = Number(current.stock_on_hand || 0) !== nextStock || Number(current.reorder_level || 0) !== nextReorder;
  await dbQuery(
    `INSERT INTO product_stock_counts (product_id, bucket, stock_on_hand, reserved_stock, reorder_level)
     VALUES (?, ?, ?, 0, ?)
     ON DUPLICATE KEY UPDATE stock_on_hand = VALUES(stock_on_hand), reorder_level = VALUES(reorder_level)`,
    [productId, bucket, nextStock, nextReorder]
  );
  if (changed) {
    await dbQuery(
      `INSERT INTO product_stock_audit_logs
        (product_id, bucket, previous_stock, new_stock, previous_reorder_level, new_reorder_level,
         adjustment_type, quantity_delta, reason, changed_by, actor)
       VALUES (?, ?, ?, ?, ?, ?, 'import', ?, 'Website product Excel import', ?, ?)`,
      [
        productId,
        bucket,
        Number(current.stock_on_hand || 0),
        nextStock,
        Number(current.reorder_level || 0),
        nextReorder,
        nextStock - Number(current.stock_on_hand || 0),
        req?.admin?.id || null,
        req?.admin?.name || req?.admin?.email || "System",
      ]
    );
  }
  return changed;
}

function stripHtml(value) {
  return cleanString(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function normalizeProductStatus(value) {
  const status = cleanString(value || "Active").toLowerCase();
  return ["active", "published", "true", "1", "yes"].includes(status) ? "Active" : "Inactive";
}

function parseImportDecimal(value) {
  const rawValue = cleanString(value).replace(/^'/, "").replace(/[^\d.-]/g, "");
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitCategoryPath(value) {
  return cleanString(value)
    .split(/\s*(?:>|→|›|»|\/)\s*/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function ensureCategoryPath(categoryValue) {
  const names = splitCategoryPath(categoryValue);
  const path = names.length ? names : ["Uncategorized"];
  let parentId = null;
  let categoryId = null;

  for (const name of path) {
    const slug = slugify(parentId ? `${parentId}-${name}` : name) || slugify(name);

    await dbQuery(
      `
        INSERT INTO categories (name, slug, parent_id, status)
        VALUES (?, ?, ?, 'Active')
        ON DUPLICATE KEY UPDATE
          status = 'Active',
          parent_id = COALESCE(parent_id, VALUES(parent_id)),
          slug = COALESCE(slug, VALUES(slug))
      `,
      [name, slug, parentId]
    );

    const rows = await dbQuery(
      `
        SELECT id
        FROM categories
        WHERE name = ?
          AND (parent_id <=> ? OR parent_id IS NULL OR ? IS NULL)
        ORDER BY CASE WHEN parent_id <=> ? THEN 0 ELSE 1 END, id
        LIMIT 1
      `,
      [name, parentId, parentId, parentId]
    );

    categoryId = rows[0]?.id || categoryId;
    parentId = categoryId;
  }

  return {
    id: categoryId,
    name: path[path.length - 1],
    path,
    pathText: path.join(" > "),
  };
}

function buildDimensions(row) {
  const length = parseImportDecimal(
    importValue(row, ["LENGTH (product.metafields.custom.length)", "Length", "Product Length", "length"])
  );
  const breadth = parseImportDecimal(
    importValue(row, [
      "WIDTH (product.metafields.custom.width)",
      "Breadth",
      "Width",
      "Product Breadth",
      "Product Width",
      "breadth",
      "width",
    ])
  );
  const height = parseImportDecimal(
    importValue(row, ["HEIGHT (product.metafields.custom.height)", "Height", "Product Height", "height"])
  );

  const dimensions = {};
  if (length !== null) dimensions.length = length;
  if (breadth !== null) dimensions.breadth = breadth;
  if (height !== null) dimensions.height = height;
  if (Object.keys(dimensions).length) {
    const requestedUnit = importValue(row, [
      "Dimension Unit",
      "Size Unit",
      "dimension_unit",
      "dimensions_unit",
    ]).toLowerCase();
    dimensions.unit = ["mm", "cm", "in", "m"].includes(requestedUnit)
      ? requestedUnit
      : "cm";
  }

  return Object.keys(dimensions).length ? dimensions : null;
}

function buildImportSpecifications(row, categoryPath = []) {
  const specs = {};
  const addSpec = (label, keys) => {
    const value = importValue(row, keys);
    if (value) specs[label] = value;
  };

  if (categoryPath.length) {
    specs["Category Path"] = categoryPath.join(" > ");
  }

  addSpec("Vendor", ["Vendor", "vendor"]);
  addSpec("Google Product Category", ["Google Shopping / Google Product Category"]);
  addSpec("MPN", ["Google Shopping / MPN"]);
  addSpec("Condition", ["Google Shopping / Condition"]);
  addSpec("Color", ["Color (product.metafields.shopify.color-pattern)"]);
  addSpec("Pen Type", ["Pen type (product.metafields.shopify.pen-type)"]);

  return Object.keys(specs).length ? specs : null;
}

async function updateProductChangedFields(productId, fields) {
  const rows = await dbQuery("SELECT * FROM products WHERE id = ? LIMIT 1", [productId]);
  const current = rows[0] || {};
  const updates = [];
  const values = [];

  Object.entries(fields).forEach(([field, value]) => {
    const nextValue = value === undefined ? null : value;
    const currentValue = current[field];
    const numericFields = new Set(["price", "weight", "stock_quantity", "reorder_level", "category_id", "brand_id"]);
    const jsonFields = new Set(["dimensions", "specifications"]);
    const normalizedCurrent = (() => {
      if (currentValue === null || currentValue === undefined) return null;
      if (numericFields.has(field)) return Number(currentValue) || 0;
      if (jsonFields.has(field)) return JSON.stringify(parseJson(currentValue, currentValue));
      return String(currentValue);
    })();
    const normalizedNext = (() => {
      if (nextValue === null || nextValue === undefined || nextValue === "") return null;
      if (numericFields.has(field)) return Number(nextValue) || 0;
      if (jsonFields.has(field)) return JSON.stringify(parseJson(nextValue, nextValue));
      return String(nextValue);
    })();

    if (normalizedCurrent !== normalizedNext) {
      updates.push(`${field} = ?`);
      values.push(nextValue);
    }
  });

  if (!updates.length) return false;

  await dbQuery(`UPDATE products SET ${updates.join(", ")} WHERE id = ?`, [...values, productId]);
  return true;
}

function inferExtensionFromContentType(contentType) {
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  return ".jpg";
}

async function importRemoteImage(imageUrl, productSlug, results, rowNumber) {
  const url = cleanString(imageUrl);
  if (!/^https?:\/\//i.test(url)) {
    return url;
  }

  try {
    const importedUrl = await copyRemoteImageToSpaces(url, {
      folder: `products/imports/${productSlug || "shopify"}`,
      nameHint: productSlug || "product",
    });

    results.imagesUploaded += 1;
    return importedUrl;
  } catch (error) {
    results.errors.push(`Row ${rowNumber}: image import failed (${error.message})`);
    return url;
  }
}

async function syncProductImages(productId, images = []) {
  const normalizedImages = images
    .map((image, index) => {
      if (typeof image === "string") {
        return { url: cleanString(image), sortOrder: index + 1 };
      }
      return {
        url: cleanString(image?.url || image?.image_url || image?.image),
        altText: cleanString(image?.altText || image?.alt_text || image?.alt),
        titleText: cleanString(image?.titleText || image?.title_text),
        caption: cleanString(image?.caption),
        description: cleanString(image?.description),
        seoFilename: cleanString(image?.seoFilename || image?.seo_filename),
        sortOrder: Number(image?.sortOrder || image?.sort_order || index + 1) || index + 1,
      };
    })
    .filter((image) => image.url);
  const seen = new Set();
  const uniqueImages = normalizedImages.filter((image) => {
    if (seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  });
  await dbQuery("DELETE FROM product_images WHERE product_id = ?", [productId]);

  for (const image of uniqueImages) {
    await dbQuery(
      `INSERT INTO product_images
        (product_id, image_url, alt_text, title_text, caption, description, seo_filename, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId,
        image.url,
        image.altText || null,
        image.titleText || image.altText || null,
        image.caption || null,
        image.description || null,
        image.seoFilename || null,
        image.sortOrder,
      ]
    );
  }
}

function variantOptionsFromRow(row) {
  return [1, 2, 3]
    .map((index) => ({
      optionName: importValue(row, [`Option${index} Name`, `variant_option_${index}`]),
      value: importValue(row, [`Option${index} Value`, `variant_value_${index}`]),
    }))
    .filter((option) => {
      const optionName = option.optionName.toLowerCase();
      const value = option.value.toLowerCase();
      return option.optionName && option.value && !(optionName === "title" && value === "default title");
    });
}

async function logActivity(req, action, module, detail) {
  try {
    await dbQuery(
      `
        INSERT INTO admin_activity (admin_id, actor, action, module, detail)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        req.admin?.id || null,
        req.admin?.email || "System",
        action,
        module,
        detail || null,
      ]
    );
  } catch (error) {
    console.log("Activity Log Error:", error);
  }
}

export async function getAdminRoles(_req, res) {
  try {
    await ensureDefaultRoleSeeds();
    const rows = await dbQuery(`
      SELECT id, name, description, permissions, status, created_at
      FROM roles
      ORDER BY id
    `);

    res.json({
      roles: rows.map((role) => ({
        ...role,
        permissions: normalizePermissions(parseJson(role.permissions)),
      })),
      permissionCatalog,
      permissionKeys,
    });
  } catch (error) {
    moduleResponse(res, error, "Failed to load roles");
  }
}

export async function createAdminRole(req, res) {
  const name = String(req.body?.name || "").trim();
  const description = String(req.body?.description || "").trim();
  const permissions = normalizePermissions(req.body?.permissions);

  if (!name || !permissions.length) {
    return res.status(400).json({
      message: "Role name and at least one permission are required",
    });
  }

  try {
    const result = await dbQuery(
      `
        INSERT INTO roles (name, description, permissions, status)
        VALUES (?, ?, ?, 'Active')
      `,
      [name, description, JSON.stringify(permissions)]
    );

    await logActivity(req, "Created role", "RBAC", name);

    res.status(201).json({
      role: {
        id: result.insertId,
        name,
        description,
        permissions,
        status: "Active",
      },
    });
  } catch (error) {
    moduleResponse(res, error, "Failed to create role");
  }
}

export async function getAdminActivity(req, res) {
  try {
    const filters = [];
    const values = [];

    if (req.query?.from) {
      filters.push("DATE(created_at) >= ?");
      values.push(cleanString(req.query.from));
    }

    if (req.query?.to) {
      filters.push("DATE(created_at) <= ?");
      values.push(cleanString(req.query.to));
    }

    if (req.query?.module) {
      filters.push("module = ?");
      values.push(cleanString(req.query.module));
    }

    if (req.query?.actor) {
      filters.push("actor LIKE ?");
      values.push(`%${cleanString(req.query.actor)}%`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const rows = await dbQuery(
      `
      SELECT id, admin_id, actor, action, module, detail, created_at
      FROM admin_activity
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT 500
    `,
      values
    );

    const modules = await dbQuery(`
      SELECT DISTINCT module
      FROM admin_activity
      WHERE module IS NOT NULL AND module <> ''
      ORDER BY module
    `);

    res.json({
      activity: rows,
      modules: modules.map((item) => item.module),
    });
  } catch (error) {
    moduleResponse(res, error, "Failed to load activity");
  }
}

export async function createAdminStaff(req, res) {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const phone = String(req.body?.phone || "").trim();
  const requestedRole = String(req.body?.role || "Store Manager").trim();
  const role = requestedRole.toLowerCase() === "super admin" ? "Admin" : requestedRole;
  const permissions = normalizePermissions(req.body?.permissions);
  const password = String(req.body?.password || "Staff@123");

  if (!name || !email) {
    return res.status(400).json({ message: "Name and email are required" });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await dbQuery(
      `
        INSERT INTO admins (name, email, password, role, phone, status, permissions)
        VALUES (?, ?, ?, ?, ?, 'Active', ?)
      `,
      [name, email, passwordHash, role, phone || null, JSON.stringify(permissions)]
    );

    await logActivity(req, "Created staff account", "Users", email);

    res.status(201).json({
      staff: {
        id: `ADM-${result.insertId}`,
        name,
        email,
        phone: phone || "-",
        role,
        status: "Active",
        permissions,
      },
    });
  } catch (error) {
    moduleResponse(res, error, "Failed to create staff account");
  }
}

export async function updateAdminStaff(req, res) {
  const id = numericId(req.params.id);
  const name = String(req.body?.name || "").trim();
  const requestedRole = String(req.body?.role || "").trim();
  const role = requestedRole.toLowerCase() === "super admin" && id !== 1 ? "Admin" : requestedRole;
  const status = String(req.body?.status || "").trim();
  const hasProfileImage = ["profile_image", "profileImage", "image"].some((key) =>
    Object.prototype.hasOwnProperty.call(req.body || {}, key)
  );
  const profileImage = cleanString(
    req.body?.profile_image ?? req.body?.profileImage ?? req.body?.image
  );
  const permissions = Array.isArray(req.body?.permissions)
    ? normalizePermissions(req.body.permissions)
    : null;

  if (!id) {
    return res.status(400).json({ message: "Invalid staff ID" });
  }

  try {
    await dbQuery(
      `
        UPDATE admins
        SET
          name = COALESCE(NULLIF(?, ''), name),
          role = COALESCE(NULLIF(?, ''), role),
          status = COALESCE(NULLIF(?, ''), status),
          profile_image = CASE WHEN ? THEN NULLIF(?, '') ELSE profile_image END,
          permissions = COALESCE(?, permissions)
        WHERE id = ?
      `,
      [
        name,
        role,
        status,
        hasProfileImage ? 1 : 0,
        profileImage,
        permissions ? JSON.stringify(permissions) : null,
        id,
      ]
    );

    await logActivity(req, "Updated staff account", "Users", `ADM-${id}`);

    res.json({ message: "Staff account updated" });
  } catch (error) {
    moduleResponse(res, error, "Failed to update staff account");
  }
}

export async function deleteAdminStaff(req, res) {
  const id = numericId(req.params.id);

  if (!id) {
    return res.status(400).json({ message: "Invalid staff ID" });
  }

  if (Number(req.admin?.id) === id) {
    return res.status(409).json({ message: "You cannot delete your own signed-in account" });
  }

  try {
    const rows = await dbQuery("SELECT id, name, email, role FROM admins WHERE id = ? LIMIT 1", [id]);
    const staff = rows[0];

    if (!staff) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    if (
      Number(staff.id) === 1 ||
      String(staff.email || "").trim().toLowerCase() === "goldencreation@lekhanmart.in" ||
      (
        String(staff.name || "").trim().toLowerCase() === "ajay malhotra" &&
        String(staff.role || "").trim().toLowerCase() === "super admin"
      )
    ) {
      return res.status(409).json({ message: "Ajay Malhotra's Super Admin account cannot be deleted" });
    }

    if (String(staff.role || "").trim().toLowerCase() === "super admin") {
      const countRows = await dbQuery(
        "SELECT COUNT(*) AS total FROM admins WHERE LOWER(TRIM(role)) = 'super admin'"
      );

      if (Number(countRows[0]?.total || 0) <= 1) {
        return res.status(409).json({ message: "The last Super Admin account cannot be deleted" });
      }
    }

    await logActivity(req, "Deleted staff account", "Users", staff.email);
    try {
      await dbQuery("DELETE FROM admins WHERE id = ?", [id]);
    } catch {
      await dbQuery("UPDATE admins SET status = 'Deleted', permissions = '[]', updated_at = NOW() WHERE id = ?", [id]);
    }
    res.json({ message: "Staff account deleted" });
  } catch (error) {
    moduleResponse(res, error, "Failed to delete staff account");
  }
}

export async function getAdminStaffProfile(req, res) {
  const id = numericId(req.params.id);

  if (!id) {
    return res.status(400).json({ message: "Invalid staff ID" });
  }

  try {
    const rows = await dbQuery(
      `
        SELECT id, name, email, phone, role, status, permissions, profile_image, last_login_at, created_at, updated_at
        FROM admins
        WHERE id = ?
      `,
      [id]
    );
    const staff = rows[0];

    if (!staff) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    const activity = await dbQuery(
      `
        SELECT id, action, module, detail, created_at
        FROM admin_activity
        WHERE admin_id = ? OR actor = ?
        ORDER BY created_at DESC
        LIMIT 20
      `,
      [id, staff.email]
    );

    res.json({
      staff: {
        ...staff,
        id: `ADM-${staff.id}`,
        phone: staff.phone || "-",
        permissions: normalizePermissions(parseJson(staff.permissions)),
      },
      activity,
    });
  } catch (error) {
    moduleResponse(res, error, "Failed to load staff profile");
  }
}

export async function getAdminCategories(_req, res) {
  try {
    const categories = await dbQuery(`
      SELECT
        c.id,
        c.parent_id,
        pc.name AS parent_name,
        c.name,
        c.slug,
        c.image,
        c.description,
        COALESCE(c.status, 'Active') AS status,
        c.created_at,
        c.updated_at,
        COUNT(p.id) AS product_count
      FROM categories c
      LEFT JOIN categories pc ON pc.id = c.parent_id
      LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id, c.parent_id, pc.name, c.name, c.slug, c.image, c.description, c.status, c.created_at, c.updated_at
      ORDER BY COALESCE(pc.name, c.name), c.parent_id IS NOT NULL, c.name
    `);

    res.json({ categories });
  } catch (error) {
    moduleResponse(res, error, "Failed to load categories");
  }
}

async function assertValidCategoryParent(categoryId, parentId) {
  if (!parentId) {
    return null;
  }

  if (Number(categoryId) && Number(categoryId) === Number(parentId)) {
    const error = new Error("A category cannot be its own parent");
    error.statusCode = 400;
    throw error;
  }

  const parentRows = await dbQuery("SELECT id, parent_id FROM categories WHERE id = ? LIMIT 1", [parentId]);
  const parent = parentRows[0];

  if (!parent) {
    const error = new Error("Parent category was not found");
    error.statusCode = 400;
    throw error;
  }

  let currentParentId = parent.parent_id;

  while (currentParentId) {
    if (Number(categoryId) && Number(currentParentId) === Number(categoryId)) {
      const error = new Error("A category cannot be moved under one of its subcategories");
      error.statusCode = 400;
      throw error;
    }

    const rows = await dbQuery("SELECT parent_id FROM categories WHERE id = ? LIMIT 1", [currentParentId]);
    currentParentId = rows[0]?.parent_id || null;
  }

  return parent;
}

export async function createAdminCategory(req, res) {
  const name = cleanString(req.body?.name);
  const description = cleanString(req.body?.description);
  const image = cleanString(req.body?.image || req.body?.image_url || req.body?.imageUrl);
  const status = cleanString(req.body?.status || "Active");
  const parentId = Number(req.body?.parent_id || req.body?.parentId) || null;

  if (!name) {
    return res.status(400).json({ message: "Category name is required" });
  }

  try {
    await assertValidCategoryParent(null, parentId);

    const result = await dbQuery(
      `
        INSERT INTO categories (name, parent_id, slug, image, description, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        name,
        parentId,
        slugify(parentId ? `${parentId}-${name}` : name) || null,
        image || null,
        description || null,
        status === "Inactive" ? "Inactive" : "Active",
      ]
    );

    await logActivity(req, "Created category", "Products", name);
    res.status(201).json({
      category: {
        id: result.insertId,
        name,
        parent_id: parentId,
        image,
        description,
        status: status === "Inactive" ? "Inactive" : "Active",
        product_count: 0,
      },
    });
  } catch (error) {
    moduleResponse(res, error, "Failed to create category");
  }
}

export async function updateAdminCategory(req, res) {
  const id = Number(req.params.id);
  const name = cleanString(req.body?.name);
  const description = cleanString(req.body?.description);
  const image = cleanString(req.body?.image || req.body?.image_url || req.body?.imageUrl);
  const status = cleanString(req.body?.status);
  const parentId =
    req.body?.parent_id === null || req.body?.parentId === null
      ? null
      : Number(req.body?.parent_id || req.body?.parentId) || null;

  if (!id) {
    return res.status(400).json({ message: "Invalid category ID" });
  }

  try {
    await assertValidCategoryParent(id, parentId);

    await dbQuery(
      `
        UPDATE categories
        SET
          name = COALESCE(NULLIF(?, ''), name),
          parent_id = ?,
          slug = COALESCE(NULLIF(?, ''), slug),
          image = COALESCE(NULLIF(?, ''), image),
          description = ?,
          status = COALESCE(NULLIF(?, ''), status)
        WHERE id = ?
      `,
      [
        name,
        parentId,
        name ? slugify(parentId ? `${parentId}-${name}` : name) : "",
        image,
        description || null,
        status,
        id,
      ]
    );

    await logActivity(req, "Updated category", "Products", `Category ${id}`);
    res.json({ message: "Category updated" });
  } catch (error) {
    moduleResponse(res, error, "Failed to update category");
  }
}

export async function deleteAdminCategory(req, res) {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ message: "Invalid category ID" });
  }

  try {
    const rows = await dbQuery("SELECT id, name, parent_id FROM categories WHERE id = ? LIMIT 1", [id]);
    const category = rows[0];

    if (!category) {
      return res.status(404).json({ message: "Category was not found" });
    }

    await dbQuery("UPDATE categories SET parent_id = ? WHERE parent_id = ?", [category.parent_id || null, id]);
    await dbQuery("UPDATE products SET category_id = NULL WHERE category_id = ?", [id]);
    await dbQuery("DELETE FROM category_tax_rules WHERE category_id = ?", [id]);
    await dbQuery("DELETE FROM categories WHERE id = ?", [id]);

    await logActivity(req, "Deleted category", "Products", category.name);
    res.json({ message: "Category deleted" });
  } catch (error) {
    moduleResponse(res, error, "Failed to delete category");
  }
}

export async function importAdminProducts(req, res) {
  const rows = Array.isArray(req.body?.products) ? req.body.products : [];

  if (!rows.length) {
    return res.status(400).json({ message: "No products were supplied for import" });
  }

  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    imagesUploaded: 0,
    errors: [],
  };

  try {
    const productGroups = new Map();

    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2;
      const handle = importValue(row, ["Handle", "handle", "slug"]);
      const sku = importValue(row, ["Variant SKU", "variant_sku", "sku", "SKU"]);
      const productId = importValue(row, ["ID", "Product ID", "product_id", "ProductId"]);
      const fallbackKey = productId || handle || sku || `row-${rowNumber}`;
      const groupKey = fallbackKey.toLowerCase();

      if (!productGroups.has(groupKey)) {
        productGroups.set(groupKey, {
          rows: [],
          firstRowNumber: rowNumber,
        });
      }

      productGroups.get(groupKey).rows.push({ row, rowNumber });
    }

    for (const group of productGroups.values()) {
      const firstRow = group.rows.find(({ row }) => importValue(row, ["Title", "Name", "name", "product_name", "ProductName"]))?.row || group.rows[0].row;
      const firstRowNumber = group.firstRowNumber;
      const productIdFromSheet = numericId(importValue(firstRow, ["ID", "Product ID", "product_id", "ProductId"]));
      const handle = importValue(firstRow, ["Handle", "handle", "slug"]);
      const name = importValue(firstRow, ["Title", "Name", "name", "product_name", "ProductName"]);
      const firstSku = importValue(firstRow, ["Variant SKU", "sku", "SKU"]);
      const hasPriceData = hasImportValue(firstRow, ["Variant Price", "price", "Price"]);
      const price = importNumber(firstRow, ["Variant Price", "price", "Price"], 0);
      const categorySource =
        importValue(firstRow, ["Product Category", "category", "category_name", "Category"]) ||
        importValue(firstRow, ["Type", "type"]);

      const existing =
        productIdFromSheet
          ? await dbQuery(
              "SELECT id, sku, name, price, category_id, brand_id, image, description FROM products WHERE id = ? LIMIT 1",
              [productIdFromSheet]
            )
          : firstSku || handle
          ? await dbQuery(
              `
                SELECT id, sku, name, price, category_id, brand_id, image, description
                FROM products
                WHERE sku IN (?, ?)
                   OR name = ?
                ORDER BY CASE WHEN sku = ? THEN 0 WHEN sku = ? THEN 1 ELSE 2 END, id
                LIMIT 1
              `,
              [firstSku || "", handle || "", name, firstSku || "", handle || ""]
            )
          : name
          ? await dbQuery(
              "SELECT id, sku, name, price, category_id, brand_id, image, description FROM products WHERE name = ? LIMIT 1",
              [name]
            )
          : [];
      const existingProduct = existing[0] || null;
      const resolvedName = name || existingProduct?.name || "";
      const resolvedPrice = hasPriceData ? price : Number(existingProduct?.price || 0);

      if (!existingProduct && (!resolvedName || !resolvedPrice || !categorySource)) {
        results.skipped += 1;
        results.errors.push(`Row ${firstRowNumber}: title/name, variant price and category are required`);
        continue;
      }

      const category = categorySource ? await ensureCategoryPath(categorySource) : null;
      const categoryId = category?.id || existingProduct?.category_id || null;
      const description = stripHtml(importValue(firstRow, ["Body (HTML)", "description", "Description"]));
      const brandName = importValue(firstRow, ["Brand", "Brand Name", "brand_name", "brand"]);
      const brandSlug = slugify(importValue(firstRow, ["Brand Slug", "brand_slug"]) || brandName);
      let brandId = existingProduct?.brand_id || null;

      if (brandName && brandSlug) {
        await dbQuery(
          `
            INSERT INTO brands (name, slug, status)
            VALUES (?, ?, 'Active')
            ON DUPLICATE KEY UPDATE
              name = VALUES(name),
              status = 'Active',
              deleted_at = NULL
          `,
          [brandName, brandSlug]
        );
        const brandRows = await dbQuery("SELECT id FROM brands WHERE slug = ? LIMIT 1", [brandSlug]);
        brandId = brandRows[0]?.id || null;
      }
      const variants = [];
      const imageSources = [];
      const productDimensions = buildDimensions(firstRow);
      const productWeight = importNumber(firstRow, ["Variant Grams", "weight", "Weight"], 0) || null;
      const productWeightUnit = importValue(firstRow, ["Variant Weight Unit", "weight_unit", "Weight Unit"], productWeight ? "g" : "");
      const productBarcode = importValue(firstRow, ["Variant Barcode", "barcode", "Barcode"]);
      const productSpecifications = buildImportSpecifications(firstRow, category?.path || []);
      const hasImageData = hasImportValueInRows(group.rows, ["Image Src", "image", "Image", "Variant Image"]);
      const hasDescriptionData = hasImportValue(firstRow, ["Body (HTML)", "description", "Description"]);
      const hasWeightData = hasImportValue(firstRow, ["Variant Grams", "weight", "Weight"]);
      const hasWeightUnitData = hasImportValue(firstRow, ["Variant Weight Unit", "weight_unit", "Weight Unit"]);
      const hasBarcodeData = hasImportValue(firstRow, ["Variant Barcode", "barcode", "Barcode"]);
      const hasDimensionData = hasImportValue(firstRow, [
        "LENGTH (product.metafields.custom.length)",
        "Length",
        "Product Length",
        "length",
        "WIDTH (product.metafields.custom.width)",
        "Breadth",
        "Width",
        "Product Breadth",
        "Product Width",
        "breadth",
        "width",
        "HEIGHT (product.metafields.custom.height)",
        "Height",
        "Product Height",
        "height",
      ]);
      const hasSpecificationData =
        Boolean(categorySource) ||
        hasImportValue(firstRow, [
          "Vendor",
          "vendor",
          "Google Shopping / Google Product Category",
          "Google Shopping / MPN",
          "Google Shopping / Condition",
          "Color (product.metafields.shopify.color-pattern)",
          "Pen type (product.metafields.shopify.pen-type)",
        ]);
      const hasStockData = hasImportValueInRows(group.rows, [
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
      ]);
      const hasWarehouseStockData = hasImportValueInRows(group.rows, [
        "Warehouse Stock",
        "warehouse_stock",
        "warehouseStock",
      ]);
      const hasShopStockData = hasImportValueInRows(group.rows, [
        "Shop Stock",
        "Store Stock",
        "shop_stock",
        "store_stock",
        "shopStock",
        "storeStock",
      ]);
      const hasStatusData = hasImportValue(firstRow, ["Status", "Published"]);
      const hasReorderData = hasImportValue(firstRow, ["Reorder Level", "reorder_level", "ReorderLevel"]);

      for (const { row, rowNumber } of group.rows) {
        const imageSrc = importValue(row, ["Image Src", "image", "Image"]);
        const variantImage = importValue(row, ["Variant Image"]);
        const resolvedImage = await importRemoteImage(
          variantImage || imageSrc,
          slugify(handle || resolvedName),
          results,
          rowNumber
        );

        if (resolvedImage) {
          imageSources.push({
            url: resolvedImage,
            altText: importValue(row, ["Image Alt Text", "image_alt_text", "alt_text"]) || resolvedName,
            titleText: importValue(row, ["Image Title", "image_title", "title_text"]) || "",
            caption: importValue(row, ["Image Caption", "image_caption"]) || "",
            description: importValue(row, ["Image Description", "image_description"]) || "",
            sortOrder: importNumber(row, ["Image Position", "image_position"], imageSources.length + 1) || imageSources.length + 1,
          });
        }

        const variantSku =
          importValue(row, ["Variant SKU", "variant_sku", "sku", "SKU"]) ||
          `${slugify(handle || resolvedName).toUpperCase()}-${String(variants.length + 1).padStart(2, "0")}`;
        const variantPrice = importNumber(row, ["Variant Price", "variant_price", "price", "Price"], resolvedPrice);
        const variantOptions = variantOptionsFromRow(row);
        const variantDimensions = buildDimensions(row) || productDimensions;
        const variantWeight = importNumber(row, ["Variant Grams", "weight", "Weight"], 0) || null;
        const variantWeightUnit = importValue(row, ["Variant Weight Unit", "weight_unit", "Weight Unit"], variantWeight ? "g" : "");

        variants.push({
          sku: variantSku,
          barcode: importValue(row, ["Variant Barcode", "barcode"]),
          price: variantPrice,
          comparePrice: importNumber(row, ["Variant Compare At Price", "compare_price"], 0) || null,
          costPrice: importNumber(row, ["Cost per item", "cost_price"], 0) || null,
          stock: importNumber(row, ["Busy Stock", "busy_stock", "busyStock", "Website Stock", "website_stock", "websiteStock", "Variant Inventory Qty", "variant_stock", "stock_quantity", "stock", "Stock"], 0),
          weight: variantWeight,
          weightUnit: variantWeightUnit || null,
          dimensions: variantDimensions,
          specifications: buildImportSpecifications(row, category?.path || []),
          image: resolvedImage || null,
          status: normalizeProductStatus(importValue(row, ["Status", "Published"], "Active")),
          visibility: "Visible",
          isDefault: variants.length === 0,
          options: variantOptions,
        });
      }

      const image = imageSources[0]?.url || "";
      const stockQuantity = variants.reduce((total, variant) => total + Number(variant.stock || 0), 0);
      const reorderLevel = importNumber(firstRow, ["Reorder Level", "reorder_level", "ReorderLevel"], 0);
      const status = normalizeProductStatus(importValue(firstRow, ["Status", "Published"], "Active"));
      const tagNames = importValue(firstRow, ["Tags", "tags", "tag_names", "TagNames"])
        .split(/[,\|]/)
        .map((item) => item.trim())
        .filter(Boolean);

      let productId = null;
      let productWasExisting = false;
      let productChanged = false;

      if (existing.length) {
        productId = existing[0].id;
        productWasExisting = true;
        const updateFields = {
          ...(firstSku || handle ? { sku: firstSku || handle || null } : {}),
          ...(name ? { name } : {}),
          ...(hasPriceData ? { price: resolvedPrice } : {}),
          ...(categorySource ? { category_id: categoryId } : {}),
          ...(brandName ? { brand_id: brandId } : {}),
          ...(hasStockData ? { stock_quantity: stockQuantity } : {}),
          ...(hasReorderData ? { reorder_level: reorderLevel } : {}),
          ...(hasStatusData ? { status } : {}),
          ...(hasBarcodeData ? { barcode: productBarcode || null } : {}),
          ...(hasWeightData ? { weight: productWeight } : {}),
          ...(hasWeightUnitData ? { weight_unit: productWeightUnit || null } : {}),
          ...(hasDimensionData ? { dimensions: productDimensions ? JSON.stringify(productDimensions) : null } : {}),
          ...(hasSpecificationData ? { specifications: productSpecifications ? JSON.stringify(productSpecifications) : null } : {}),
        };
        if (hasDescriptionData) updateFields.description = description || null;
        if (hasImageData) updateFields.image = image || null;
        productChanged = await updateProductChangedFields(productId, updateFields);
        if (productChanged) {
          results.updated += 1;
        }
      } else {
        const insertResult = await dbQuery(
          `
            INSERT INTO products
              (sku, name, description, price, image, category_id, brand_id, stock_quantity,
               reorder_level, status, barcode, weight, weight_unit, dimensions, specifications)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            firstSku || handle || null,
            resolvedName,
            description || null,
            resolvedPrice,
            image || null,
            categoryId,
            brandId,
            stockQuantity,
            reorderLevel,
            status,
            productBarcode || null,
            productWeight,
            productWeightUnit || null,
            productDimensions ? JSON.stringify(productDimensions) : null,
            productSpecifications ? JSON.stringify(productSpecifications) : null,
          ]
        );
        productId = insertResult.insertId;
        await dbQuery("UPDATE products SET slug = ? WHERE id = ?", [
          await ensureProductSlug(productId, resolvedName, handle),
          productId,
        ]).catch(() => {});
        results.created += 1;
      }

      if (productId && hasImageData) {
        await syncProductImages(productId, imageSources);
      }

      let physicalStockChanged = false;
      if (productId && hasWarehouseStockData) {
        physicalStockChanged =
          (await setPhysicalStockFromImport(
            req,
            productId,
            "warehouse",
            firstImportNumberInRows(group.rows, ["Warehouse Stock", "warehouse_stock", "warehouseStock"], 0),
            hasReorderData ? reorderLevel : null
          )) || physicalStockChanged;
      }
      if (productId && hasShopStockData) {
        physicalStockChanged =
          (await setPhysicalStockFromImport(
            req,
            productId,
            "shop",
            firstImportNumberInRows(group.rows, ["Shop Stock", "Store Stock", "shop_stock", "store_stock", "shopStock", "storeStock"], 0),
            hasReorderData ? reorderLevel : null
          )) || physicalStockChanged;
      }
      if (productWasExisting && physicalStockChanged && !productChanged) {
        results.updated += 1;
      }

      if (productId && tagNames.length) {
        await dbQuery("DELETE FROM product_tags WHERE product_id = ?", [productId]);
        for (const tagName of tagNames) {
          const tagSlug = slugify(tagName);
          await dbQuery(
            `
              INSERT INTO tags (name, slug, status)
              VALUES (?, ?, 'Active')
              ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                status = 'Active',
                deleted_at = NULL
            `,
            [tagName, tagSlug]
          );
          const tagRows = await dbQuery("SELECT id FROM tags WHERE slug = ? LIMIT 1", [tagSlug]);
          if (tagRows[0]?.id) {
            await dbQuery("INSERT IGNORE INTO product_tags (product_id, tag_id) VALUES (?, ?)", [productId, tagRows[0].id]);
          }
        }
      }

      const hasVariantOptions = variants.some((variant) => variant.options.length);

      if (productId && variants.length && hasVariantOptions) {
        const optionMap = new Map();
        variants.forEach((variant) => {
          variant.options.forEach((option) => {
            if (!optionMap.has(option.optionName)) {
              optionMap.set(option.optionName, new Set());
            }
            optionMap.get(option.optionName).add(option.value);
          });
        });
        await replaceProductVariants(
          productId,
          Array.from(optionMap.entries()).map(([optionName, values]) => ({
            name: optionName,
            values: Array.from(values),
          })),
          variants
        );
        if (productWasExisting && !productChanged) {
          results.updated += 1;
        }
      }
    }

    await logActivity(req, "Imported products", "Products", `${results.created} created, ${results.updated} updated, ${results.imagesUploaded} images uploaded`);
    res.json({ message: "Product import completed", results });
  } catch (error) {
    moduleResponse(res, error, "Failed to import products");
  }
}

export async function searchAdmin(req, res) {
  const query = cleanString(req.query.q);

  if (query.length < 2) {
    return res.json({ results: [] });
  }

  const like = `%${query}%`;

  try {
    const [products, orders, staff, customers, categories, warehouse, discounts, brands, tags, collections, menus] = await Promise.all([
      dbQuery(
        `
          SELECT p.id, p.name AS title, COALESCE(p.sku, b.name) AS subtitle
          FROM products p
          LEFT JOIN brands b ON p.brand_id = b.id
          WHERE p.name LIKE ?
             OR p.sku LIKE ?
             OR b.name LIKE ?
             OR EXISTS (
               SELECT 1
               FROM product_variants pv
               LEFT JOIN variant_attribute_map vam ON vam.variant_id = pv.id
               LEFT JOIN variant_options vo ON vo.id = vam.option_id
               LEFT JOIN variant_option_values vov ON vov.id = vam.value_id
               WHERE pv.product_id = p.id
                 AND (pv.sku LIKE ? OR vo.name LIKE ? OR vov.value LIKE ?)
             )
          ORDER BY p.id DESC
          LIMIT 6
        `,
        [like, like, like, like, like, like]
      ),
      dbQuery(
        `
          SELECT id, order_number AS title, customer_name AS subtitle
          FROM orders
          WHERE order_number LIKE ? OR customer_name LIKE ? OR customer_email LIKE ? OR customer_phone LIKE ?
          ORDER BY created_at DESC
          LIMIT 6
        `,
        [like, like, like, like]
      ),
      dbQuery(
        `
          SELECT id, name AS title, role AS subtitle
          FROM admins
          WHERE name LIKE ? OR email LIKE ? OR role LIKE ?
          ORDER BY id DESC
          LIMIT 6
        `,
        [like, like, like]
      ),
      dbQuery(
        `
          SELECT id, COALESCE(name, email, phone) AS title, COALESCE(email, phone) AS subtitle
          FROM users
          WHERE name LIKE ? OR email LIKE ? OR phone LIKE ?
          ORDER BY id DESC
          LIMIT 6
        `,
        [like, like, like]
      ),
      dbQuery(
        `
          SELECT id, name AS title, COALESCE(status, 'Active') AS subtitle
          FROM categories
          WHERE name LIKE ? OR description LIKE ?
          ORDER BY name
          LIMIT 6
        `,
        [like, like]
      ),
      dbQuery(
        `
          SELECT id, name AS title, location AS subtitle
          FROM warehouse_locations
          WHERE name LIKE ? OR code LIKE ? OR location LIKE ?
          ORDER BY id
          LIMIT 6
        `,
        [like, like, like]
      ),
      dbQuery(
        `
          SELECT id, name AS title, COALESCE(code, method) AS subtitle
          FROM discounts
          WHERE deleted_at IS NULL
            AND (name LIKE ? OR code LIKE ? OR discount_type LIKE ?)
          ORDER BY created_at DESC
          LIMIT 6
        `,
        [like, like, like]
      ),
      dbQuery(
        `
          SELECT id, name AS title, slug AS subtitle
          FROM brands
          WHERE deleted_at IS NULL
            AND (name LIKE ? OR slug LIKE ? OR description LIKE ?)
          ORDER BY featured DESC, name
          LIMIT 6
        `,
        [like, like, like]
      ),
      dbQuery(
        `
          SELECT t.id, t.name AS title, t.slug AS subtitle
          FROM tags t
          WHERE t.deleted_at IS NULL
            AND (t.name LIKE ? OR t.slug LIKE ?)
          ORDER BY t.name
          LIMIT 6
        `,
        [like, like]
      ),
      dbQuery(
        `
          SELECT id, name AS title, CONCAT(type, ' collection') AS subtitle
          FROM collections
          WHERE deleted_at IS NULL
            AND (name LIKE ? OR slug LIKE ? OR description LIKE ?)
          ORDER BY updated_at DESC
          LIMIT 6
        `,
        [like, like, like]
      ),
      dbQuery(
        `
          SELECT id, title, CONCAT(type, ' menu') AS subtitle
          FROM menus
          WHERE deleted_at IS NULL
            AND (title LIKE ? OR url LIKE ? OR type LIKE ?)
          ORDER BY sort_order, title
          LIMIT 6
        `,
        [like, like, like]
      ),
    ]);

    const moduleResults = [
      ["Dashboard", "/", "Module"],
      ["Website Products", "/product", "Module"],
      ["Brand Management", "/brands", "Module"],
      ["Tag Management", "/tags", "Module"],
      ["Collection Management", "/collections", "Module"],
      ["Menu Management", "/menus", "Module"],
      ["Order Management", "/orders", "Module"],
      ["Staff Management", "/staff", "Module"],
      ["Customers", "/customers", "Module"],
      ["Inventory", "/inventory", "Module"],
      ["Shipping", "/shipping", "Module"],
      ["Warehouse Management", "/warehouse", "Module"],
      ["Store Settings", "/store", "Module"],
      ["Discount Management", "/discounts", "Module"],
      ["Payments", "/payments", "Module"],
      ["Billing Management", "/generate-bill", "Module"],
      ["Supplier Management", "/supplier", "Module"],
      ["Reports", "/reports", "Module"],
      ["Blog", "/blog", "Module"],
      ["Profile Details", "/profile", "Module"],
      ["Activity Log", "/activity", "Module"],
    ]
      .filter(([title]) => title.toLowerCase().includes(query.toLowerCase()))
      .map(([title, path, type]) => ({ title, path, type, subtitle: "Admin module" }));

    res.json({
      results: [
        ...moduleResults,
        ...products.map((item) => ({ ...item, type: "Product", path: `/product?search=${encodeURIComponent(item.title)}` })),
        ...brands.map((item) => ({ ...item, type: "Brand", path: `/brands/${item.id}` })),
        ...tags.map((item) => ({ ...item, type: "Tag", path: `/tags?search=${encodeURIComponent(item.title || "")}` })),
        ...collections.map((item) => ({ ...item, type: "Collection", path: `/collections/${item.id}` })),
        ...menus.map((item) => ({ ...item, type: "Menu", path: "/menus" })),
        ...orders.map((item) => ({ ...item, type: "Order", path: `/orders?search=${encodeURIComponent(item.title)}` })),
        ...staff.map((item) => ({ ...item, type: "Staff", path: `/staff/${item.id}` })),
        ...customers.map((item) => ({ ...item, type: "Customer", path: `/customers?search=${encodeURIComponent(item.title || "")}` })),
        ...categories.map((item) => ({ ...item, type: "Category", path: "/categories" })),
        ...warehouse.map((item) => ({ ...item, type: "Warehouse", path: "/warehouse" })),
        ...discounts.map((item) => ({ ...item, type: "Discount", path: `/discounts?q=${encodeURIComponent(item.title || "")}` })),
      ].slice(0, 20),
    });
  } catch (error) {
    moduleResponse(res, error, "Failed to search admin data");
  }
}

export async function getAdminNotifications(_req, res) {
  try {
    const notifications = await dbQuery(`
      SELECT id, type, title, message, link, is_read, created_at
      FROM admin_notifications
      ORDER BY created_at DESC
      LIMIT 30
    `);

    res.json({
      unreadCount: notifications.filter((item) => !item.is_read).length,
      notifications,
    });
  } catch (error) {
    moduleResponse(res, error, "Failed to load notifications");
  }
}

export async function markAdminNotificationsRead(req, res) {
  const id = Number(req.params.id);

  try {
    if (id) {
      await dbQuery("UPDATE admin_notifications SET is_read = TRUE WHERE id = ?", [id]);
    } else {
      await dbQuery("UPDATE admin_notifications SET is_read = TRUE WHERE is_read = FALSE");
    }

    res.json({ message: "Notifications marked as read" });
  } catch (error) {
    moduleResponse(res, error, "Failed to update notifications");
  }
}

export async function getAdminCustomers(_req, res) {
  try {
    const customers = await dbQuery(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.is_verified,
        u.created_at,
        COUNT(o.id) AS total_orders,
        COALESCE(SUM(o.total_amount), 0) AS lifetime_value,
        MAX(o.created_at) AS last_order_at
      FROM users u
      LEFT JOIN orders o
        ON o.user_id = u.id
        OR (u.email IS NOT NULL AND o.customer_email = u.email)
        OR (u.phone IS NOT NULL AND o.customer_phone = u.phone)
      GROUP BY u.id, u.name, u.email, u.phone, u.is_verified, u.created_at
      ORDER BY u.created_at DESC
    `);

    const totalValue = customers.reduce(
      (sum, customer) => sum + Number(customer.lifetime_value || 0),
      0
    );

    res.json({
      summary: {
        totalCustomers: customers.length,
        verifiedCustomers: customers.filter((item) => item.is_verified).length,
        repeatCustomers: customers.filter((item) => Number(item.total_orders) > 1)
          .length,
        lifetimeValue: totalValue,
      },
      customers,
    });
  } catch (error) {
    moduleResponse(res, error, "Failed to load customers");
  }
}

export async function getAdminCustomerDetail(req, res) {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ message: "Invalid customer ID" });
  }

  try {
    const rows = await dbQuery(
      `
        SELECT id, name, email, phone, is_verified, created_at, updated_at
        FROM users
        WHERE id = ?
      `,
      [id]
    );
    const customer = rows[0];

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const orders = await dbQuery(
      `
        SELECT
          id,
          order_number,
          total_amount,
          order_status,
          created_at,
          payment_method
        FROM orders
        WHERE user_id = ?
          OR (? <> '' AND customer_email = ?)
          OR (? <> '' AND customer_phone = ?)
        ORDER BY created_at DESC
      `,
      [id, customer.email || "", customer.email || "", customer.phone || "", customer.phone || ""]
    );

    res.json({
      customer,
      orders,
      summary: {
        totalOrders: orders.length,
        lifetimeValue: orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0),
      },
    });
  } catch (error) {
    moduleResponse(res, error, "Failed to load customer detail");
  }
}

export async function createAdminCustomer(req, res) {
  const name = cleanString(req.body?.name);
  const email = cleanString(req.body?.email).toLowerCase();
  const phone = cleanString(req.body?.phone);
  const isVerified = Boolean(req.body?.is_verified ?? req.body?.isVerified ?? true);

  if (!name && !email && !phone) {
    return res.status(400).json({ message: "Name, email or phone is required" });
  }

  try {
    const result = await dbQuery(
      `
        INSERT INTO users (name, email, phone, is_verified)
        VALUES (?, ?, ?, ?)
      `,
      [name || null, email || null, phone || null, isVerified]
    );

    await logActivity(req, "Created customer", "Customers", email || phone || name);
    res.status(201).json({
      customer: {
        id: result.insertId,
        name,
        email,
        phone,
        is_verified: isVerified,
      },
    });
  } catch (error) {
    moduleResponse(res, error, "Failed to create customer");
  }
}

export async function deleteAdminCustomer(req, res) {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ message: "Invalid customer ID" });
  }

  try {
    await dbQuery("DELETE FROM users WHERE id = ?", [id]);
    await logActivity(req, "Deleted customer", "Customers", `USR-${id}`);
    res.json({ message: "Customer deleted" });
  } catch (error) {
    moduleResponse(res, error, "Failed to delete customer");
  }
}

export async function getAdminInventory(_req, res) {
  try {
    const products = await dbQuery(`
      SELECT
        p.id,
        p.sku,
        p.name,
        p.price,
        p.stock_quantity,
        p.reorder_level,
        p.status,
        c.name AS category_name,
        COALESCE(SUM(ws.stock_on_hand), 0) AS warehouse_stock,
        COALESCE(SUM(ws.reserved_stock), 0) AS reserved_stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN warehouse_stock ws ON p.id = ws.product_id
      GROUP BY p.id, p.sku, p.name, p.price, p.stock_quantity, p.reorder_level, p.status, c.name
      ORDER BY p.id DESC
    `);

    const lowStock = products.filter(
      (product) =>
        Number(product.warehouse_stock || product.stock_quantity || 0) <=
        Number(product.reorder_level || 0)
    );

    res.json({
      summary: {
        totalSkus: products.length,
        lowStock: lowStock.length,
        totalStock: products.reduce(
          (sum, item) => sum + Number(item.warehouse_stock || item.stock_quantity || 0),
          0
        ),
        reservedStock: products.reduce(
          (sum, item) => sum + Number(item.reserved_stock || 0),
          0
        ),
      },
      products,
    });
  } catch (error) {
    moduleResponse(res, error, "Failed to load inventory");
  }
}

export async function createAdminOrder(req, res) {
  const customer = req.body?.customer || {};
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const status = cleanString(req.body?.status || "Processing");

  if (!items.length) {
    return res.status(400).json({ message: "Order must contain at least one item" });
  }

  const normalizedItems = items
    .map((item) => {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const price = toMoney(item.price);
      return {
        productId: Number(item.product_id || item.productId || item.id) || null,
        variantId: Number(item.variant_id || item.variantId) || null,
        variantSku: cleanString(item.variant_sku || item.variantSku),
        variantTitle: cleanString(item.variant_title || item.variantTitle),
        variantOptions: Array.isArray(item.variantOptions || item.variant_options)
          ? item.variantOptions || item.variant_options
          : [],
        productName: cleanString(item.product_name || item.name) || "Product",
        quantity,
        price,
        lineTotal: toMoney(quantity * price),
      };
    })
    .filter((item) => item.price >= 0 && item.quantity > 0);

  if (!normalizedItems.length) {
    return res.status(400).json({ message: "Order items are invalid" });
  }

  const subtotal = toMoney(
    req.body?.subtotal ?? normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0)
  );
  const shippingFee = toMoney(req.body?.shippingFee);
  const taxAmount = toMoney(req.body?.taxAmount);
  const totalAmount = toMoney(req.body?.totalAmount ?? subtotal + shippingFee + taxAmount);
  const customerName = cleanString(customer.name) || "Admin Customer";
  const email = cleanString(customer.email) || null;
  const phone = cleanString(customer.phone) || null;

  try {
    const orderNumber = createOrderNumber();
    const orderResult = await dbQuery(
      `
        INSERT INTO orders (
          order_number, user_id, customer_name, customer_email, customer_phone,
          street_address, city, state, zip_code, payment_method,
          subtotal, shipping_fee, tax_amount, total_amount, order_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        orderNumber,
        Number(customer.userId) || null,
        customerName,
        email,
        phone,
        cleanString(customer.streetAddress) || null,
        cleanString(customer.city) || null,
        cleanString(customer.state) || null,
        cleanString(customer.zipCode) || null,
        cleanString(customer.paymentMethod || req.body?.paymentMethod) || "Cash on Delivery",
        subtotal,
        shippingFee,
        taxAmount,
        totalAmount,
        status,
      ]
    );

    await Promise.all(
      normalizedItems.map((item) =>
        dbQuery(
          `
            INSERT INTO order_items (
              order_id,
              product_id,
              variant_id,
              variant_sku,
              variant_title,
              variant_options,
              product_name,
              quantity,
              price,
              line_total
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            orderResult.insertId,
            item.productId,
            item.variantId,
            item.variantSku || null,
            item.variantTitle || null,
            item.variantOptions.length ? JSON.stringify(item.variantOptions) : null,
            item.productName,
            item.quantity,
            item.price,
            item.lineTotal,
          ]
        )
      )
    );

    await logActivity(req, "Created order", "Orders", orderNumber);
    queueOrderConfirmationSms({
      phone,
      customerName,
      orderNumber,
      totalAmount,
    });
    res.status(201).json({
      order: {
        id: orderResult.insertId,
        order_number: orderNumber,
      },
    });
  } catch (error) {
    moduleResponse(res, error, "Failed to create order");
  }
}

export async function getAdminWarehouse(_req, res) {
  try {
    const facilities = await dbQuery(`
      SELECT
        wl.id,
        wl.code,
        wl.name,
        wl.location,
        wl.capacity_units,
        wl.status,
        wl.google_sheet_id,
        wl.google_sheet_url,
        wl.last_synced_at,
        COALESCE(SUM(ws.stock_on_hand), 0) AS used_units,
        COUNT(ws.id) AS listed_products
      FROM warehouse_locations wl
      LEFT JOIN warehouse_stock ws ON wl.id = ws.warehouse_id
      GROUP BY wl.id, wl.code, wl.name, wl.location, wl.capacity_units, wl.status, wl.google_sheet_id, wl.google_sheet_url, wl.last_synced_at
      ORDER BY wl.id
    `);

    const stock = await dbQuery(`
      SELECT
        ws.id,
        ws.product_id,
        ws.warehouse_product_id,
        CASE WHEN ws.warehouse_product_id IS NULL THEN 'Website' ELSE 'Warehouse' END AS product_source,
        ws.sku,
        ws.google_sheet_row_id,
        ws.stock_on_hand,
        ws.reserved_stock,
        ws.reorder_level,
        ws.approval_status,
        ws.last_synced_at,
        COALESCE(p.name, wp.name) AS product_name,
        COALESCE(p.price, wp.mrp, wp.purchase_price, 0) AS price,
        COALESCE(c.name, wp.category, 'Warehouse') AS category_name,
        wl.code AS warehouse_code,
        wl.name AS warehouse_name
      FROM warehouse_stock ws
      LEFT JOIN products p ON ws.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN warehouse_products wp ON ws.warehouse_product_id = wp.id
      JOIN warehouse_locations wl ON ws.warehouse_id = wl.id
      WHERE p.id IS NOT NULL OR wp.id IS NOT NULL
      ORDER BY ws.updated_at DESC
      LIMIT 200
    `);

    const movements = await dbQuery(`
      SELECT
        sm.id,
        sm.movement_type,
        sm.quantity,
        sm.reference,
        sm.status,
        sm.requested_by,
        sm.approved_by,
        sm.created_at,
        sm.approved_at,
        sm.product_id,
        sm.warehouse_product_id,
        CASE WHEN sm.warehouse_product_id IS NULL THEN 'Website' ELSE 'Warehouse' END AS product_source,
        COALESCE(p.name, wp.name) AS product_name,
        wl.name AS warehouse_name
      FROM stock_movements sm
      LEFT JOIN products p ON sm.product_id = p.id
      LEFT JOIN warehouse_products wp ON sm.warehouse_product_id = wp.id
      JOIN warehouse_locations wl ON sm.warehouse_id = wl.id
      WHERE p.id IS NOT NULL OR wp.id IS NOT NULL
      ORDER BY sm.created_at DESC
      LIMIT 100
    `);

    const warehouseProducts = await dbQuery(`
      SELECT id, sku, name, description, category, unit, purchase_price, mrp, status, created_at
      FROM warehouse_products
      ORDER BY updated_at DESC, id DESC
      LIMIT 300
    `);

    const usedUnits = facilities.reduce(
      (sum, item) => sum + Number(item.used_units || 0),
      0
    );
    const capacityUnits = facilities.reduce(
      (sum, item) => sum + Number(item.capacity_units || 0),
      0
    );

    res.json({
      sheetConnection: {
        provider: "Google Sheets",
        status: "Ready for connector keys",
        syncedSheets: facilities.filter((item) => item.google_sheet_url || item.google_sheet_id).length,
        lastSync: facilities[0]?.last_synced_at || null,
        sheetUrl: facilities[0]?.google_sheet_url || "",
      },
      summary: {
        warehouses: facilities.length,
        listedProducts: stock.length,
        usedUnits,
        capacityUnits,
        pendingApprovals: movements.filter((item) => item.status === "Pending")
          .length,
      },
      facilities,
      stock,
      movements,
      warehouseProducts,
    });
  } catch (error) {
    moduleResponse(res, error, "Failed to load warehouse data");
  }
}

export async function createWarehouseProduct(req, res) {
  const sku = cleanString(req.body?.sku);
  const name = cleanString(req.body?.name);
  const description = cleanString(req.body?.description);
  const category = cleanString(req.body?.category);
  const unit = cleanString(req.body?.unit || "pcs");
  const purchasePrice = toMoney(req.body?.purchase_price ?? req.body?.purchasePrice);
  const mrp = toMoney(req.body?.mrp);
  const status = cleanString(req.body?.status || "Active");

  if (!sku || !name) {
    return res.status(400).json({ message: "SKU and product name are required" });
  }

  try {
    const result = await dbQuery(
      `
        INSERT INTO warehouse_products
          (sku, name, description, category, unit, purchase_price, mrp, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          description = VALUES(description),
          category = VALUES(category),
          unit = VALUES(unit),
          purchase_price = VALUES(purchase_price),
          mrp = VALUES(mrp),
          status = VALUES(status)
      `,
      [sku, name, description || null, category || null, unit, purchasePrice, mrp, status, req.admin?.email || "Admin"]
    );

    const rows = await dbQuery("SELECT id FROM warehouse_products WHERE sku = ? LIMIT 1", [sku]);
    await logActivity(req, "Saved warehouse-only product", "Warehouse", name);
    res.status(201).json({
      message: "Warehouse product saved",
      product: {
        id: rows[0]?.id || result.insertId,
        sku,
        name,
      },
    });
  } catch (error) {
    moduleResponse(res, error, "Failed to save warehouse product");
  }
}

export async function createWarehouseStock(req, res) {
  const { productId, warehouseProductId } = warehouseProductRef(req.body);
  const warehouseId = Number(req.body?.warehouse_id || req.body?.warehouseId);
  const stockOnHand = Math.max(0, Number(req.body?.stock_on_hand ?? req.body?.stockOnHand ?? 0) || 0);
  const reservedStock = Math.max(0, Number(req.body?.reserved_stock ?? req.body?.reservedStock ?? 0) || 0);
  const reorderLevel = Math.max(0, Number(req.body?.reorder_level ?? req.body?.reorderLevel ?? 0) || 0);
  const sku = cleanString(req.body?.sku);

  if ((!productId && !warehouseProductId) || !warehouseId) {
    return res.status(400).json({ message: "Product and warehouse are required" });
  }

  try {
    const productRows = productId
      ? await dbQuery("SELECT sku FROM products WHERE id = ? LIMIT 1", [productId])
      : await dbQuery("SELECT sku FROM warehouse_products WHERE id = ? LIMIT 1", [warehouseProductId]);
    const storedSku = productRows[0]?.sku || sku || null;

    await dbQuery(
      `
        INSERT INTO warehouse_stock
          (product_id, warehouse_product_id, warehouse_id, sku, stock_on_hand, reserved_stock, reorder_level, approval_status, last_synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Approved', NOW())
        ON DUPLICATE KEY UPDATE
          sku = VALUES(sku),
          stock_on_hand = VALUES(stock_on_hand),
          reserved_stock = VALUES(reserved_stock),
          reorder_level = VALUES(reorder_level),
          last_synced_at = NOW()
      `,
      [productId, warehouseProductId, warehouseId, storedSku, stockOnHand, reservedStock, reorderLevel]
    );

    await logActivity(req, "Saved warehouse stock", "Warehouse", productRefLabel({ productId, warehouseProductId }));
    res.json({ message: "Warehouse stock saved" });
  } catch (error) {
    moduleResponse(res, error, "Failed to save warehouse stock");
  }
}

export async function syncWebsiteProductsToWarehouse(req, res) {
  const warehouseId = Number(req.body?.warehouse_id || req.body?.warehouseId);

  if (!warehouseId) {
    return res.status(400).json({ message: "Warehouse is required" });
  }

  try {
    const products = await dbQuery(`
      SELECT id, sku, stock_quantity, reorder_level
      FROM products
      ORDER BY id
    `);

    for (const product of products) {
      await dbQuery(
        `
          INSERT INTO warehouse_stock
            (product_id, warehouse_product_id, warehouse_id, sku, stock_on_hand, reserved_stock, reorder_level, approval_status, last_synced_at)
          VALUES (?, NULL, ?, ?, 0, 0, ?, 'Approved', NOW())
          ON DUPLICATE KEY UPDATE
            sku = VALUES(sku),
            reorder_level = VALUES(reorder_level)
        `,
        [product.id, warehouseId, product.sku || `LM-${product.id}`, product.reorder_level || 0]
      );
    }

    await logActivity(req, "Synced website products to warehouse", "Warehouse", `${products.length} products`);
    res.json({ message: "Website products synced to warehouse", count: products.length });
  } catch (error) {
    moduleResponse(res, error, "Failed to sync website products");
  }
}

export async function createStockMovement(req, res) {
  const { productId, warehouseProductId } = warehouseProductRef(req.body);
  const warehouseId = Number(req.body?.warehouse_id || req.body?.warehouseId);
  const movementType = cleanString(req.body?.movement_type || req.body?.movementType);
  const quantity = Math.max(1, Number(req.body?.quantity) || 0);
  const reference = cleanString(req.body?.reference);

  if ((!productId && !warehouseProductId) || !warehouseId || !["Inward", "Outward"].includes(movementType) || !quantity) {
    return res.status(400).json({ message: "Product, warehouse, movement type and quantity are required" });
  }

  try {
    const products = productId
      ? await dbQuery("SELECT sku, reorder_level FROM products WHERE id = ? LIMIT 1", [productId])
      : await dbQuery("SELECT sku, 10 AS reorder_level FROM warehouse_products WHERE id = ? LIMIT 1", [warehouseProductId]);
    const product = products[0];

    await dbQuery(
      `
        INSERT INTO warehouse_stock
          (product_id, warehouse_product_id, warehouse_id, sku, stock_on_hand, reserved_stock, reorder_level, approval_status, last_synced_at)
        VALUES (?, ?, ?, ?, 0, 0, ?, 'Approved', NOW())
        ON DUPLICATE KEY UPDATE
          sku = COALESCE(VALUES(sku), sku)
      `,
      [productId, warehouseProductId, warehouseId, product?.sku || null, product?.reorder_level || 0]
    );

    await dbQuery(
      `
        INSERT INTO stock_movements
          (product_id, warehouse_product_id, warehouse_id, movement_type, quantity, reference, status, requested_by)
        VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)
      `,
      [productId, warehouseProductId, warehouseId, movementType, quantity, reference || null, req.admin?.email || "Admin"]
    );

    await logActivity(req, `Created ${movementType} entry`, "Warehouse", reference || productRefLabel({ productId, warehouseProductId }));
    res.status(201).json({ message: `${movementType} entry submitted for approval` });
  } catch (error) {
    moduleResponse(res, error, "Failed to create stock movement");
  }
}

export async function updateWarehouseSheet(req, res) {
  const warehouseId = Number(req.params.id);
  const sheetUrl = cleanString(req.body?.google_sheet_url || req.body?.sheetUrl);
  const sheetId = cleanString(req.body?.google_sheet_id || req.body?.sheetId);

  if (!warehouseId) {
    return res.status(400).json({ message: "Invalid warehouse ID" });
  }

  try {
    await dbQuery(
      `
        UPDATE warehouse_locations
        SET google_sheet_url = ?, google_sheet_id = COALESCE(NULLIF(?, ''), google_sheet_id)
        WHERE id = ?
      `,
      [sheetUrl || null, sheetId, warehouseId]
    );

    await logActivity(req, "Updated Google Sheet connection", "Warehouse", `Warehouse ${warehouseId}`);
    res.json({ message: "Google Sheet connection saved" });
  } catch (error) {
    moduleResponse(res, error, "Failed to save Google Sheet connection");
  }
}

export async function syncWarehouseGoogleSheet(req, res) {
  const warehouseId = Number(req.params.id);

  if (!warehouseId) {
    return res.status(400).json({ message: "Invalid warehouse ID" });
  }

  try {
    const rows = await dbQuery("SELECT * FROM warehouse_locations WHERE id = ?", [warehouseId]);
    const warehouse = rows[0];

    if (!warehouse?.google_sheet_url && !warehouse?.google_sheet_id) {
      return res.status(400).json({ message: "Google Sheet URL is not configured" });
    }

    const response = await fetch(googleSheetCsvUrl(warehouse.google_sheet_url || warehouse.google_sheet_id));
    if (!response.ok) {
      return res.status(400).json({ message: "Unable to read Google Sheet. Publish it as CSV or share it publicly." });
    }

    const text = await response.text();
    const [headers = [], ...dataRows] = csvRows(text);
    const normalizedHeaders = headers.map((header) => header.toLowerCase().replace(/\s+/g, "_"));
    let synced = 0;

    for (const row of dataRows) {
      const data = Object.fromEntries(normalizedHeaders.map((header, index) => [header, row[index] || ""]));
      const sku = cleanString(data.sku);
      const productName = cleanString(data.product_name || data.name);
      const productRows = sku
        ? await dbQuery("SELECT id, reorder_level FROM products WHERE sku = ? LIMIT 1", [sku])
        : await dbQuery("SELECT id, reorder_level FROM products WHERE name = ? LIMIT 1", [productName]);
      let product = productRows[0];
      let warehouseProduct = null;

      if (!product) {
        const warehouseProductRows = sku
          ? await dbQuery("SELECT id, sku FROM warehouse_products WHERE sku = ? LIMIT 1", [sku])
          : await dbQuery("SELECT id, sku FROM warehouse_products WHERE name = ? LIMIT 1", [productName]);
        warehouseProduct = warehouseProductRows[0];
      }

      if (!product && !warehouseProduct && productName) {
        const generatedSku = sku || `WH-${Date.now()}-${synced + 1}`;
        await dbQuery(
          `
            INSERT INTO warehouse_products
              (sku, name, description, category, unit, purchase_price, mrp, status, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', 'Google Sheet Sync')
            ON DUPLICATE KEY UPDATE
              name = VALUES(name),
              description = VALUES(description),
              category = VALUES(category),
              unit = VALUES(unit),
              purchase_price = VALUES(purchase_price),
              mrp = VALUES(mrp),
              status = 'Active'
          `,
          [
            generatedSku,
            productName,
            cleanString(data.description) || null,
            cleanString(data.category) || null,
            cleanString(data.unit || "pcs"),
            Number(data.purchase_price || data.cost || 0) || 0,
            Number(data.mrp || data.price || 0) || 0,
          ]
        );
        const warehouseProductRows = await dbQuery("SELECT id, sku FROM warehouse_products WHERE sku = ? LIMIT 1", [generatedSku]);
        warehouseProduct = warehouseProductRows[0];
      }

      if (!product && !warehouseProduct) continue;

      await dbQuery(
        `
          INSERT INTO warehouse_stock
            (product_id, warehouse_product_id, warehouse_id, sku, google_sheet_row_id, stock_on_hand, reserved_stock, reorder_level, approval_status, last_synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Approved', NOW())
          ON DUPLICATE KEY UPDATE
            sku = VALUES(sku),
            google_sheet_row_id = VALUES(google_sheet_row_id),
            stock_on_hand = VALUES(stock_on_hand),
            reserved_stock = VALUES(reserved_stock),
            reorder_level = VALUES(reorder_level),
            last_synced_at = NOW()
      `,
        [
          product?.id || null,
          warehouseProduct?.id || null,
          warehouseId,
          sku || warehouseProduct?.sku || null,
          cleanString(data.row_id || data.google_sheet_row_id) || null,
          Number(data.stock_on_hand || data.stock || 0) || 0,
          Number(data.reserved_stock || data.reserved || 0) || 0,
          Number(data.reorder_level ?? product?.reorder_level ?? 0) || 0,
        ]
      );
      synced += 1;
    }

    await dbQuery("UPDATE warehouse_locations SET last_synced_at = NOW() WHERE id = ?", [warehouseId]);
    await logActivity(req, "Synced Google Sheet stock", "Warehouse", `${synced} rows`);
    res.json({ message: "Google Sheet synced", synced });
  } catch (error) {
    moduleResponse(res, error, "Failed to sync Google Sheet");
  }
}

export async function approveStockMovement(req, res) {
  const id = Number(req.params.id);
  const status = String(req.body?.status || "Approved").trim();

  if (!id || !["Approved", "Rejected"].includes(status)) {
    return res.status(400).json({ message: "Invalid approval request" });
  }

  try {
    const rows = await dbQuery("SELECT * FROM stock_movements WHERE id = ?", [id]);
    const movement = rows[0];

    if (!movement) {
      return res.status(404).json({ message: "Stock movement not found" });
    }

    await dbQuery(
      `
        UPDATE stock_movements
        SET status = ?, approved_by = ?, approved_at = NOW()
        WHERE id = ?
      `,
      [status, req.admin?.email || "Admin", id]
    );

    if (status === "Approved" && movement.status !== "Approved") {
      const sign = movement.movement_type === "Outward" ? -1 : 1;
      if (movement.product_id) {
        await dbQuery(
          `
            UPDATE warehouse_stock
            SET stock_on_hand = GREATEST(0, stock_on_hand + ?)
            WHERE product_id = ? AND warehouse_id = ?
          `,
          [sign * Number(movement.quantity || 0), movement.product_id, movement.warehouse_id]
        );
      } else {
        await dbQuery(
          `
            UPDATE warehouse_stock
            SET stock_on_hand = GREATEST(0, stock_on_hand + ?)
            WHERE warehouse_product_id = ? AND warehouse_id = ?
          `,
          [sign * Number(movement.quantity || 0), movement.warehouse_product_id, movement.warehouse_id]
        );
      }
    }

    await logActivity(req, `${status} stock movement`, "Warehouse", movement.reference);

    res.json({ message: `Stock movement ${status.toLowerCase()}` });
  } catch (error) {
    moduleResponse(res, error, "Failed to update stock movement");
  }
}

export async function getAdminStoreSettings(_req, res) {
  try {
    const settings = await dbQuery(`
      SELECT id, setting_key, setting_value, category, updated_at
      FROM store_settings
      ORDER BY category, setting_key
    `);
    const categories = await dbQuery(`
      SELECT id, name
      FROM categories
      ORDER BY name
    `);
    const taxRules = await dbQuery(`
      SELECT
        ctr.id,
        ctr.category_id,
        c.name AS category_name,
        ctr.tax_name,
        ctr.tax_rate,
        ctr.status,
        ctr.updated_at
      FROM category_tax_rules ctr
      JOIN categories c ON ctr.category_id = c.id
      ORDER BY c.name, ctr.tax_name
    `);

    res.json({ settings, categories, taxRules });
  } catch (error) {
    moduleResponse(res, error, "Failed to load store settings");
  }
}

export async function updateAdminStoreSetting(req, res) {
  const key = String(req.params.key || "").trim();
  const value = String(req.body?.value ?? "").trim();

  if (!key) {
    return res.status(400).json({ message: "Setting key is required" });
  }

  try {
    await dbQuery(
      `
        UPDATE store_settings
        SET setting_value = ?
        WHERE setting_key = ?
      `,
      [value, key]
    );

    await logActivity(req, "Updated store setting", "Store", key);
    res.json({ message: "Store setting updated" });
  } catch (error) {
    moduleResponse(res, error, "Failed to update store setting");
  }
}

export async function getAdminShipping(_req, res) {
  try {
    const rules = await dbQuery(`
      SELECT id, name, region, min_order_value, charge, delivery_days, eta, status
      FROM shipping_rules
      ORDER BY min_order_value, id
    `);
    const orders = await dbQuery(`
      SELECT id, order_number, customer_name, city, state, shipping_fee, order_status, created_at
      FROM orders
      ORDER BY created_at DESC
      LIMIT 80
    `);
    const activeOrders = orders.filter((order) =>
      ["Pending", "Processing", "Dispatched", "In Transit"].includes(order.order_status)
    );
    const history = orders.filter((order) =>
      ["Delivered", "Cancelled"].includes(order.order_status)
    );

    res.json({
      summary: {
        activeRules: rules.filter((rule) => rule.status === "Active").length,
        freeShippingRules: rules.filter((rule) => Number(rule.charge) === 0).length,
        dispatchQueue: activeOrders.length,
        dispatchedHistory: history.length,
      },
      rules,
      dispatchQueue: activeOrders,
      history,
    });
  } catch (error) {
    moduleResponse(res, error, "Failed to load shipping data");
  }
}

export async function createShippingRule(req, res) {
  const name = cleanString(req.body?.name) || "Shipping Rule";
  const region = cleanString(req.body?.region) || "All India";
  const minOrderValue = toMoney(req.body?.min_order_value ?? req.body?.minOrderValue);
  const charge = toMoney(req.body?.charge);
  const deliveryDays = Math.max(1, Number(req.body?.delivery_days ?? req.body?.deliveryDays ?? 3) || 3);
  const status = cleanString(req.body?.status || "Active");

  try {
    await dbQuery(
      `
        INSERT INTO shipping_rules (name, region, min_order_value, charge, delivery_days, eta, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [name, region, minOrderValue, charge, deliveryDays, `${deliveryDays} days`, status]
    );

    await logActivity(req, "Created shipping rule", "Shipping", name);
    res.status(201).json({ message: "Shipping rule created" });
  } catch (error) {
    moduleResponse(res, error, "Failed to create shipping rule");
  }
}

export async function updateShippingRule(req, res) {
  const id = Number(req.params.id);
  const name = cleanString(req.body?.name) || "Shipping Rule";
  const region = cleanString(req.body?.region) || "All India";
  const minOrderValue = toMoney(req.body?.min_order_value ?? req.body?.minOrderValue);
  const charge = toMoney(req.body?.charge);
  const deliveryDays = Math.max(1, Number(req.body?.delivery_days ?? req.body?.deliveryDays ?? 3) || 3);
  const status = cleanString(req.body?.status || "Active");

  if (!id) {
    return res.status(400).json({ message: "Invalid shipping rule ID" });
  }

  try {
    await dbQuery(
      `
        UPDATE shipping_rules
        SET name = ?, region = ?, min_order_value = ?, charge = ?, delivery_days = ?, eta = ?, status = ?
        WHERE id = ?
      `,
      [name, region, minOrderValue, charge, deliveryDays, `${deliveryDays} days`, status, id]
    );

    await logActivity(req, "Updated shipping rule", "Shipping", name);
    res.json({ message: "Shipping rule updated" });
  } catch (error) {
    moduleResponse(res, error, "Failed to update shipping rule");
  }
}

export async function deleteShippingRule(req, res) {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ message: "Invalid shipping rule ID" });
  }

  try {
    await dbQuery("DELETE FROM shipping_rules WHERE id = ?", [id]);
    await logActivity(req, "Deleted shipping rule", "Shipping", `Rule ${id}`);
    res.json({ message: "Shipping rule deleted" });
  } catch (error) {
    moduleResponse(res, error, "Failed to delete shipping rule");
  }
}

export async function getAdminTaxRules(_req, res) {
  try {
    const rules = await dbQuery(`
      SELECT
        ctr.id,
        ctr.category_id,
        c.name AS category_name,
        ctr.tax_name,
        ctr.tax_rate,
        ctr.status,
        ctr.updated_at
      FROM category_tax_rules ctr
      JOIN categories c ON ctr.category_id = c.id
      ORDER BY c.name, ctr.tax_name
    `);

    res.json({ rules });
  } catch (error) {
    moduleResponse(res, error, "Failed to load tax rules");
  }
}

export async function createAdminTaxRule(req, res) {
  const categoryId = Number(req.body?.category_id || req.body?.categoryId);
  const taxName = cleanString(req.body?.tax_name || req.body?.taxName || "GST");
  const taxRate = Number(req.body?.tax_rate ?? req.body?.taxRate ?? 0);
  const status = cleanString(req.body?.status || "Active");

  if (!categoryId || taxRate < 0) {
    return res.status(400).json({ message: "Category and tax rate are required" });
  }

  try {
    await dbQuery(
      `
        INSERT INTO category_tax_rules (category_id, tax_name, tax_rate, status)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          tax_rate = VALUES(tax_rate),
          status = VALUES(status)
      `,
      [categoryId, taxName, taxRate, status]
    );

    await logActivity(req, "Saved tax rule", "Store", `${taxName} ${taxRate}%`);
    res.status(201).json({ message: "Tax rule saved" });
  } catch (error) {
    moduleResponse(res, error, "Failed to save tax rule");
  }
}

export async function updateAdminTaxRule(req, res) {
  const id = Number(req.params.id);
  const categoryId = Number(req.body?.category_id || req.body?.categoryId);
  const taxName = cleanString(req.body?.tax_name || req.body?.taxName || "GST");
  const taxRate = Number(req.body?.tax_rate ?? req.body?.taxRate ?? 0);
  const status = cleanString(req.body?.status || "Active");

  if (!id || !categoryId || taxRate < 0) {
    return res.status(400).json({ message: "Valid tax rule details are required" });
  }

  try {
    await dbQuery(
      `
        UPDATE category_tax_rules
        SET category_id = ?, tax_name = ?, tax_rate = ?, status = ?
        WHERE id = ?
      `,
      [categoryId, taxName, taxRate, status, id]
    );

    await logActivity(req, "Updated tax rule", "Store", `${taxName} ${taxRate}%`);
    res.json({ message: "Tax rule updated" });
  } catch (error) {
    moduleResponse(res, error, "Failed to update tax rule");
  }
}

export async function deleteAdminTaxRule(req, res) {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ message: "Invalid tax rule ID" });
  }

  try {
    await dbQuery("DELETE FROM category_tax_rules WHERE id = ?", [id]);
    await logActivity(req, "Deleted tax rule", "Store", `Rule ${id}`);
    res.json({ message: "Tax rule deleted" });
  } catch (error) {
    moduleResponse(res, error, "Failed to delete tax rule");
  }
}

export async function getAdminBillingData(_req, res) {
  try {
    const bills = await dbQuery(`
      SELECT
        mb.*,
        o.order_number
      FROM manual_bills mb
      LEFT JOIN orders o ON mb.order_id = o.id
      ORDER BY mb.created_at DESC
      LIMIT 120
    `);
    const billItems = bills.length
      ? await dbQuery(
          `
            SELECT *
            FROM manual_bill_items
            WHERE bill_id IN (?)
            ORDER BY id
          `,
          [bills.map((bill) => bill.id)]
        )
      : [];
    const itemsByBill = billItems.reduce((groups, item) => {
      groups[item.bill_id] = groups[item.bill_id] || [];
      groups[item.bill_id].push(item);
      return groups;
    }, {});

    const formattedBills = bills.map((bill) => ({
      ...bill,
      items: itemsByBill[bill.id] || [],
    }));

    res.json({
      summary: {
        totalBills: bills.length,
        manualBills: bills.filter((bill) => bill.source_type === "Manual").length,
        orderBills: bills.filter((bill) => bill.source_type === "Order").length,
        totalValue: bills.reduce((sum, bill) => sum + Number(bill.total_amount || 0), 0),
      },
      bills: formattedBills,
      manualBills: formattedBills.filter((bill) => bill.source_type === "Manual"),
      orderBills: formattedBills.filter((bill) => bill.source_type === "Order"),
    });
  } catch (error) {
    moduleResponse(res, error, "Failed to load billing data");
  }
}

export async function createAdminBill(req, res) {
  const sourceType = cleanString(req.body?.sourceType || req.body?.source_type || "Manual") === "Order" ? "Order" : "Manual";
  const orderId = Number(req.body?.orderId || req.body?.order_id) || null;
  const customerId = Number(req.body?.customerId || req.body?.customer_id) || null;
  const customer = req.body?.customer || {};
  const billNumber = cleanString(req.body?.billNumber || req.body?.bill_number) || createBillNumber();
  const paymentLink = cleanString(req.body?.paymentLink || req.body?.payment_link);
  const notes = cleanString(req.body?.notes || "Thank you for your business.");
  let items = Array.isArray(req.body?.items) ? req.body.items : [];

  try {
    let order = null;
    if (sourceType === "Order" && orderId) {
      const orderRows = await dbQuery("SELECT * FROM orders WHERE id = ? LIMIT 1", [orderId]);
      order = orderRows[0] || null;
      if (!items.length) {
        items = await dbQuery(
          `
            SELECT product_id AS productId, product_name AS name, quantity, price,
                   line_total AS lineTotal, gst_inclusive AS gstInclusive,
                   gst_rate AS gstRate, gst_amount AS gstAmount
            FROM order_items
            WHERE order_id = ?
            ORDER BY id
          `,
          [orderId]
        );
      }
    }

    if (!items.length) {
      return res.status(400).json({ message: "Bill must contain at least one item" });
    }

    const normalizedItems = items
      .map((item) => {
        const ref = warehouseProductRef(item);
        const productSource = cleanString(item.productSource || item.product_source || (ref.warehouseProductId ? "Warehouse" : ref.productId ? "Website" : "Manual"));
        const quantity = Math.max(1, Number(item.quantity || item.qty) || 1);
        const price = toMoney(item.price);
        const itemName = cleanString(item.name || item.item_name || item.product_name) || "Manual Item";
        return {
          ...ref,
          productSource,
          itemName,
          hsnSacCode: cleanString(item.hsnSacCode || item.hsn_sac_code || item.hsn || item.hsnCode),
          unit: cleanString(item.unit || "Pcs."),
          discountRate: Number(item.discountRate ?? item.discount_rate ?? 0) || 0,
          quantity,
          price,
          lineTotal: toMoney(item.lineTotal ?? quantity * price),
          gstInclusive:
            item.gstInclusive ?? item.gst_inclusive ?? null,
          gstRate: Number(item.gstRate ?? item.gst_rate ?? 0),
          gstAmount: Number(item.gstAmount ?? item.gst_amount ?? 0),
        };
      })
      .filter((item) => item.itemName && item.quantity > 0);

    const websiteProductIds = [
      ...new Set(
        normalizedItems
          .filter((item) => item.productSource === "Website" && item.productId)
          .map((item) => Number(item.productId))
      ),
    ];
    const productTaxRows = websiteProductIds.length
      ? await dbQuery(
          `SELECT p.id, p.gst_inclusive, COALESCE(MAX(ctr.tax_rate), 0) AS gst_rate
           FROM products p
           LEFT JOIN category_tax_rules ctr
             ON ctr.category_id = p.category_id AND ctr.status = 'Active'
           WHERE p.id IN (${websiteProductIds.map(() => "?").join(",")})
           GROUP BY p.id, p.gst_inclusive`,
          websiteProductIds
        )
      : [];
    const productTaxMap = new Map(
      productTaxRows.map((row) => [Number(row.id), row])
    );
    normalizedItems.forEach((item) => {
      const taxProfile = productTaxMap.get(Number(item.productId));
      if (item.gstInclusive === null) {
        item.gstInclusive = taxProfile ? Boolean(Number(taxProfile.gst_inclusive)) : true;
        item.gstRate = item.gstInclusive ? 0 : Number(taxProfile?.gst_rate || 0);
        item.gstAmount = item.gstInclusive
          ? 0
          : toMoney(item.lineTotal * (item.gstRate / 100));
      } else {
        item.gstInclusive = Boolean(Number(item.gstInclusive));
        item.gstRate = item.gstInclusive ? 0 : Number(item.gstRate || 0);
        item.gstAmount = item.gstInclusive ? 0 : toMoney(item.gstAmount);
      }
    });

    const subtotal = toMoney(req.body?.subtotal ?? normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0));
    const taxAmount = toMoney(normalizedItems.reduce((sum, item) => sum + item.gstAmount, 0));
    const discountAmount = toMoney(req.body?.discountAmount ?? req.body?.discount_amount);
    const totalAmount = toMoney(req.body?.totalAmount ?? subtotal + taxAmount - discountAmount);
    const customerName =
      cleanString(customer.name || req.body?.customerName || req.body?.customer_name) ||
      cleanString(order?.customer_name) ||
      "Billing Customer";
    const customerEmail =
      cleanString(customer.email || req.body?.customerEmail || req.body?.customer_email) ||
      cleanString(order?.customer_email) ||
      null;
    const customerPhone =
      cleanString(customer.phone || req.body?.customerPhone || req.body?.customer_phone) ||
      cleanString(order?.customer_phone) ||
      null;
    const billingAddress =
      cleanString(customer.address || req.body?.billingAddress || req.body?.billing_address) ||
      [order?.street_address, order?.city, order?.state, order?.zip_code].filter(Boolean).join(", ") ||
      null;

    const result = await dbQuery(
      `
        INSERT INTO manual_bills
          (bill_number, source_type, order_id, customer_id, customer_name, customer_email, customer_phone, billing_address, subtotal, tax_amount, discount_amount, total_amount, payment_link, notes, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Generated', ?)
      `,
      [
        billNumber,
        sourceType,
        orderId,
        customerId,
        customerName,
        customerEmail,
        customerPhone,
        billingAddress,
        subtotal,
        taxAmount,
        discountAmount,
        totalAmount,
        paymentLink || null,
        notes || null,
        req.admin?.email || "Admin",
      ]
    );

    await Promise.all(
      normalizedItems.map((item) =>
        dbQuery(
          `
            INSERT INTO manual_bill_items
              (bill_id, product_source, product_id, warehouse_product_id, item_name, hsn_sac_code, unit, discount_rate, quantity, price, line_total, gst_inclusive, gst_rate, gst_amount)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            result.insertId,
            item.productSource,
            item.productId,
            item.warehouseProductId,
            item.itemName,
            item.hsnSacCode || null,
            item.unit || "Pcs.",
            item.discountRate,
            item.quantity,
            item.price,
            item.lineTotal,
            item.gstInclusive ? 1 : 0,
            item.gstRate,
            item.gstAmount,
          ]
        )
      )
    );

    await logActivity(req, "Created bill", "Billing", billNumber);
    res.status(201).json({
      message: "Bill generated",
      bill: {
        id: result.insertId,
        bill_number: billNumber,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        total_amount: totalAmount,
        source_type: sourceType,
      },
    });
  } catch (error) {
    moduleResponse(res, error, "Failed to create bill");
  }
}

export async function sendAdminBill(req, res) {
  const id = Number(req.params.id);
  const channel = cleanString(req.body?.channel || "WhatsApp");
  const manualRecipient = cleanString(req.body?.recipient);

  if (!id || !["WhatsApp", "Email", "SMS"].includes(channel)) {
    return res.status(400).json({ message: "Valid bill and channel are required" });
  }

  try {
    const rows = await dbQuery("SELECT * FROM manual_bills WHERE id = ? LIMIT 1", [id]);
    const bill = rows[0];
    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }

    const message = billMessage(bill);
    const recipient =
      manualRecipient ||
      (channel === "Email" ? bill.customer_email : bill.customer_phone);
    const actionUrl =
      channel === "WhatsApp"
        ? whatsappLink(recipient, message)
        : channel === "Email"
          ? mailtoLink(recipient, `Lekhanmart bill ${bill.bill_number}`, message)
          : smsLink(recipient, message);

    if (!recipient || !actionUrl) {
      return res.status(400).json({ message: `${channel} recipient is required` });
    }

    await dbQuery(
      `
        INSERT INTO bill_delivery_logs (bill_id, channel, recipient, message, status, created_by)
        VALUES (?, ?, ?, ?, 'Prepared', ?)
      `,
      [id, channel, recipient, message, req.admin?.email || "Admin"]
    );
    await dbQuery("UPDATE manual_bills SET status = 'Sent' WHERE id = ?", [id]);

    res.json({ message: `${channel} message prepared`, actionUrl, templateMessage: message });
  } catch (error) {
    moduleResponse(res, error, "Failed to send bill");
  }
}

function formatInvoiceDate(value) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleDateString("en-GB").replace(/\//g, "-");
  }

  return date.toLocaleDateString("en-GB").replace(/\//g, "-");
}

function formatInvoiceNumber(value) {
  const match = String(value || "").match(/\d+/g);
  return match ? match.join("").slice(-8).replace(/^0+/, "") || String(value) : String(value || "-");
}

function formatPdfMoney(value) {
  return Number(value || 0).toFixed(2);
}

function formatQty(value) {
  return Number(value || 0).toFixed(2);
}

function amountToWordsIndian(value) {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const underHundred = (number) => {
    if (number < 20) return ones[number];
    return `${tens[Math.floor(number / 10)]}${number % 10 ? ` ${ones[number % 10]}` : ""}`;
  };

  const underThousand = (number) => {
    const hundred = Math.floor(number / 100);
    const rest = number % 100;
    return `${hundred ? `${ones[hundred]} Hundred` : ""}${hundred && rest ? " " : ""}${rest ? underHundred(rest) : ""}`;
  };

  let number = Math.round(Number(value || 0));
  if (!number) return "Rupees Zero Only";

  const parts = [];
  const crore = Math.floor(number / 10000000);
  number %= 10000000;
  const lakh = Math.floor(number / 100000);
  number %= 100000;
  const thousand = Math.floor(number / 1000);
  number %= 1000;

  if (crore) parts.push(`${underThousand(crore)} Crore`);
  if (lakh) parts.push(`${underThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${underThousand(thousand)} Thousand`);
  if (number) parts.push(underThousand(number));

  return `Rupees ${parts.join(" ")} Only`;
}

function inferBillHsn(itemName = "") {
  const text = String(itemName).toLowerCase();

  if (text.includes("notebook") || text.includes("book") || text.includes("diary")) return "4820";
  if (text.includes("paper") || text.includes("sheet")) return "4802";
  if (text.includes("pencil")) return "9609";
  if (text.includes("eraser")) return "4016";
  if (text.includes("stapler") || text.includes("clip")) return "8305";

  return "9608";
}

function configureInvoiceFonts(doc) {
  const candidates = {
    regular: [
      "C:/Windows/Fonts/arial.ttf",
      "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ],
    bold: [
      "C:/Windows/Fonts/arialbd.ttf",
      "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ],
    italic: [
      "C:/Windows/Fonts/ariali.ttf",
      "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
    ],
    boldItalic: [
      "C:/Windows/Fonts/arialbi.ttf",
      "/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf",
    ],
  };
  const registered = {};

  Object.entries(candidates).forEach(([name, paths]) => {
    const file = paths.find((path) => fs.existsSync(path));
    if (file) {
      doc.registerFont(name, file);
      registered[name] = true;
    }
  });

  return {
    regular: registered.regular ? "regular" : "Helvetica",
    bold: registered.bold ? "bold" : "Helvetica-Bold",
    italic: registered.italic ? "italic" : "Helvetica-Oblique",
    boldItalic: registered.boldItalic ? "boldItalic" : "Helvetica-BoldOblique",
  };
}

function drawInvoiceCell(doc, x, y, width, height, text, options = {}) {
  const {
    font = "Helvetica",
    size = 8,
    align = "left",
    valign = "top",
    padding = 3,
    lineGap = 0,
  } = options;
  doc.font(font).fontSize(size);
  const textHeight = doc.heightOfString(String(text ?? ""), {
    width: Math.max(width - padding * 2, 1),
    lineGap,
  });
  const textY =
    valign === "middle"
      ? y + Math.max((height - textHeight) / 2, padding)
      : y + padding;

  doc
    .text(String(text ?? ""), x + padding, textY, {
      width: Math.max(width - padding * 2, 1),
      height: Math.max(height - padding * 2, 1),
      align,
      lineGap,
    });
}

function drawInvoiceLabelValue(doc, label, value, x, y, fonts, options = {}) {
  const labelWidth = options.labelWidth || 82;
  const colonX = x + labelWidth;
  const valueX = colonX + 12;

  doc.font(fonts.regular).fontSize(options.size || 10).text(label, x, y);
  doc.text(":", colonX, y);
  doc.text(value || "", valueX, y, {
    width: options.valueWidth || 150,
  });
}

function normalizeInvoiceItems(items = [], bill = {}) {
  const baseTotal = items.reduce((sum, item) => sum + Number(item.line_total || item.quantity * item.price || 0), 0);
  const explicitTax = Number(bill.tax_amount || 0);
  const discountTotal = Number(bill.discount_amount || 0);

  return items.map((item) => {
    const quantity = Number(item.quantity || 1);
    const lineAmount = Number(item.line_total || quantity * Number(item.price || 0));
    const gstInclusive = Boolean(Number(item.gst_inclusive ?? 1));
    const gstRate = gstInclusive ? 0 : Number(item.gst_rate || 0);
    const taxAmount = gstInclusive
      ? 0
      : Number(item.gst_amount || (lineAmount * gstRate) / 100);
    const cgstAmount = taxAmount / 2;
    const sgstAmount = taxAmount / 2;
    const discountRate = Number(item.discount_rate || 0);
    const hsn = cleanString(item.hsn_sac_code) || inferBillHsn(item.item_name);

    return {
      name: item.item_name || "Item",
      hsn,
      quantity,
      unit: cleanString(item.unit || "Pcs."),
      price: Number(item.price || 0),
      discountRate,
      gstInclusive,
      gstRate,
      cgstRate: gstRate / 2,
      sgstRate: gstRate / 2,
      cgstAmount,
      sgstAmount,
      taxAmount,
      taxableAmount: Math.max(lineAmount - (discountTotal > 0 && baseTotal > 0 ? (lineAmount / baseTotal) * discountTotal : 0), 0),
      lineAmount,
    };
  });
}

function drawGoldenCreationInvoice(doc, bill, items) {
  const fonts = configureInvoiceFonts(doc);
  const currency = "Rs.";
  const page = {
    x: 32,
    y: 32,
    width: 548,
    bottom: 760,
  };
  const right = page.x + page.width;
  const invoiceItems = normalizeInvoiceItems(items, bill);
  const grossTotal =
    Number(bill.total_amount || 0) ||
    invoiceItems.reduce((sum, item) => sum + item.lineAmount, 0);
  const hsnSummary = Object.values(
    invoiceItems.reduce((groups, item) => {
      groups[item.hsn] = groups[item.hsn] || {
        hsn: item.hsn,
        rates: new Set(),
        inclusive: true,
        taxable: 0,
        cgst: 0,
        sgst: 0,
        tax: 0,
      };
      groups[item.hsn].inclusive = groups[item.hsn].inclusive && item.gstInclusive;
      if (!item.gstInclusive && item.gstRate) {
        groups[item.hsn].rates.add(item.gstRate);
      }
      groups[item.hsn].taxable += item.taxableAmount;
      groups[item.hsn].cgst += item.cgstAmount;
      groups[item.hsn].sgst += item.sgstAmount;
      groups[item.hsn].tax += item.taxAmount;
      return groups;
    }, {})
  ).map((row) => ({
    ...row,
    rateLabel: row.inclusive
      ? "Inclusive"
      : [...row.rates].map((rate) => `${formatPdfMoney(rate)}%`).join(", "),
  }));

  doc.lineWidth(0.6);
  doc.rect(page.x, page.y, page.width, page.bottom - page.y).stroke();

  if (fs.existsSync(INVOICE_WATERMARK_PATH)) {
    doc.save();
    doc.opacity(0.05);
    doc.image(INVOICE_WATERMARK_PATH, page.x + 120, page.y + 230, {
      width: 310,
    });
    doc.opacity(1);
    doc.restore();
  }

  doc.font(fonts.bold).fontSize(11).text("GSTIN  :   06AAMPM8579J1ZW", page.x + 5, page.y + 8);
  doc.font(fonts.italic).fontSize(10).text("Original Copy", right - 66, page.y + 9, { width: 60, align: "right" });
  doc.font(fonts.bold).fontSize(10.5).text("PERFORMA INVOICE", page.x, page.y + 18, { width: page.width, align: "center" });
  doc.moveTo(250, page.y + 30).lineTo(362, page.y + 30).stroke();
  if (fs.existsSync(INVOICE_LOGO_PATH)) {
    doc.image(INVOICE_LOGO_PATH, page.x + 190, page.y + 31, { width: 170 });
  } else {
    doc.font(fonts.bold).fontSize(18).text("GOLDEN CREATION", page.x, page.y + 32, { width: page.width, align: "center" });
  }
  doc.font(fonts.regular).fontSize(8.2).text("G-38, GROUND FLOOR, BAANI ADDRESS ONE SHOPPING ARCADE", page.x + 18, page.y + 68, { width: page.width - 36, align: "center" });
  doc.text("1, GOLF COURSE ROAD, SECTOR 56, GURUGRAM - 122011", page.x + 18, page.y + 78, { width: page.width - 36, align: "center" });
  doc.font(fonts.boldItalic).fontSize(6.8).text("Tel.: 01244141054  Mobile: 95990 90630  Email: goldencreation@lekhanmart.in", page.x + 18, page.y + 88, { width: page.width - 36, align: "center" });

  const headerBottom = 126;
  doc.moveTo(page.x, headerBottom).lineTo(right, headerBottom).stroke();

  const partyBottom = 252;
  const splitX = page.x + 270;
  doc.moveTo(splitX, headerBottom).lineTo(splitX, partyBottom).stroke();
  doc.moveTo(page.x, partyBottom).lineTo(right, partyBottom).stroke();

  doc.font(fonts.boldItalic).fontSize(11).text("Party Details :", page.x + 5, headerBottom + 8);
  doc.font(fonts.regular).fontSize(10).text(bill.customer_name || "Billing Customer", page.x + 5, headerBottom + 22, { width: 250 });
  const partyFieldsY = headerBottom + 78;
  drawInvoiceLabelValue(doc, "Party E-Mail ID", bill.customer_email || "", page.x + 5, partyFieldsY, fonts, { labelWidth: 84, size: 10 });
  drawInvoiceLabelValue(doc, "Party Mobile No", bill.customer_phone || "", page.x + 5, partyFieldsY + 12, fonts, { labelWidth: 84, size: 10 });
  drawInvoiceLabelValue(doc, "GSTIN / UIN", "", page.x + 5, partyFieldsY + 24, fonts, { labelWidth: 84, size: 10 });
  drawInvoiceLabelValue(doc, "ORDER NO", bill.order_number || "", page.x + 5, partyFieldsY + 36, fonts, { labelWidth: 84, size: 10 });

  const metaX = splitX + 4;
  const metaY = headerBottom + 8;
  const metaRows = [
    ["Invoice No.", formatInvoiceNumber(bill.bill_number)],
    ["Dated", formatInvoiceDate(bill.created_at)],
    ["Place of Supply", "Haryana (06)"],
    ["Reverse Charge", "N"],
    ["GR/RR No.", ""],
    ["Transport", "GENERAL"],
    ["Vehicle No.", ""],
    ["Payment", bill.payment_method || ""],
    ["Amount Paid", bill.amount_paid !== undefined ? formatPdfMoney(bill.amount_paid) : ""],
    ["COD Due", bill.cod_due !== undefined ? formatPdfMoney(bill.cod_due) : ""],
  ];
  metaRows.forEach(([label, value], index) => {
    drawInvoiceLabelValue(doc, label, value, metaX, metaY + index * 12, fonts, { labelWidth: 82, size: 10, valueWidth: 140 });
  });

  drawInvoiceLabelValue(doc, "Challan No.", "", page.x + 5, partyBottom + 10, fonts, { labelWidth: 84, size: 10 });
  const challanBottom = 275;
  doc.moveTo(page.x, challanBottom).lineTo(right, challanBottom).stroke();

  const tableTop = challanBottom;
  const tableBottom = 526;
  const headerHeight = 35;
  const grandBottom = 548;
  const columns = [
    ["S.N.", 22, "center"],
    ["Description of Goods", 166, "left"],
    ["HSN/SAC\nCode", 36, "center"],
    ["Qty.", 32, "right"],
    ["Unit", 24, "center"],
    ["List Price", 44, "right"],
    ["Discount", 34, "center"],
    ["CGST\nRate", 30, "center"],
    ["CGST\nAmt.", 33, "right"],
    ["SGST\nRate", 30, "center"],
    ["SGST\nAmt.", 33, "right"],
    [`Amount\n(${currency})`, 64, "right"],
  ];
  let cursorX = page.x;
  columns.forEach(([label, width, align]) => {
    doc.rect(cursorX, tableTop, width, tableBottom - tableTop).stroke();
    drawInvoiceCell(doc, cursorX, tableTop, width, headerHeight, label, {
      font: fonts.bold,
      size: String(label).includes("Amount") || String(label).includes("Discount") ? 6.8 : 7.3,
      align,
      valign: "middle",
    });
    cursorX += width;
  });
  doc.moveTo(page.x, tableTop + headerHeight).lineTo(right, tableTop + headerHeight).stroke();

  let rowY = tableTop + headerHeight + 8;
  const rowHeight = 14;
  invoiceItems.slice(0, 14).forEach((item, index) => {
    const cells = [
      `${index + 1}.`,
      item.name,
      item.hsn,
      formatQty(item.quantity),
      item.unit,
      formatPdfMoney(item.price),
      `${formatPdfMoney(item.discountRate)}%`,
      item.gstInclusive ? "Incl." : `${formatPdfMoney(item.cgstRate)} %`,
      formatPdfMoney(item.cgstAmount),
      item.gstInclusive ? "Incl." : `${formatPdfMoney(item.sgstRate)} %`,
      formatPdfMoney(item.sgstAmount),
      formatPdfMoney(item.lineAmount),
    ];
    cursorX = page.x;
    columns.forEach(([, width, align], cellIndex) => {
      drawInvoiceCell(doc, cursorX, rowY, width, rowHeight, cells[cellIndex], {
        font: fonts.regular,
        size: cellIndex === 1 ? 8.2 : cellIndex === 2 && String(cells[cellIndex]).length > 6 ? 7 : 8,
        align,
        padding: 2,
      });
      cursorX += width;
    });
    rowY += rowHeight;
  });

  doc.moveTo(page.x, tableBottom).lineTo(right, tableBottom).stroke();
  doc.rect(right - 86, tableBottom, 86, grandBottom - tableBottom).stroke();
  doc.font(fonts.bold).fontSize(9).text(`Grand Total ${currency}`, right - 200, tableBottom + 9, { width: 112, align: "right" });
  doc.text(formatPdfMoney(grossTotal), right - 82, tableBottom + 9, { width: 76, align: "right" });
  doc.moveTo(page.x, grandBottom).lineTo(right, grandBottom).stroke();

  const summaryTop = 560;
  const summaryHeaders = ["HSN/SAC", "Tax Rate", "Taxable Amt.", "CGST Amt.", "SGST Amt.", "Total Tax"];
  const summaryWidths = [43, 45, 58, 50, 50, 62];
  cursorX = page.x + 5;
  summaryHeaders.forEach((label, index) => {
    doc.font(fonts.bold).fontSize(8).text(label, cursorX, summaryTop, { width: summaryWidths[index] });
    doc.moveTo(cursorX, summaryTop + 10).lineTo(cursorX + summaryWidths[index] - 4, summaryTop + 10).stroke();
    cursorX += summaryWidths[index];
  });
  let summaryY = summaryTop + 13;
  hsnSummary.forEach((row) => {
    const values = [row.hsn, row.rateLabel || "", formatPdfMoney(row.taxable), formatPdfMoney(row.cgst), formatPdfMoney(row.sgst), formatPdfMoney(row.tax)];
    cursorX = page.x + 5;
    values.forEach((value, index) => {
      doc.font(fonts.regular).fontSize(8).text(value, cursorX, summaryY, {
        width: summaryWidths[index] - 4,
        align: index > 1 ? "right" : "left",
      });
      cursorX += summaryWidths[index];
    });
    summaryY += 11;
  });
  const totals = hsnSummary.reduce(
    (acc, row) => ({
      taxable: acc.taxable + row.taxable,
      cgst: acc.cgst + row.cgst,
      sgst: acc.sgst + row.sgst,
      tax: acc.tax + row.tax,
    }),
    { taxable: 0, cgst: 0, sgst: 0, tax: 0 }
  );
  doc.moveTo(page.x + 5, summaryY - 2).lineTo(page.x + 313, summaryY - 2).stroke();
  cursorX = page.x + 5;
  ["Total", "", formatPdfMoney(totals.taxable), formatPdfMoney(totals.cgst), formatPdfMoney(totals.sgst), formatPdfMoney(totals.tax)].forEach((value, index) => {
    doc.font(fonts.bold).fontSize(8).text(value, cursorX, summaryY, {
      width: summaryWidths[index] - 4,
      align: index > 1 ? "right" : "left",
    });
    cursorX += summaryWidths[index];
  });
  doc.moveTo(page.x + 5, summaryY + 11).lineTo(page.x + 313, summaryY + 11).stroke();

  const wordsTop = 610;
  doc.font(fonts.bold).fontSize(11).text(amountToWordsIndian(grossTotal), page.x + 5, wordsTop + 6);
  doc.moveTo(page.x, 630).lineTo(right, 630).stroke();
  doc.font(fonts.bold).fontSize(10).text("Bank Details  :", page.x + 5, 639);
  doc.font(fonts.regular).fontSize(10).text("ACCOUNT NO:99909599090630 IFSC CODE:HDFC0000572", page.x + 84, 639);
  doc.text("HDFC BANK. VATIKA ATRIUM, A-BLOCK,GOLF COURSE ROAD, SECTOR 53, GURUGRAM 122002.", page.x + 84, 652);
  doc.moveTo(page.x, 666).lineTo(right, 666).stroke();

  const bottomSplit = page.x + 243;
  doc.moveTo(bottomSplit, 666).lineTo(bottomSplit, page.bottom).stroke();
  doc.moveTo(bottomSplit, 700).lineTo(right, 700).stroke();
  doc.font(fonts.bold).fontSize(8).text("Terms & Conditions", page.x + 5, 673);
  doc.moveTo(page.x + 5, 684).lineTo(page.x + 58, 684).stroke();
  doc.font(fonts.regular).fontSize(7.8).text("E.& O.E.", page.x + 5, 688);
  [
    "1. GOODS ONCE SOLD WILL NOT TAKEN BACK",
    "2. Interest @ 18% p.a. will be charged if the payment",
    "   is not made with in the stipulated time.",
    "3. Subject to 'Haryana' Jurisdiction only.",
    "4. CHEQUE BOUNCE CHARGES 500/-",
  ].forEach((line, index) => {
    doc.text(line, page.x + 5, 702 + index * 12);
  });

  doc.font(fonts.bold).fontSize(8).text("Receiver's Signature   :", bottomSplit + 3, 674);
  doc.font(fonts.bold).fontSize(11).text("For GOLDEN CREATION", bottomSplit + 5, 710, { width: right - bottomSplit - 15, align: "right" });
  doc.font(fonts.bold).fontSize(11).text("Authorised Signatory", bottomSplit + 5, 746, { width: right - bottomSplit - 15, align: "right" });
}

export async function downloadAdminBillPdf(req, res) {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ message: "Invalid bill ID" });
  }

  try {
    const rows = await dbQuery("SELECT * FROM manual_bills WHERE id = ? LIMIT 1", [id]);
    const bill = rows[0];

    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }

    if (bill.order_id) {
      const orderRows = await dbQuery(
        "SELECT payment_method,payment_status,amount_paid,cod_due FROM orders WHERE id=? LIMIT 1",
        [bill.order_id]
      );
      Object.assign(bill, orderRows[0] || {});
    }

    const items = await dbQuery("SELECT * FROM manual_bill_items WHERE bill_id = ? ORDER BY id", [id]);
    const doc = new PDFDocument({
      autoFirstPage: false,
      bufferPages: false,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=\"${bill.bill_number}.pdf\"`);
    doc.pipe(res);

    doc.addPage({ size: [612, 792], margin: 0 });
    drawGoldenCreationInvoice(doc, bill, items);
    doc.end();
  } catch (error) {
    moduleResponse(res, error, "Failed to download bill PDF");
  }
}

async function supplierProductDetails(supplierIds) {
  if (!supplierIds.length) return {};

  const rows = await dbQuery(
    `
      SELECT
        sp.*,
        COALESCE(p.name, wp.name, stp.name) AS product_name,
        COALESCE(p.sku, wp.sku, stp.sku) AS sku,
        CASE WHEN sp.store_product_id IS NOT NULL THEN 'Store' WHEN sp.warehouse_product_id IS NOT NULL THEN 'Warehouse' ELSE 'Website' END AS product_source,
        COALESCE(ss.stock_on_hand, ws.stock_on_hand, p.stock_quantity, 0) AS stock_on_hand,
        COALESCE(ss.reorder_level, ws.reorder_level, p.reorder_level, wp.reorder_level, stp.reorder_level, 0) AS reorder_level
      FROM supplier_products sp
      LEFT JOIN products p ON sp.product_id = p.id
      LEFT JOIN warehouse_products wp ON sp.warehouse_product_id = wp.id
      LEFT JOIN store_products stp ON sp.store_product_id = stp.id
      LEFT JOIN store_stock ss ON ss.store_product_id = sp.store_product_id
      LEFT JOIN warehouse_stock ws
        ON (ws.product_id = sp.product_id OR ws.warehouse_product_id = sp.warehouse_product_id)
      WHERE sp.supplier_id IN (?)
      ORDER BY product_name
    `,
    [supplierIds]
  );

  return rows.reduce((groups, row) => {
    groups[row.supplier_id] = groups[row.supplier_id] || [];
    groups[row.supplier_id].push(row);
    return groups;
  }, {});
}

export async function getAdminSuppliersData(_req, res) {
  try {
    const suppliers = await dbQuery(`
      SELECT *
      FROM suppliers
      ORDER BY updated_at DESC, id DESC
    `);
    const productGroups = await supplierProductDetails(suppliers.map((supplier) => supplier.id));
    const brandRows = await dbQuery("SELECT sb.supplier_id, b.id, b.name FROM supplier_brands sb JOIN brands b ON b.id=sb.brand_id ORDER BY b.name");
    const brandGroups = brandRows.reduce((groups, row) => { groups[row.supplier_id] = groups[row.supplier_id] || []; groups[row.supplier_id].push(row); return groups; }, {});
    const websiteProducts = await dbQuery("SELECT id, sku, name, price, 'Website' AS source FROM products ORDER BY name LIMIT 300");
    const warehouseProducts = await dbQuery("SELECT id, sku, name, mrp AS price, 'Warehouse' AS source FROM warehouse_products ORDER BY name LIMIT 300");
    const storeProducts = await dbQuery("SELECT id, sku, name, mrp AS price, 'Store' AS source FROM store_products WHERE deleted_at IS NULL ORDER BY name LIMIT 300");
    const brands = await dbQuery("SELECT id, name FROM brands WHERE deleted_at IS NULL AND status='Active' ORDER BY name");

    const formattedSuppliers = suppliers.map((supplier) => {
      const products = productGroups[supplier.id] || [];
      return {
        ...supplier,
        products,
        brands: brandGroups[supplier.id] || [],
        lowStockProducts: products.filter((product) => Number(product.stock_on_hand || 0) <= Number(product.reorder_level || 0)),
      };
    });

    res.json({
      suppliers: formattedSuppliers,
      websiteProducts,
      warehouseProducts,
      storeProducts,
      brands,
      summary: {
        total: suppliers.length,
        active: suppliers.filter((supplier) => supplier.status === "Active").length,
        pending: suppliers.filter((supplier) => supplier.status === "Pending").length,
        blocked: suppliers.filter((supplier) => supplier.status === "Blocked").length,
      },
    });
  } catch (error) {
    moduleResponse(res, error, "Failed to load suppliers");
  }
}

async function replaceSupplierProducts(supplierId, productRefs = []) {
  await dbQuery("DELETE FROM supplier_products WHERE supplier_id = ?", [supplierId]);

  for (const ref of productRefs) {
    const productRef = typeof ref === "string" ? { productRef: ref } : ref;
    const { productId, warehouseProductId, storeProductId } = warehouseProductRef(productRef);

    if (!productId && !warehouseProductId && !storeProductId) continue;

    await dbQuery(
      `
        INSERT IGNORE INTO supplier_products
          (supplier_id, product_source, product_id, warehouse_product_id, store_product_id)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        supplierId,
        storeProductId ? "Store" : warehouseProductId ? "Warehouse" : "Website",
        productId,
        warehouseProductId,
        storeProductId,
      ]
    );
  }
}

async function replaceSupplierBrands(supplierId, brandIds = []) {
  await dbQuery("DELETE FROM supplier_brands WHERE supplier_id=?", [supplierId]);
  for (const brandId of [...new Set(brandIds.map(Number).filter(Boolean))]) {
    await dbQuery("INSERT IGNORE INTO supplier_brands (supplier_id, brand_id) VALUES (?, ?)", [supplierId, brandId]);
  }
}

export async function createAdminSupplier(req, res) {
  const name = cleanString(req.body?.name);
  const company = cleanString(req.body?.company);
  const email = cleanString(req.body?.email);
  const phone = cleanString(req.body?.phone);
  const whatsapp = cleanString(req.body?.whatsapp || phone);
  const address = cleanString(req.body?.address);
  const status = cleanString(req.body?.status || "Active");
  const notes = cleanString(req.body?.notes);

  if (!name) {
    return res.status(400).json({ message: "Supplier name is required" });
  }

  try {
    const result = await dbQuery(
      `
        INSERT INTO suppliers (name, company, email, phone, whatsapp, address, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [name, company || null, email || null, phone || null, whatsapp || null, address || null, status, notes || null]
    );
    await replaceSupplierProducts(result.insertId, req.body?.productRefs || req.body?.products || []);
    await replaceSupplierBrands(result.insertId, req.body?.brandIds || []);
    await logActivity(req, "Created supplier", "Suppliers", name);
    res.status(201).json({ message: "Supplier created", supplier: { id: result.insertId, name } });
  } catch (error) {
    moduleResponse(res, error, "Failed to create supplier");
  }
}

export async function updateAdminSupplier(req, res) {
  const id = Number(req.params.id);
  const name = cleanString(req.body?.name);
  const company = cleanString(req.body?.company);
  const email = cleanString(req.body?.email);
  const phone = cleanString(req.body?.phone);
  const whatsapp = cleanString(req.body?.whatsapp || phone);
  const address = cleanString(req.body?.address);
  const status = cleanString(req.body?.status || "Active");
  const notes = cleanString(req.body?.notes);

  if (!id || !name) {
    return res.status(400).json({ message: "Valid supplier details are required" });
  }

  try {
    await dbQuery(
      `
        UPDATE suppliers
        SET name = ?, company = ?, email = ?, phone = ?, whatsapp = ?, address = ?, status = ?, notes = ?
        WHERE id = ?
      `,
      [name, company || null, email || null, phone || null, whatsapp || null, address || null, status, notes || null, id]
    );
    await replaceSupplierProducts(id, req.body?.productRefs || req.body?.products || []);
    await replaceSupplierBrands(id, req.body?.brandIds || []);
    await logActivity(req, "Updated supplier", "Suppliers", name);
    res.json({ message: "Supplier updated" });
  } catch (error) {
    moduleResponse(res, error, "Failed to update supplier");
  }
}

export async function deleteAdminSupplier(req, res) {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ message: "Invalid supplier ID" });
  }

  try {
    await dbQuery("DELETE FROM suppliers WHERE id = ?", [id]);
    await logActivity(req, "Deleted supplier", "Suppliers", `Supplier ${id}`);
    res.json({ message: "Supplier deleted" });
  } catch (error) {
    moduleResponse(res, error, "Failed to delete supplier");
  }
}

export async function getAdminPayments(_req, res) {
  try {
    const { start, end } = currentMonthRange();
    const paymentSettingsRows = await dbQuery("SELECT * FROM payment_settings WHERE id = 1 LIMIT 1");
    const paymentSettings = paymentSettingsRows[0] || {};
    const razorpayConfigured = Boolean(
      cleanString(process.env.RAZORPAY_KEY_ID) &&
        cleanString(process.env.RAZORPAY_KEY_SECRET) &&
        cleanString(process.env.RAZORPAY_WEBHOOK_SECRET)
    );
    const now = new Date();
    const integrations = [
      {
        id: "razorpay",
        provider: "Razorpay",
        mode: process.env.NODE_ENV === "production" ? "Live" : "Test",
        status: razorpayConfigured ? "Connected" : "Not Connected",
        config_summary: razorpayConfigured
          ? Number(paymentSettings.full_online_enabled)
            ? "Live online payment gateway enabled"
            : "Credentials configured, Full Online disabled"
          : "Awaiting key_id, key_secret and webhook secret",
        last_checked_at: now,
      },
      {
        id: "partial-cod",
        provider: "Partial COD",
        mode: razorpayConfigured ? "Live" : "Disabled",
        status: razorpayConfigured && Number(paymentSettings.partial_cod_enabled) ? "Connected" : "Not Connected",
        config_summary: razorpayConfigured
          ? Number(paymentSettings.partial_cod_enabled)
            ? `${Number(paymentSettings.default_partial_percent || 20)}% prepaid amount enabled`
            : "Partial COD is disabled in checkout settings"
          : "Razorpay credentials required for prepaid COD",
        last_checked_at: now,
      },
      {
        id: "full-cod",
        provider: "Cash on Delivery",
        mode: "Offline",
        status: Number(paymentSettings.full_cod_enabled) ? "Connected" : "Disabled",
        config_summary: Number(paymentSettings.full_cod_enabled)
          ? "Full COD is available at checkout"
          : "Full COD is disabled in checkout settings",
        last_checked_at: now,
      },
    ];
    const paymentStats = await dbQuery(`
      SELECT
        COALESCE(payment_method, 'Unknown') AS method,
        COUNT(*) AS orders,
        COALESCE(SUM(total_amount), 0) AS revenue
      FROM orders
      GROUP BY COALESCE(payment_method, 'Unknown')
      ORDER BY revenue DESC
    `);
    const taxRows = await dbQuery(`
      SELECT
        id,
        order_number,
        customer_name,
        customer_email,
        payment_method,
        tax_amount,
        total_amount,
        order_status,
        created_at
      FROM orders
      WHERE COALESCE(tax_amount, 0) > 0
      ORDER BY created_at DESC
      LIMIT 200
    `);
    const currentMonthTaxRows = await dbQuery(
      `
        SELECT COALESCE(SUM(tax_amount), 0) AS total_tax
        FROM orders
        WHERE DATE(created_at) BETWEEN ? AND ?
      `,
      [start, end]
    );
    const currentMonthTax = toMoney(currentMonthTaxRows[0]?.total_tax || 0);

    await dbQuery(
      `
        INSERT INTO gst_returns (period_start, period_end, total_tax, status)
        VALUES (?, ?, ?, 'Pending')
        ON DUPLICATE KEY UPDATE
          total_tax = VALUES(total_tax)
      `,
      [start, end, currentMonthTax]
    );

    const gstRows = await dbQuery(
      `
        SELECT *
        FROM gst_returns
        WHERE period_start = ? AND period_end = ?
        LIMIT 1
      `,
      [start, end]
    );
    const gstReturn = gstRows[0]
      ? {
          ...gstRows[0],
          period_start: start,
          period_end: end,
        }
      : {
          period_start: start,
          period_end: end,
          total_tax: currentMonthTax,
          status: "Pending",
        };

    res.json({
      summary: {
        connected: integrations.filter((item) => item.status === "Connected").length,
        pending: integrations.filter((item) => item.status !== "Connected").length,
        paymentMethods: paymentStats.length,
        totalTaxCollected: taxRows.reduce((sum, item) => sum + Number(item.tax_amount || 0), 0),
        reconciledRevenue: paymentStats.reduce(
          (sum, item) => sum + Number(item.revenue || 0),
          0
        ),
      },
      integrations,
      paymentStats,
      taxCollection: taxRows,
      gstReturn,
    });
  } catch (error) {
    moduleResponse(res, error, "Failed to load payments");
  }
}

export async function updateGstReturnStatus(req, res) {
  const id = Number(req.params.id);
  const status = cleanString(req.body?.status || "Paid");

  if (!id || !["Pending", "Paid"].includes(status)) {
    return res.status(400).json({ message: "Valid GST return status is required" });
  }

  try {
    await dbQuery(
      `
        UPDATE gst_returns
        SET status = ?, paid_at = ?, updated_by = ?
        WHERE id = ?
      `,
      [status, status === "Paid" ? new Date() : null, req.admin?.email || "Admin", id]
    );
    await logActivity(req, "Updated GST return status", "Payments", `GST return ${id}: ${status}`);
    res.json({ message: "GST return status updated" });
  } catch (error) {
    moduleResponse(res, error, "Failed to update GST return status");
  }
}

export async function getAdminReportsData(req, res) {
  const range = reportDateRange(req.query);

  try {
    const orders = await dbQuery(
      `
        SELECT *
        FROM orders
        WHERE DATE(created_at) BETWEEN ? AND ?
        ORDER BY created_at DESC
      `,
      [range.start, range.end]
    );
    const dailySales = await dbQuery(
      `
        SELECT
          DATE(created_at) AS date,
          COUNT(*) AS orders,
          COALESCE(SUM(total_amount), 0) AS revenue,
          COALESCE(SUM(tax_amount), 0) AS tax,
          GROUP_CONCAT(DISTINCT COALESCE(payment_method, 'Unknown') ORDER BY payment_method SEPARATOR ', ') AS paymentSplit
        FROM orders
        WHERE DATE(created_at) BETWEEN ? AND ?
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at)
      `,
      [range.start, range.end]
    );
    const paymentBreakdown = await dbQuery(
      `
        SELECT COALESCE(payment_method, 'Unknown') AS label, COUNT(*) AS value, COALESCE(SUM(total_amount), 0) AS amount
        FROM orders
        WHERE DATE(created_at) BETWEEN ? AND ?
        GROUP BY COALESCE(payment_method, 'Unknown')
        ORDER BY amount DESC
      `,
      [range.start, range.end]
    );
    const statusBreakdown = await dbQuery(
      `
        SELECT COALESCE(order_status, 'Unknown') AS label, COUNT(*) AS value
        FROM orders
        WHERE DATE(created_at) BETWEEN ? AND ?
        GROUP BY COALESCE(order_status, 'Unknown')
        ORDER BY value DESC
      `,
      [range.start, range.end]
    );
    const fastMoving = await dbQuery(
      `
        SELECT
          COALESCE(p.name, oi.product_name) AS name,
          COALESCE(c.name, 'Uncategorized') AS category,
          COALESCE(SUM(oi.quantity), 0) AS qtySold,
          COALESCE(SUM(oi.line_total), 0) AS revenue
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN products p ON oi.product_id = p.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE DATE(o.created_at) BETWEEN ? AND ?
        GROUP BY COALESCE(p.name, oi.product_name), COALESCE(c.name, 'Uncategorized')
        ORDER BY qtySold DESC, revenue DESC
        LIMIT 10
      `,
      [range.start, range.end]
    );
    const categorySales = await dbQuery(
      `
        SELECT
          COALESCE(c.name, 'Uncategorized') AS label,
          COALESCE(SUM(oi.line_total), 0) AS value
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN products p ON oi.product_id = p.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE DATE(o.created_at) BETWEEN ? AND ?
        GROUP BY COALESCE(c.name, 'Uncategorized')
        ORDER BY value DESC
      `,
      [range.start, range.end]
    );
    const stockRows = await dbQuery(`
      SELECT
        COALESCE(p.name, wp.name) AS name,
        COALESCE(c.name, wp.category, 'Warehouse') AS category,
        COALESCE(ws.stock_on_hand, 0) AS stock,
        COALESCE(ws.reorder_level, p.reorder_level, 0) AS threshold,
        COALESCE(p.price, wp.mrp, wp.purchase_price, 0) AS price,
        ws.updated_at
      FROM warehouse_stock ws
      LEFT JOIN products p ON ws.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN warehouse_products wp ON ws.warehouse_product_id = wp.id
      WHERE p.id IS NOT NULL OR wp.id IS NOT NULL
      ORDER BY ws.updated_at DESC
      LIMIT 300
    `);

    const totalRevenue = orders.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const totalTax = orders.reduce((sum, item) => sum + Number(item.tax_amount || 0), 0);
    const customers = new Set(orders.map((order) => order.customer_email || order.customer_phone || order.customer_name).filter(Boolean));
    const customerOrderCounts = orders.reduce((counts, order) => {
      const key = order.customer_email || order.customer_phone || order.customer_name || `order-${order.id}`;
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
    const repeatOrders = Object.values(customerOrderCounts).filter((count) => count > 1).length;
    const lowStockAlerts = stockRows
      .filter((item) => Number(item.stock || 0) <= Number(item.threshold || 0))
      .map((item) => ({
        name: item.name,
        stock: Number(item.stock || 0),
        threshold: Number(item.threshold || 0),
        gap: Math.max(0, Number(item.threshold || 0) - Number(item.stock || 0)),
        action: Number(item.stock || 0) === 0 ? "Critical" : "Low",
      }));

    const soldNames = new Set(fastMoving.map((item) => item.name));
    const slowMoving = stockRows
      .filter((item) => !soldNames.has(item.name))
      .slice(0, 10)
      .map((item) => ({
        name: item.name,
        stock: Number(item.stock || 0),
        lastSale: "No sale in range",
        aging: item.updated_at ? new Date(item.updated_at).toLocaleDateString("en-IN") : "-",
      }));

    res.json({
      filters: range,
      salesSummary: {
        totalRevenue,
        totalOrders: orders.length,
        avgTicket: orders.length ? Math.round(totalRevenue / orders.length) : 0,
        totalCustomers: customers.size,
        stockValuation: stockRows.reduce((sum, item) => sum + Number(item.stock || 0) * Number(item.price || 0), 0),
        customerRepeatRate: customers.size ? Math.round((repeatOrders / customers.size) * 100) : 0,
        repeatOrders,
      },
      taxSummary: {
        totalTaxCollected: totalTax,
        taxableOrders: orders.filter((order) => Number(order.tax_amount || 0) > 0).length,
      },
      dailySales: dailySales.map((row) => ({
        ...row,
        date: row.date ? new Date(row.date).toLocaleDateString("en-IN") : "-",
      })),
      paymentBreakdown,
      statusBreakdown,
      categorySales,
      fastMoving: fastMoving.map((item) => ({
        ...item,
        velocity: Number(item.qtySold || 0) >= 10 ? "High" : Number(item.qtySold || 0) >= 3 ? "Medium" : "Normal",
      })),
      slowMoving,
      lowStockAlerts,
    });
  } catch (error) {
    moduleResponse(res, error, "Failed to load reports");
  }
}

export async function updateAdminOrderStatus(req, res) {
  const id = Number(req.params.id);
  const status = String(req.body?.status || "").trim();
  const allowedStatuses = ["Pending", "Processing", "Dispatched", "In Transit", "Delivered", "Cancelled"];

  if (!id || !allowedStatuses.includes(status)) {
    return res.status(400).json({ message: "Valid order status is required" });
  }

  try {
    const orderRows = await dbQuery(
      "SELECT id, order_status, fulfillment_stock_source, physical_stock_deducted_at FROM orders WHERE id = ? LIMIT 1",
      [id]
    );
    const order = orderRows[0];
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const sourceValue = cleanString(req.body?.fulfillmentStockSource || req.body?.fulfillment_stock_source).toLowerCase();
    const fulfillmentSource = sourceValue === "warehouse" ? "warehouse" : ["shop", "store"].includes(sourceValue) ? "shop" : "";
    if (status === "Dispatched" && !order.physical_stock_deducted_at) {
      if (!fulfillmentSource) {
        await dbQuery(
          `INSERT INTO admin_notifications (type, title, message, link)
           VALUES ('dispatch_stock_source', 'Dispatch stock source required', ?, ?)`,
          [`Order ${id} needs Warehouse or Shop stock source before dispatch`, `/orders/${id}`]
        );
        return res.status(400).json({ message: "Select Warehouse or Shop stock source before dispatching this order" });
      }

      const itemRows = await dbQuery(
        "SELECT product_id, quantity, item_type, bundle_items FROM order_items WHERE order_id = ?",
        [id]
      );
      const quantities = new Map();
      for (const item of itemRows) {
        const itemQuantity = Math.max(1, Number(item.quantity || 1));
        if (Number(item.product_id)) {
          quantities.set(Number(item.product_id), (quantities.get(Number(item.product_id)) || 0) + itemQuantity);
        }
        const bundleItems = parseJson(item.bundle_items, []);
        if (Array.isArray(bundleItems)) {
          for (const bundleItem of bundleItems) {
            const productId = Number(bundleItem.product_id || bundleItem.productId || bundleItem.id);
            if (!productId) continue;
            const bundleQuantity = Math.max(1, Number(bundleItem.quantity || bundleItem.qty || 1));
            quantities.set(productId, (quantities.get(productId) || 0) + itemQuantity * bundleQuantity);
          }
        }
      }

      for (const [productId] of quantities.entries()) {
        await ensureProductPhysicalStockRows(productId);
      }

      const shortages = [];
      for (const [productId, quantity] of quantities.entries()) {
        const stockRows = await dbQuery(
          `SELECT p.name, p.sku, COALESCE(psc.stock_on_hand, 0) AS stock_on_hand
           FROM products p
           LEFT JOIN product_stock_counts psc
             ON psc.product_id = p.id AND psc.bucket = ?
           WHERE p.id = ?
           LIMIT 1`,
          [fulfillmentSource, productId]
        );
        const stock = stockRows[0];
        if (!stock || Number(stock.stock_on_hand || 0) < quantity) {
          shortages.push(`${stock?.name || `Product ${productId}`}: available ${Number(stock?.stock_on_hand || 0)}, required ${quantity}`);
        }
      }
      if (shortages.length) {
        return res.status(400).json({ message: `Insufficient ${fulfillmentSource} stock. ${shortages.join("; ")}` });
      }

      for (const [productId, quantity] of quantities.entries()) {
        const stockRows = await dbQuery(
          "SELECT stock_on_hand, reorder_level FROM product_stock_counts WHERE product_id = ? AND bucket = ? LIMIT 1",
          [productId, fulfillmentSource]
        );
        const current = stockRows[0] || { stock_on_hand: 0, reorder_level: 0 };
        const nextStock = Number(current.stock_on_hand || 0) - quantity;
        await dbQuery(
          "UPDATE product_stock_counts SET stock_on_hand = ? WHERE product_id = ? AND bucket = ?",
          [nextStock, productId, fulfillmentSource]
        );
        await dbQuery(
          `INSERT INTO product_stock_audit_logs
            (product_id, bucket, previous_stock, new_stock, previous_reorder_level, new_reorder_level,
             adjustment_type, quantity_delta, reason, changed_by, actor)
           VALUES (?, ?, ?, ?, ?, ?, 'dispatch', ?, ?, ?, ?)`,
          [
            productId,
            fulfillmentSource,
            Number(current.stock_on_hand || 0),
            nextStock,
            Number(current.reorder_level || 0),
            Number(current.reorder_level || 0),
            -quantity,
            `Order ${id} dispatch`,
            req.admin?.id || null,
            req.admin?.name || req.admin?.email || "Admin",
          ]
        );
      }
    }

    await dbQuery(
      `UPDATE orders
       SET order_status = ?,
           delivered_at = CASE WHEN ? = 'Delivered' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
           fulfillment_stock_source = CASE
             WHEN ? = 'Dispatched' AND ? <> '' THEN ?
             ELSE fulfillment_stock_source
           END,
           physical_stock_deducted_at = CASE
             WHEN ? = 'Dispatched' AND physical_stock_deducted_at IS NULL THEN NOW()
             ELSE physical_stock_deducted_at
           END
       WHERE id = ?`,
      [status, status, status, fulfillmentSource, fulfillmentSource, status, id]
    );
    await dbQuery(
      "INSERT INTO order_status_history (order_id, status, fulfillment_stock_source, changed_by) VALUES (?, ?, ?, ?)",
      [id, status, status === "Dispatched" ? fulfillmentSource || order.fulfillment_stock_source || null : null, req.admin?.email || "Admin"]
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
    await logActivity(req, "Updated order status", "Orders", `Order ${id}: ${status}`);
    res.json({ message: "Order status updated" });
  } catch (error) {
    moduleResponse(res, error, "Failed to update order status");
  }
}

export async function getAdminOrderDetail(req, res) {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ message: "Invalid order ID" });
  }

  try {
    const rows = await dbQuery(
      `
        SELECT
          id,
          order_number,
          user_id,
          customer_name,
          customer_email,
          customer_phone,
          street_address,
          city,
          state,
          zip_code,
          payment_method,
          payment_status,
          amount_paid,
          cod_due,
          cod_collected_at,
          subtotal,
          shipping_fee,
          tax_amount,
          total_amount,
          order_status,
          tracking_url,
          logistics_provider,
          fulfillment_stock_source,
          physical_stock_deducted_at,
          delivered_at,
          created_at,
          updated_at
        FROM orders
        WHERE id = ?
      `,
      [id]
    );
    const order = rows[0];

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const items = await dbQuery(
      `
        SELECT
          oi.id,
          oi.product_id,
          oi.item_type,
          oi.bundle_name,
          oi.bundle_items,
          oi.product_name,
          oi.quantity,
          oi.price,
          oi.line_total,
          oi.gst_inclusive,
          oi.gst_rate,
          oi.gst_amount,
          p.sku,
          p.image
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = ?
        ORDER BY oi.id
      `,
      [id]
    );

    res.json({ order, items });
  } catch (error) {
    moduleResponse(res, error, "Failed to load order detail");
  }
}
