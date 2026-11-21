import crypto from "crypto";
import ExcelJS from "exceljs";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";
import db from "../config/db.js";
import {
  deleteFromSpaces,
  getPrivateObjectFromSpaces,
  uploadPrivateBufferToSpaces,
} from "../services/media-storage.service.js";
import { getCollectionProducts } from "../services/merchandising.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, "..", "assets", "golden-creation-official-logo.png");
const LEAD_STATUSES = ["Newly Added", "In Progress", "Closed Won", "Cancelled/Abandoned"];
const FINAL_LEAD_STATUSES = new Set(["Closed Won", "Cancelled/Abandoned"]);
const CATALOG_LAYOUTS = new Set(["2x2", "2x4"]);
const MAX_CATALOG_PRODUCTS = 200;

function query(sql, values = []) {
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

function integer(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function nullableInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseIds(value) {
  const source = Array.isArray(value) ? value : clean(value).split(",");
  return [...new Set(source.map((item) => integer(item)).filter(Boolean))];
}

function isSuperAdmin(admin) {
  return clean(admin?.role).toLowerCase() === "super admin";
}

function isSalesman(admin) {
  return clean(admin?.role).toLowerCase() === "salesman";
}

function hasPermission(admin, permission) {
  return Array.isArray(admin?.permissions) && admin.permissions.includes(permission);
}

function canUseSalesWorkspace(admin) {
  return isSuperAdmin(admin) || isSalesman(admin) || hasPermission(admin, "leads") || hasPermission(admin, "sales_catalogs");
}

function requireSalesAccess(req, res) {
  if (!canUseSalesWorkspace(req.admin)) {
    res.status(403).json({ message: "Sales workspace access required" });
    return false;
  }
  return true;
}

function pagination(queryParams = {}) {
  const page = Math.max(1, integer(queryParams.page, 1));
  const limit = Math.min(100, Math.max(1, integer(queryParams.limit, 20)));
  return { page, limit, offset: (page - 1) * limit };
}

async function logActivity(req, action, detail = "") {
  try {
    await query(
      "INSERT INTO admin_activity (admin_id, actor, action, module, detail) VALUES (?, ?, ?, 'Sales', ?)",
      [req.admin?.id || null, req.admin?.email || "System", action, detail || null]
    );
  } catch (error) {
    console.log("Sales activity log skipped:", error.message);
  }
}

function leadOwnerClause(req, alias = "l") {
  return isSuperAdmin(req.admin)
    ? { sql: "1=1", values: [] }
    : { sql: `(${alias}.owner_id = ? OR ${alias}.owner_id IS NULL)`, values: [integer(req.admin?.id)] };
}

async function getAccessibleLead(req, id) {
  const owner = leadOwnerClause(req, "l");
  const rows = await query(
    `SELECT l.*, a.name AS owner_name, a.email AS owner_email
     FROM sales_leads l
     LEFT JOIN admins a ON a.id = l.owner_id
     WHERE l.id = ? AND ${owner.sql}
     LIMIT 1`,
    [id, ...owner.values]
  );
  return rows[0] || null;
}

function normalizeLeadPayload(req) {
  const status = clean(req.body?.status || "Newly Added");
  const requestedOwnerId = nullableInteger(req.body?.ownerId || req.body?.owner_id);
  return {
    leadName: clean(req.body?.leadName || req.body?.lead_name),
    meetingAt: clean(req.body?.meetingAt || req.body?.meeting_at),
    place: clean(req.body?.place),
    companyName: clean(req.body?.companyName || req.body?.company_name),
    contactPerson: clean(req.body?.contactPerson || req.body?.contact_person),
    phone: clean(req.body?.phone),
    whatsapp: clean(req.body?.whatsapp || req.body?.phone),
    email: clean(req.body?.email).toLowerCase(),
    notes: clean(req.body?.notes || req.body?.remarks),
    status,
    closingRemarks: clean(req.body?.closingRemarks || req.body?.closing_remarks),
    source: clean(req.body?.source || req.body?.leadSource || req.body?.lead_source || "Manual").slice(0, 80),
    ownerId: isSuperAdmin(req.admin)
      ? requestedOwnerId
      : isSalesman(req.admin)
        ? nullableInteger(req.admin?.id)
        : requestedOwnerId,
  };
}

function validateLead(payload) {
  if (!payload.leadName || !payload.meetingAt) return "Lead name and meeting date/time are required";
  if (!LEAD_STATUSES.includes(payload.status)) return "Valid lead status is required";
  if (FINAL_LEAD_STATUSES.has(payload.status) && !payload.closingRemarks) {
    return "Closing remarks are required for final lead statuses";
  }
  return "";
}

async function assertValidLeadOwner(ownerId) {
  if (!ownerId) return null;
  const ownerRows = await query(
    "SELECT id FROM admins WHERE id=? AND status='Active' AND LOWER(TRIM(role))='salesman' LIMIT 1",
    [ownerId]
  );
  if (!ownerRows.length) throw new Error("Active Salesman owner is required");
  return ownerRows[0];
}

function leadWhere(req) {
  const owner = leadOwnerClause(req, "l");
  const where = [owner.sql];
  const values = [...owner.values];
  const q = clean(req.query.q);

  if (q) {
    where.push(
      "(l.lead_name LIKE ? OR l.company_name LIKE ? OR l.contact_person LIKE ? OR l.phone LIKE ? OR l.email LIKE ? OR l.place LIKE ? OR l.lead_source LIKE ?)"
    );
    values.push(...Array(7).fill(`%${q}%`));
  }
  if (clean(req.query.status)) {
    where.push("l.status = ?");
    values.push(clean(req.query.status));
  }
  if (clean(req.query.source)) {
    where.push("l.lead_source = ?");
    values.push(clean(req.query.source));
  }
  if (req.query.ownerId && isSuperAdmin(req.admin)) {
    if (clean(req.query.ownerId).toLowerCase() === "unassigned") {
      where.push("l.owner_id IS NULL");
    } else {
      where.push("l.owner_id = ?");
      values.push(integer(req.query.ownerId));
    }
  }
  if (clean(req.query.from)) {
    where.push("DATE(l.meeting_at) >= ?");
    values.push(clean(req.query.from));
  }
  if (clean(req.query.to)) {
    where.push("DATE(l.meeting_at) <= ?");
    values.push(clean(req.query.to));
  }

  return {
    base: `FROM sales_leads l LEFT JOIN admins a ON a.id=l.owner_id WHERE ${where.join(" AND ")}`,
    values,
  };
}

export async function getSalesmen(req, res) {
  if (!isSuperAdmin(req.admin)) {
    return res.status(403).json({ message: "Only Super Admin can list Salesman accounts" });
  }
  try {
    const rows = await query(
      "SELECT id, name, email FROM admins WHERE status='Active' AND LOWER(TRIM(role))='salesman' ORDER BY name"
    );
    res.json({ salesmen: rows });
  } catch (error) {
    console.log("Load salesmen:", error);
    res.status(500).json({ message: "Unable to load salesmen" });
  }
}

export async function recoverInterruptedCatalogGenerations() {
  await query(
    `UPDATE sales_catalogs
     SET status='Failed', error_message='Generation was interrupted by a service restart'
     WHERE status='Generating'`
  );
}

export async function getSalesLeads(req, res) {
  if (!requireSalesAccess(req, res)) return;
  const { page, limit, offset } = pagination(req.query);
  const { base, values } = leadWhere(req);

  try {
    const rows = await query(
      `SELECT l.*, COALESCE(a.name, 'Unassigned') AS owner_name, a.email AS owner_email,
        (SELECT COUNT(*) FROM sales_catalogs sc WHERE sc.lead_id=l.id AND sc.status<>'Archived') AS catalog_count
       ${base}
       ORDER BY l.meeting_at DESC, l.id DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
    const countRows = await query(`SELECT COUNT(*) AS total ${base}`, values);
    res.json({
      leads: rows,
      statuses: LEAD_STATUSES,
      sources: ["Manual", "Justdial", "Indiamart", "Other"],
      pagination: { page, limit, total: Number(countRows[0]?.total || 0) },
      canReassign: isSuperAdmin(req.admin),
    });
  } catch (error) {
    console.log("Load leads:", error);
    res.status(500).json({ message: "Unable to load leads" });
  }
}

export async function getSalesLead(req, res) {
  if (!requireSalesAccess(req, res)) return;
  try {
    const lead = await getAccessibleLead(req, integer(req.params.id));
    if (!lead) return res.status(404).json({ message: "Lead not found" });
    const history = await query(
      `SELECT h.*, a.name AS changed_by_name
       FROM sales_lead_history h LEFT JOIN admins a ON a.id=h.changed_by
       WHERE h.lead_id=? ORDER BY h.created_at DESC`,
      [lead.id]
    );
    res.json({ lead, history });
  } catch (error) {
    console.log("Load lead:", error);
    res.status(500).json({ message: "Unable to load lead" });
  }
}

export async function createSalesLead(req, res) {
  if (!requireSalesAccess(req, res)) return;
  const payload = normalizeLeadPayload(req);
  const validation = validateLead(payload);
  if (validation) return res.status(400).json({ message: validation });

  try {
    try {
      await assertValidLeadOwner(payload.ownerId);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
    const result = await query(
      `INSERT INTO sales_leads
       (lead_name,lead_source,meeting_at,place,company_name,contact_person,phone,whatsapp,email,notes,status,closing_remarks,owner_id,created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        payload.leadName,
        payload.source || "Manual",
        new Date(payload.meetingAt),
        payload.place || null,
        payload.companyName || null,
        payload.contactPerson || null,
        payload.phone || null,
        payload.whatsapp || null,
        payload.email || null,
        payload.notes || null,
        payload.status,
        payload.closingRemarks || null,
        payload.ownerId,
        integer(req.admin?.id) || null,
      ]
    );
    await query(
      "INSERT INTO sales_lead_history (lead_id,status,remarks,changed_by) VALUES (?,?,?,?)",
      [result.insertId, payload.status, payload.closingRemarks || payload.notes || null, integer(req.admin?.id) || null]
    );
    await logActivity(req, "Created lead", `${payload.leadName} (#${result.insertId})`);
    res.status(201).json({ message: "Lead created", id: result.insertId });
  } catch (error) {
    console.log("Create lead:", error);
    res.status(500).json({ message: "Unable to create lead" });
  }
}

export async function updateSalesLead(req, res) {
  if (!requireSalesAccess(req, res)) return;
  const id = integer(req.params.id);
  const payload = normalizeLeadPayload(req);
  const validation = validateLead(payload);
  if (validation) return res.status(400).json({ message: validation });

  try {
    const current = await getAccessibleLead(req, id);
    if (!current) return res.status(404).json({ message: "Lead not found" });
    const currentOwnerId = nullableInteger(current.owner_id);
    if (payload.ownerId !== currentOwnerId && !isSuperAdmin(req.admin)) {
      return res.status(403).json({ message: "Only Super Admin can reassign leads" });
    }
    try {
      await assertValidLeadOwner(payload.ownerId);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    await query(
      `UPDATE sales_leads SET lead_name=?,lead_source=?,meeting_at=?,place=?,company_name=?,contact_person=?,phone=?,whatsapp=?,
       email=?,notes=?,status=?,closing_remarks=?,owner_id=? WHERE id=?`,
      [
        payload.leadName,
        payload.source || "Manual",
        new Date(payload.meetingAt),
        payload.place || null,
        payload.companyName || null,
        payload.contactPerson || null,
        payload.phone || null,
        payload.whatsapp || null,
        payload.email || null,
        payload.notes || null,
        payload.status,
        payload.closingRemarks || null,
        payload.ownerId,
        id,
      ]
    );
    if (payload.status !== current.status || payload.closingRemarks !== clean(current.closing_remarks)) {
      await query(
        "INSERT INTO sales_lead_history (lead_id,status,remarks,changed_by) VALUES (?,?,?,?)",
        [id, payload.status, payload.closingRemarks || payload.notes || null, integer(req.admin?.id) || null]
      );
    }
    await logActivity(req, "Updated lead", `${payload.leadName} (#${id})`);
    res.json({ message: "Lead updated" });
  } catch (error) {
    console.log("Update lead:", error);
    res.status(500).json({ message: "Unable to update lead" });
  }
}

export async function exportSalesLeads(req, res) {
  if (!requireSalesAccess(req, res)) return;
  try {
    const { base, values } = leadWhere(req);
    const rows = await query(
      `SELECT l.*, COALESCE(a.name, 'Unassigned') AS owner_name, a.email AS owner_email,
        (SELECT COUNT(*) FROM sales_catalogs sc WHERE sc.lead_id=l.id AND sc.status<>'Archived') AS catalog_count
       ${base}
       ORDER BY l.meeting_at DESC, l.id DESC
       LIMIT 10000`,
      values
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Golden Creation";
    const sheet = workbook.addWorksheet("Leads");
    sheet.columns = [
      { header: "Lead ID", key: "id", width: 12 },
      { header: "Source", key: "lead_source", width: 16 },
      { header: "Lead Name", key: "lead_name", width: 26 },
      { header: "Meeting At", key: "meeting_at", width: 22 },
      { header: "Place", key: "place", width: 24 },
      { header: "Company Name", key: "company_name", width: 28 },
      { header: "Contact Person", key: "contact_person", width: 24 },
      { header: "Phone", key: "phone", width: 18 },
      { header: "WhatsApp", key: "whatsapp", width: 18 },
      { header: "Email", key: "email", width: 28 },
      { header: "Assigned Salesman", key: "owner_name", width: 24 },
      { header: "Owner Email", key: "owner_email", width: 28 },
      { header: "Status", key: "status", width: 20 },
      { header: "Catalog Count", key: "catalog_count", width: 14 },
      { header: "Notes", key: "notes", width: 40 },
      { header: "Closing Remarks", key: "closing_remarks", width: 40 },
      { header: "Created At", key: "created_at", width: 22 },
      { header: "Updated At", key: "updated_at", width: 22 },
    ];
    sheet.addRows(rows.map((row) => ({
      ...row,
      lead_source: row.lead_source || "Manual",
      meeting_at: row.meeting_at ? new Date(row.meeting_at) : null,
      created_at: row.created_at ? new Date(row.created_at) : null,
      updated_at: row.updated_at ? new Date(row.updated_at) : null,
    })));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="golden-creation-leads.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.log("Export leads:", error);
    res.status(500).json({ message: "Unable to export leads" });
  }
}

async function descendantCategoryIds(categoryIds) {
  if (!categoryIds.length) return [];
  const rows = await query(
    `WITH RECURSIVE category_tree AS (
       SELECT id FROM categories WHERE id IN (?)
       UNION ALL
       SELECT c.id FROM categories c JOIN category_tree ct ON c.parent_id=ct.id
     )
     SELECT DISTINCT id FROM category_tree`,
    [categoryIds]
  );
  return rows.map((row) => Number(row.id));
}

async function collectionProductIds(collectionIds) {
  if (!collectionIds.length) return [];
  const collections = await query(
    "SELECT * FROM collections WHERE id IN (?) AND status='Active' AND deleted_at IS NULL",
    [collectionIds]
  );
  const ids = new Set();

  for (const collection of collections) {
    let page = 1;
    while (page <= 100) {
      const products = await getCollectionProducts(collection, { page, limit: 120 });
      products.forEach((product) => ids.add(Number(product.id)));
      if (products.length < 120) break;
      page += 1;
    }
  }

  return [...ids].filter(Boolean);
}

async function productSearch(filters = {}, requestedLimit = 24, requestedPage = 1) {
  const page = Math.max(1, integer(requestedPage, 1));
  const limit = Math.min(MAX_CATALOG_PRODUCTS, Math.max(1, integer(requestedLimit, 24)));
  const offset = (page - 1) * limit;
  const where = ["p.deleted_at IS NULL", "p.status='Active'"];
  const values = [];
  const q = clean(filters.q);
  const categoryIds = await descendantCategoryIds(parseIds(filters.categoryIds || filters.category_ids));
  const brandIds = parseIds(filters.brandIds || filters.brand_ids);
  const tagIds = parseIds(filters.tagIds || filters.tag_ids);
  const collectionIds = parseIds(filters.collectionIds || filters.collection_ids);
  const matchedCollectionProductIds = await collectionProductIds(collectionIds);

  if (q) {
    where.push("(p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ? OR c.name LIKE ? OR b.name LIKE ?)");
    values.push(...Array(5).fill(`%${q}%`));
  }
  if (categoryIds.length) {
    where.push("p.category_id IN (?)");
    values.push(categoryIds);
  }
  if (brandIds.length) {
    where.push("p.brand_id IN (?)");
    values.push(brandIds);
  }
  if (tagIds.length) {
    where.push("EXISTS (SELECT 1 FROM product_tags pt WHERE pt.product_id=p.id AND pt.tag_id IN (?))");
    values.push(tagIds);
  }
  if (collectionIds.length) {
    if (!matchedCollectionProductIds.length) {
      where.push("1=0");
    } else {
      where.push("p.id IN (?)");
      values.push(matchedCollectionProductIds);
    }
  }
  if (filters.minPrice !== undefined && filters.minPrice !== "") {
    where.push("p.price >= ?");
    values.push(Number(filters.minPrice) || 0);
  }
  if (filters.maxPrice !== undefined && filters.maxPrice !== "") {
    where.push("p.price <= ?");
    values.push(Number(filters.maxPrice) || 0);
  }
  if (filters.inStock !== false && clean(filters.inStock).toLowerCase() !== "false") {
    where.push("COALESCE(p.stock_quantity,0) > 0");
  }

  const sortMap = {
    name_asc: "p.name ASC",
    name_desc: "p.name DESC",
    price_asc: "p.price ASC, p.name ASC",
    price_desc: "p.price DESC, p.name ASC",
    newest: "p.created_at DESC",
  };
  const orderBy = sortMap[clean(filters.sort)] || "p.name ASC";
  const base = `FROM products p
    LEFT JOIN categories c ON c.id=p.category_id
    LEFT JOIN brands b ON b.id=p.brand_id
    WHERE ${where.join(" AND ")}`;
  const rows = await query(
    `SELECT p.id,p.name,p.sku,p.price,p.description,p.stock_quantity,c.name AS category_name,b.name AS brand_name,
      COALESCE(NULLIF(p.image,''),(SELECT pi.image_url FROM product_images pi WHERE pi.product_id=p.id ORDER BY pi.id LIMIT 1)) AS image_url
     ${base} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );
  const countRows = await query(`SELECT COUNT(DISTINCT p.id) AS total ${base}`, values);
  return { rows, pagination: { page, limit, total: Number(countRows[0]?.total || 0) } };
}

export async function searchSalesCatalogProducts(req, res) {
  if (!requireSalesAccess(req, res)) return;
  try {
    const filters = {
      ...req.query,
      inStock: clean(req.query.inStock).toLowerCase() !== "false",
    };
    const result = await productSearch(filters, req.query.limit, req.query.page);
    res.json({ products: result.rows, pagination: result.pagination, maxProducts: MAX_CATALOG_PRODUCTS });
  } catch (error) {
    console.log("Catalog product search:", error);
    res.status(500).json({ message: "Unable to search catalog products" });
  }
}

function catalogOwnerClause(req, alias = "sc") {
  return isSuperAdmin(req.admin)
    ? { sql: "1=1", values: [] }
    : { sql: `${alias}.creator_id=?`, values: [integer(req.admin?.id)] };
}

function publicCatalogUrl(req, token) {
  const configured = clean(process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL);
  const origin = configured || `${req.protocol}://${req.get("host")}`;
  return `${origin.replace(/\/$/, "")}/api/catalogs/share/${token}`;
}

function normalizeCatalog(row, req) {
  return {
    ...row,
    filters: parseJson(row.filters_json, {}),
    publicUrl: row.public_token ? publicCatalogUrl(req, row.public_token) : "",
  };
}

async function getAccessibleCatalog(req, id, includeProducts = true) {
  const owner = catalogOwnerClause(req);
  const rows = await query(
    `SELECT sc.*,l.lead_name,l.phone AS lead_phone,l.whatsapp AS lead_whatsapp,l.email AS lead_email,
      a.name AS creator_name
     FROM sales_catalogs sc
     LEFT JOIN sales_leads l ON l.id=sc.lead_id
     JOIN admins a ON a.id=sc.creator_id
     WHERE sc.id=? AND ${owner.sql} LIMIT 1`,
    [id, ...owner.values]
  );
  if (!rows.length) return null;
  const catalog = rows[0];
  if (includeProducts) {
    catalog.products = await query(
      "SELECT product_id,sort_order,snapshot_json FROM sales_catalog_products WHERE catalog_id=? ORDER BY sort_order,id",
      [id]
    );
    catalog.products = catalog.products.map((item) => ({
      ...parseJson(item.snapshot_json, {}),
      productId: item.product_id,
      sortOrder: item.sort_order,
    }));
  }
  return catalog;
}

async function ensureLeadAssociation(req, leadId) {
  if (!leadId) return null;
  const lead = await getAccessibleLead(req, leadId);
  if (!lead) throw new Error("Linked lead is not accessible");
  return lead;
}

async function replaceCatalogProducts(catalogId, productIds) {
  if (!productIds.length) throw new Error("Select at least one product");
  if (productIds.length > MAX_CATALOG_PRODUCTS) {
    throw new Error(`A catalog can contain at most ${MAX_CATALOG_PRODUCTS} products`);
  }
  const rows = await query(
    `SELECT p.id,p.name,p.sku,p.price,p.description,c.name AS category_name,b.name AS brand_name,
      COALESCE(NULLIF(p.image,''),(SELECT pi.image_url FROM product_images pi WHERE pi.product_id=p.id ORDER BY pi.id LIMIT 1)) AS image_url
     FROM products p
     LEFT JOIN categories c ON c.id=p.category_id
     LEFT JOIN brands b ON b.id=p.brand_id
     WHERE p.id IN (?) AND p.deleted_at IS NULL AND p.status='Active'`,
    [productIds]
  );
  const map = new Map(rows.map((row) => [Number(row.id), row]));
  const ordered = productIds.map((id) => map.get(Number(id))).filter(Boolean);
  if (ordered.length !== productIds.length) throw new Error("One or more selected products are unavailable");

  await query("DELETE FROM sales_catalog_products WHERE catalog_id=?", [catalogId]);
  for (const [index, product] of ordered.entries()) {
    await query(
      "INSERT INTO sales_catalog_products (catalog_id,product_id,sort_order,snapshot_json) VALUES (?,?,?,?)",
      [catalogId, product.id, index, JSON.stringify(product)]
    );
  }
}

export async function getSalesCatalogs(req, res) {
  if (!requireSalesAccess(req, res)) return;
  const { page, limit, offset } = pagination(req.query);
  const owner = catalogOwnerClause(req);
  const where = [owner.sql];
  const values = [...owner.values];
  if (clean(req.query.status)) {
    where.push("sc.status=?");
    values.push(clean(req.query.status));
  }
  if (clean(req.query.q)) {
    where.push("(sc.name LIKE ? OR l.lead_name LIKE ?)");
    values.push(`%${clean(req.query.q)}%`, `%${clean(req.query.q)}%`);
  }
  try {
    const base = `FROM sales_catalogs sc LEFT JOIN sales_leads l ON l.id=sc.lead_id
      JOIN admins a ON a.id=sc.creator_id WHERE ${where.join(" AND ")}`;
    const rows = await query(
      `SELECT sc.*,l.lead_name,l.phone AS lead_phone,l.whatsapp AS lead_whatsapp,l.email AS lead_email,
       a.name AS creator_name,(SELECT COUNT(*) FROM sales_catalog_products sp WHERE sp.catalog_id=sc.id) AS product_count
       ${base} ORDER BY sc.updated_at DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
    const countRows = await query(`SELECT COUNT(*) AS total ${base}`, values);
    res.json({
      catalogs: rows.map((row) => normalizeCatalog(row, req)),
      pagination: { page, limit, total: Number(countRows[0]?.total || 0) },
    });
  } catch (error) {
    console.log("Load sales catalogs:", error);
    res.status(500).json({ message: "Unable to load catalogs" });
  }
}

export async function getSalesCatalog(req, res) {
  if (!requireSalesAccess(req, res)) return;
  try {
    const catalog = await getAccessibleCatalog(req, integer(req.params.id));
    if (!catalog) return res.status(404).json({ message: "Catalog not found" });
    res.json({ catalog: normalizeCatalog(catalog, req) });
  } catch (error) {
    console.log("Load catalog:", error);
    res.status(500).json({ message: "Unable to load catalog" });
  }
}

async function saveCatalog(req, res, existing = null) {
  const name = clean(req.body?.name);
  const leadId = integer(req.body?.leadId || req.body?.lead_id) || null;
  const layout = CATALOG_LAYOUTS.has(clean(req.body?.layout)) ? clean(req.body.layout) : "2x2";
  const filters = req.body?.filters && typeof req.body.filters === "object" ? req.body.filters : {};
  const productIds = parseIds(req.body?.productIds || req.body?.product_ids);

  if (!name) return res.status(400).json({ message: "Catalog name is required" });
  if (!productIds.length) return res.status(400).json({ message: "Select at least one product" });
  if (productIds.length > MAX_CATALOG_PRODUCTS) {
    return res.status(400).json({ message: `A catalog can contain at most ${MAX_CATALOG_PRODUCTS} products` });
  }

  try {
    await ensureLeadAssociation(req, leadId);
    let id = existing?.id;
    if (existing) {
      if (!["Draft", "Failed"].includes(existing.status)) {
        return res.status(409).json({ message: "Ready, generating, or archived catalogs cannot be edited" });
      }
      await query(
        "UPDATE sales_catalogs SET name=?,lead_id=?,filters_json=?,layout=?,status='Draft',error_message=NULL WHERE id=?",
        [name, leadId, JSON.stringify(filters), layout, id]
      );
    } else {
      const result = await query(
        "INSERT INTO sales_catalogs (name,lead_id,creator_id,filters_json,layout,status) VALUES (?,?,?,?,?,'Draft')",
        [name, leadId, integer(req.admin?.id), JSON.stringify(filters), layout]
      );
      id = result.insertId;
    }
    await replaceCatalogProducts(id, productIds);
    await logActivity(req, existing ? "Updated sales catalog" : "Created sales catalog", `${name} (#${id})`);
    res.status(existing ? 200 : 201).json({ message: "Catalog draft saved", id });
  } catch (error) {
    console.log("Save catalog:", error);
    res.status(400).json({ message: error.message || "Unable to save catalog" });
  }
}

export async function createSalesCatalog(req, res) {
  if (!requireSalesAccess(req, res)) return;
  return saveCatalog(req, res);
}

export async function updateSalesCatalog(req, res) {
  if (!requireSalesAccess(req, res)) return;
  try {
    const catalog = await getAccessibleCatalog(req, integer(req.params.id), false);
    if (!catalog) return res.status(404).json({ message: "Catalog not found" });
    return saveCatalog(req, res, catalog);
  } catch (error) {
    console.log("Update catalog:", error);
    res.status(500).json({ message: "Unable to update catalog" });
  }
}

export async function duplicateSalesCatalog(req, res) {
  if (!requireSalesAccess(req, res)) return;
  try {
    const catalog = await getAccessibleCatalog(req, integer(req.params.id));
    if (!catalog) return res.status(404).json({ message: "Catalog not found" });
    const result = await query(
      "INSERT INTO sales_catalogs (name,lead_id,creator_id,filters_json,layout,status) VALUES (?,?,?,?,?,'Draft')",
      [`${catalog.name} Copy`, catalog.lead_id || null, integer(req.admin?.id), catalog.filters_json, catalog.layout]
    );
    for (const product of catalog.products) {
      await query(
        "INSERT INTO sales_catalog_products (catalog_id,product_id,sort_order,snapshot_json) VALUES (?,?,?,?)",
        [result.insertId, product.productId, product.sortOrder, JSON.stringify(product)]
      );
    }
    await logActivity(req, "Duplicated sales catalog", `${catalog.name} -> #${result.insertId}`);
    res.status(201).json({ message: "Catalog duplicated", id: result.insertId });
  } catch (error) {
    console.log("Duplicate catalog:", error);
    res.status(500).json({ message: "Unable to duplicate catalog" });
  }
}

async function imageBuffer(url) {
  if (!/^https?:\/\//i.test(clean(url))) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") || "";
    if (!type.startsWith("image/")) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function truncate(value, length) {
  const text = clean(value).replace(/\s+/g, " ");
  return text.length > length ? `${text.slice(0, length - 3)}...` : text;
}

function currency(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function pdfBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

export async function buildCatalogPdf(catalog) {
  const products = catalog.products || [];
  const compact = catalog.layout === "2x4";
  const perPage = compact ? 8 : 4;
  const doc = new PDFDocument({ size: "A4", margin: 34, autoFirstPage: false, bufferPages: true });
  const output = pdfBuffer(doc);
  const logo = await fs.readFile(LOGO_PATH).catch(() => null);
  const productImages = new Map();

  for (let start = 0; start < products.length; start += 8) {
    await Promise.all(
      products.slice(start, start + 8).map(async (product) => {
        productImages.set(product.productId, await imageBuffer(product.image_url));
      })
    );
  }

  for (let pageStart = 0; pageStart < products.length; pageStart += perPage) {
    doc.addPage();
    const pageNumber = Math.floor(pageStart / perPage) + 1;
    const totalPages = Math.ceil(products.length / perPage);
    if (logo) {
      doc.image(logo, 34, 28, { fit: [260, 46], align: "left", valign: "center" });
    } else {
      doc.fillColor("#A06422").font("Helvetica-Bold").fontSize(19).text("Golden Creation", 34, 32);
      doc.fillColor("#4B5563").font("Helvetica").fontSize(8.5).text("House of Office Stationery & Gift Items", 34, 56);
    }
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(14).text(catalog.name, 34, 84, { width: 527 });
    const labels = [catalog.categoryLabels, catalog.collectionLabels].filter(Boolean).join(" | ");
    if (labels) doc.fillColor("#6B7280").font("Helvetica").fontSize(8).text(labels, 34, 104, { width: 527 });
    doc.moveTo(34, 120).lineTo(561, 120).strokeColor("#D6BE8C").stroke();

    const columns = 2;
    const rows = compact ? 4 : 2;
    const gap = 12;
    const cardWidth = (527 - gap) / columns;
    const cardHeight = compact ? 151 : 311;
    const yStart = 132;

    for (const [localIndex, product] of products.slice(pageStart, pageStart + perPage).entries()) {
      const column = localIndex % columns;
      const row = Math.floor(localIndex / columns);
      const x = 34 + column * (cardWidth + gap);
      const y = yStart + row * (cardHeight + gap);
      doc.roundedRect(x, y, cardWidth, cardHeight, 5).fillAndStroke("#FFFFFF", "#E5E7EB");
      const image = productImages.get(product.productId);
      const imageHeight = compact ? 68 : 156;
      if (image) {
        try {
          doc.image(image, x + 9, y + 8, { fit: [cardWidth - 18, imageHeight], align: "center", valign: "center" });
        } catch {
          doc.fillColor("#F3F4F6").rect(x + 9, y + 8, cardWidth - 18, imageHeight).fill();
        }
      } else {
        doc.fillColor("#F3F4F6").rect(x + 9, y + 8, cardWidth - 18, imageHeight).fill();
        doc.fillColor("#9CA3AF").font("Helvetica").fontSize(8).text("Image unavailable", x + 9, y + 8 + imageHeight / 2 - 4, {
          width: cardWidth - 18,
          align: "center",
        });
      }
      let textY = y + imageHeight + 15;
      doc.fillColor("#111827").font("Helvetica-Bold").fontSize(compact ? 8.5 : 11).text(
        truncate(product.name, compact ? 56 : 86),
        x + 10,
        textY,
        { width: cardWidth - 20, height: compact ? 20 : 31 }
      );
      textY += compact ? 22 : 34;
      doc.fillColor("#6B7280").font("Helvetica").fontSize(compact ? 6.8 : 8).text(
        [product.brand_name, product.category_name].filter(Boolean).join(" | ") || "Golden Creation",
        x + 10,
        textY,
        { width: cardWidth - 20 }
      );
      textY += compact ? 12 : 17;
      doc.fillColor("#A06422").font("Helvetica-Bold").fontSize(compact ? 9 : 12).text(currency(product.price), x + 10, textY);
      doc.fillColor("#6B7280").font("Helvetica").fontSize(compact ? 6.5 : 8).text(`SKU: ${product.sku || "-"}`, x + 115, textY + 2, {
        width: cardWidth - 125,
        align: "right",
      });
      if (!compact) {
        textY += 22;
        doc.fillColor("#4B5563").font("Helvetica").fontSize(8).text(truncate(product.description, 150), x + 10, textY, {
          width: cardWidth - 20,
          height: 43,
        });
      }
      const productUrl = `${clean(process.env.STOREFRONT_URL) || "https://goldencreation.in"}/product/${product.productId}`;
      const linkY = y + cardHeight - 24;
      doc.fillColor("#A06422").font("Helvetica-Bold").fontSize(8).text("View product online", x + 10, linkY, {
        width: cardWidth - 20,
        underline: true,
        link: productUrl,
      });
    }

    doc.fillColor("#6B7280").font("Helvetica").fontSize(7.5).text(
      `goldencreation.in  |  Generated ${new Date().toLocaleDateString("en-IN")}  |  Page ${pageNumber} of ${totalPages}`,
      34,
      792,
      { width: 527, align: "center" }
    );
  }

  doc.end();
  return output;
}

async function generationLabels(filters) {
  const categoryIds = parseIds(filters.categoryIds);
  const collectionIds = parseIds(filters.collectionIds);
  const [categories, collections] = await Promise.all([
    categoryIds.length ? query("SELECT name FROM categories WHERE id IN (?) ORDER BY name", [categoryIds]) : [],
    collectionIds.length ? query("SELECT name FROM collections WHERE id IN (?) ORDER BY name", [collectionIds]) : [],
  ]);
  return {
    categoryLabels: categories.map((item) => item.name).join(", "),
    collectionLabels: collections.map((item) => item.name).join(", "),
  };
}

async function generateCatalogPdf(catalogId) {
  let storageKey = "";
  let previousStorageKey = "";
  try {
    const rows = await query("SELECT * FROM sales_catalogs WHERE id=? LIMIT 1", [catalogId]);
    const catalog = rows[0];
    if (!catalog || catalog.status !== "Generating") return;
    previousStorageKey = clean(catalog.pdf_storage_key);
    catalog.products = (await query(
      "SELECT product_id,sort_order,snapshot_json FROM sales_catalog_products WHERE catalog_id=? ORDER BY sort_order,id",
      [catalogId]
    )).map((item) => ({ ...parseJson(item.snapshot_json, {}), productId: item.product_id }));
    if (!catalog.products.length) throw new Error("Catalog has no products");
    Object.assign(catalog, await generationLabels(parseJson(catalog.filters_json, {})));
    const buffer = await buildCatalogPdf(catalog);
    const media = await uploadPrivateBufferToSpaces({
      buffer,
      originalName: `${clean(catalog.name).replace(/[^a-z0-9]+/gi, "-") || "catalog"}.pdf`,
      mimeType: "application/pdf",
      folder: "sales-catalogs",
    });
    storageKey = media.key;
    await query(
      `UPDATE sales_catalogs SET status='Ready',pdf_storage_key=?,pdf_size=?,error_message=NULL,
       public_token=COALESCE(public_token,?),generated_at=NOW() WHERE id=?`,
      [media.key, media.size, crypto.randomBytes(32).toString("base64url"), catalogId]
    );
    if (previousStorageKey && previousStorageKey !== media.key) {
      await deleteFromSpaces(previousStorageKey).catch(() => {});
    }
  } catch (error) {
    if (storageKey) await deleteFromSpaces(storageKey).catch(() => {});
    await query("UPDATE sales_catalogs SET status='Failed',error_message=? WHERE id=?", [
      truncate(error.message || "Catalog generation failed", 1000),
      catalogId,
    ]).catch(() => {});
    console.log(`Catalog ${catalogId} generation failed:`, error);
  }
}

export async function regenerateReadyCatalogs() {
  const catalogs = await query(
    `SELECT id
       FROM sales_catalogs
      WHERE status = 'Ready' AND archived_at IS NULL
      ORDER BY id`
  );
  for (const catalog of catalogs) {
    await query(
      `UPDATE sales_catalogs
          SET status='Generating', error_message=NULL
        WHERE id=?`,
      [catalog.id]
    );
    await generateCatalogPdf(Number(catalog.id));
  }
  return catalogs.length;
}

export async function downloadSalesCatalog(req, res) {
  if (!requireSalesAccess(req, res)) return;
  try {
    const catalog = await getAccessibleCatalog(req, integer(req.params.id), false);
    if (!catalog || catalog.status !== "Ready" || !catalog.pdf_storage_key) {
      return res.status(404).json({ message: "Ready catalog not found" });
    }
    const object = await getPrivateObjectFromSpaces(catalog.pdf_storage_key);
    res.setHeader("Content-Type", object.ContentType || "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${clean(catalog.name).replace(/[^a-z0-9]+/gi, "-") || "catalog"}.pdf"`
    );
    res.setHeader("Cache-Control", "private, no-store");
    if (object.ContentLength) res.setHeader("Content-Length", object.ContentLength);
    if (typeof object.Body?.pipe === "function") {
      object.Body.pipe(res);
      return;
    }
    const bytes = await object.Body.transformToByteArray();
    res.end(Buffer.from(bytes));
  } catch (error) {
    console.log("Download sales catalog:", error);
    res.status(500).json({ message: "Unable to download catalog" });
  }
}

export async function generateSalesCatalog(req, res) {
  if (!requireSalesAccess(req, res)) return;
  try {
    const catalog = await getAccessibleCatalog(req, integer(req.params.id), false);
    if (!catalog) return res.status(404).json({ message: "Catalog not found" });
    if (!["Draft", "Failed"].includes(catalog.status)) {
      return res.status(409).json({ message: "Only draft or failed catalogs can be generated" });
    }
    const countRows = await query("SELECT COUNT(*) AS total FROM sales_catalog_products WHERE catalog_id=?", [catalog.id]);
    if (!Number(countRows[0]?.total)) return res.status(400).json({ message: "Catalog has no products" });
    await query(
      "UPDATE sales_catalogs SET status='Generating',error_message=NULL,public_token=COALESCE(public_token,?) WHERE id=?",
      [crypto.randomBytes(32).toString("base64url"), catalog.id]
    );
    setImmediate(() => generateCatalogPdf(catalog.id));
    await logActivity(req, "Started catalog generation", `${catalog.name} (#${catalog.id})`);
    res.status(202).json({ message: "Catalog generation started", status: "Generating" });
  } catch (error) {
    console.log("Start catalog generation:", error);
    res.status(500).json({ message: "Unable to start catalog generation" });
  }
}

export async function archiveSalesCatalog(req, res) {
  if (!requireSalesAccess(req, res)) return;
  try {
    const catalog = await getAccessibleCatalog(req, integer(req.params.id), false);
    if (!catalog) return res.status(404).json({ message: "Catalog not found" });
    if (catalog.status === "Generating") return res.status(409).json({ message: "Generating catalogs cannot be archived" });
    if (catalog.pdf_storage_key) await deleteFromSpaces(catalog.pdf_storage_key);
    await query(
      "UPDATE sales_catalogs SET status='Archived',archived_at=NOW(),public_token=NULL,pdf_storage_key=NULL,pdf_size=NULL WHERE id=?",
      [catalog.id]
    );
    await logActivity(req, "Archived sales catalog", `${catalog.name} (#${catalog.id})`);
    res.json({ message: "Catalog archived and public link revoked" });
  } catch (error) {
    console.log("Archive catalog:", error);
    res.status(500).json({ message: "Unable to archive catalog" });
  }
}

export async function deleteSalesCatalog(req, res) {
  if (!requireSalesAccess(req, res)) return;
  try {
    const catalog = await getAccessibleCatalog(req, integer(req.params.id), false);
    if (!catalog) return res.status(404).json({ message: "Catalog not found" });
    if (catalog.status === "Generating") return res.status(409).json({ message: "Generating catalogs cannot be deleted" });

    if (catalog.pdf_storage_key) {
      await deleteFromSpaces(catalog.pdf_storage_key).catch(() => {});
    }

    await query("DELETE FROM sales_catalog_shares WHERE catalog_id=?", [catalog.id]).catch(() => {});
    await query("DELETE FROM sales_catalog_products WHERE catalog_id=?", [catalog.id]);
    await query("DELETE FROM sales_catalogs WHERE id=?", [catalog.id]);
    await logActivity(req, "Deleted sales catalog", `${catalog.name} (#${catalog.id})`);
    res.json({ message: "Catalog deleted" });
  } catch (error) {
    console.log("Delete catalog:", error);
    res.status(500).json({ message: "Unable to delete catalog" });
  }
}

export async function recordSalesCatalogShare(req, res) {
  if (!requireSalesAccess(req, res)) return;
  try {
    const catalog = await getAccessibleCatalog(req, integer(req.params.id), false);
    if (!catalog || catalog.status !== "Ready") return res.status(404).json({ message: "Ready catalog not found" });
    const channel = clean(req.body?.channel);
    if (!["WhatsApp", "Email", "Copy Link"].includes(channel)) {
      return res.status(400).json({ message: "Valid share channel is required" });
    }
    await query(
      "INSERT INTO sales_catalog_shares (catalog_id,channel,recipient,shared_by) VALUES (?,?,?,?)",
      [catalog.id, channel, clean(req.body?.recipient) || null, integer(req.admin?.id) || null]
    );
    res.json({ message: "Catalog share recorded" });
  } catch (error) {
    console.log("Record catalog share:", error);
    res.status(500).json({ message: "Unable to record catalog share" });
  }
}

export async function streamSharedCatalog(req, res) {
  try {
    const token = clean(req.params.token);
    const rows = await query(
      "SELECT name,pdf_storage_key,pdf_size FROM sales_catalogs WHERE public_token=? AND status='Ready' AND archived_at IS NULL LIMIT 1",
      [token]
    );
    const catalog = rows[0];
    if (!catalog?.pdf_storage_key) return res.status(404).json({ message: "Catalog not found or no longer available" });
    const object = await getPrivateObjectFromSpaces(catalog.pdf_storage_key);
    res.setHeader("Content-Type", object.ContentType || "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${clean(catalog.name).replace(/[^a-z0-9]+/gi, "-") || "catalog"}.pdf"`
    );
    res.setHeader("Cache-Control", "private, max-age=300");
    if (object.ContentLength) res.setHeader("Content-Length", object.ContentLength);
    if (typeof object.Body?.pipe === "function") {
      object.Body.pipe(res);
      return;
    }
    const bytes = await object.Body.transformToByteArray();
    res.end(Buffer.from(bytes));
  } catch (error) {
    console.log("Stream shared catalog:", error);
    res.status(500).json({ message: "Unable to open catalog" });
  }
}
