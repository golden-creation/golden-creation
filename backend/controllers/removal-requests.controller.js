import jwt from "jsonwebtoken";
import db from "../config/db.js";
import { safelyDeleteMedia } from "../services/media-reference.service.js";

function dbQuery(sql, values = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, values, (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
}

function clean(value) {
  return String(value || "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isSuperAdmin(admin) {
  return ["super admin", "technical developer"].includes(clean(admin?.role).toLowerCase());
}

function routeLabel(method, path, payload = {}) {
  const normalized = clean(path);
  const entity = normalized
    .replace(/^\/api\/admin\//, "")
    .replace(/^\/api\//, "")
    .replace(/\?.*$/, "");

  if (entity.startsWith("bulk/")) {
    return `Bulk ${payload.action || "delete"}: ${entity.replace("bulk/", "")}`;
  }

  return `${method} ${entity || normalized}`;
}

async function ensureRemovalRequestsSchema() {
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS removal_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      requester_admin_id INT NULL,
      requester_name VARCHAR(160) NULL,
      requester_email VARCHAR(190) NULL,
      request_method VARCHAR(16) NOT NULL,
      request_path VARCHAR(255) NOT NULL,
      request_body JSON NULL,
      target_label VARCHAR(255) NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'Pending',
      reviewer_admin_id INT NULL,
      reviewer_name VARCHAR(160) NULL,
      remarks TEXT NULL,
      reviewed_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_removal_requests_status_created (status, created_at),
      INDEX idx_removal_requests_requester (requester_admin_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function notify({ type, title, message, link }) {
  try {
    await dbQuery(
      "INSERT INTO admin_notifications (type, title, message, link) VALUES (?, ?, ?, ?)",
      [type, title, message, link || "/removal-requests"]
    );
  } catch {
    // Notifications are helpful, but must not block delete approval flow.
  }
}

async function createRemovalRequest(req, res) {
  await ensureRemovalRequestsSchema();
  const method = clean(req.method || "DELETE").toUpperCase();
  const path = clean(req.originalUrl || req.path);
  const body = req.body && Object.keys(req.body).length ? req.body : {};
  const targetLabel = routeLabel(method, path, body);

  const result = await dbQuery(
    `
      INSERT INTO removal_requests
        (requester_admin_id, requester_name, requester_email, request_method, request_path, request_body, target_label)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      req.admin?.id || null,
      req.admin?.name || null,
      req.admin?.email || null,
      method,
      path,
      JSON.stringify(body),
      targetLabel,
    ]
  );

  await notify({
    type: "removal_request",
    title: "Delete approval requested",
    message: `${req.admin?.name || req.admin?.email || "Staff"} requested deletion: ${targetLabel}`,
    link: "/removal-requests",
  });

  return res.status(202).json({
    message: "Delete request sent to admin. Please wait for approval.",
    removalRequest: { id: result.insertId, status: "Pending", targetLabel },
  });
}

export async function requireAdminDeleteApproval(req, res, next) {
  if (isSuperAdmin(req.admin)) {
    next();
    return;
  }

  try {
    await createRemovalRequest(req, res);
  } catch (error) {
    res.status(500).json({ message: error.message || "Unable to create delete approval request" });
  }
}

export async function requireProductDeleteApproval(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Admin login required" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "local_dev_secret_change_before_deploy");
    if (payload.type !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    req.admin = payload;
  } catch {
    return res.status(401).json({ message: "Invalid or expired admin session" });
  }

  return requireAdminDeleteApproval(req, res, next);
}

function parseRequestBody(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function assertCanDeleteStaff(id) {
  const rows = await dbQuery("SELECT id, name, email, role FROM admins WHERE id = ? LIMIT 1", [id]);
  const staff = rows[0];
  if (!staff) throw new Error("Staff member not found");
  if (
    number(staff.id) === 1 ||
    clean(staff.email).toLowerCase() === "goldencreation@lekhanmart.in" ||
    (clean(staff.name).toLowerCase() === "ajay malhotra" && clean(staff.role).toLowerCase() === "super admin")
  ) {
    throw new Error("Ajay Malhotra's Super Admin account cannot be deleted");
  }
}

async function deleteOneByPath(path) {
  if (clean(path).startsWith("/api/admin/media")) {
    throw new Error("Media approval requires request body details");
  }

  let match = clean(path).match(/^\/api\/products\/(\d+)/);
  if (match) {
    await dbQuery("UPDATE products SET deleted_at = NOW(), status = 'Inactive' WHERE id = ?", [number(match[1])]);
    return "Product archived";
  }

  match = clean(path).match(/^\/api\/admin\/staff\/(\d+)/);
  if (match) {
    const id = number(match[1]);
    await assertCanDeleteStaff(id);
    try {
      await dbQuery("DELETE FROM admins WHERE id = ?", [id]);
    } catch {
      await dbQuery("UPDATE admins SET status = 'Deleted', permissions = '[]', updated_at = NOW() WHERE id = ?", [id]);
    }
    return "Staff deleted";
  }

  match = clean(path).match(/^\/api\/admin\/categories\/(\d+)/);
  if (match) {
    const id = number(match[1]);
    await dbQuery("UPDATE products SET category_id = NULL WHERE category_id = ?", [id]);
    await dbQuery("DELETE FROM category_tax_rules WHERE category_id = ?", [id]);
    await dbQuery("DELETE FROM categories WHERE id = ?", [id]);
    return "Category deleted";
  }

  const softDeleteMap = [
    [/^\/api\/admin\/brands\/(\d+)/, "brands", "deleted_at = NOW(), status = 'Inactive'"],
    [/^\/api\/admin\/tags\/(\d+)/, "tags", "deleted_at = NOW(), status = 'Inactive'"],
    [/^\/api\/admin\/collections\/(\d+)/, "collections", "deleted_at = NOW(), status = 'Inactive'"],
    [/^\/api\/admin\/menus\/(\d+)/, "menus", "deleted_at = NOW(), visibility = 'Hidden'"],
    [/^\/api\/admin\/bundles\/(\d+)/, "bundle_products", "deleted_at = NOW(), status = 'Inactive'"],
    [/^\/api\/admin\/discounts\/(\d+)/, "discounts", "deleted_at = NOW(), status = 'Inactive'"],
    [/^\/api\/admin\/drive\/folders\/(\d+)/, "drive_folders", "deleted_at = NOW()"],
    [/^\/api\/admin\/drive\/files\/(\d+)/, "drive_files", "deleted_at = NOW()"],
    [/^\/api\/admin\/sales-catalogs\/(\d+)/, "sales_catalogs", "status = 'Archived', archived_at = NOW(), public_token = NULL, pdf_storage_key = NULL, pdf_size = NULL"],
  ];

  for (const [regex, table, updateSql] of softDeleteMap) {
    match = clean(path).match(regex);
    if (match) {
      await dbQuery(`UPDATE ${table} SET ${updateSql} WHERE id = ?`, [number(match[1])]);
      return `${table} archived`;
    }
  }

  const hardDeleteMap = [
    [/^\/api\/admin\/customers\/(\d+)/, "users"],
    [/^\/api\/admin\/suppliers\/(\d+)/, "suppliers"],
    [/^\/api\/admin\/tax-rules\/(\d+)/, "category_tax_rules"],
    [/^\/api\/admin\/shipping\/rules\/(\d+)/, "shipping_rules"],
    [/^\/api\/admin\/payment-settings\/partial-cod-rules\/(\d+)/, "partial_cod_rules"],
    [/^\/api\/admin\/blog\/(\d+)/, "blog_posts"],
  ];

  for (const [regex, table] of hardDeleteMap) {
    match = clean(path).match(regex);
    if (match) {
      await dbQuery(`DELETE FROM ${table} WHERE id = ?`, [number(match[1])]);
      return `${table} deleted`;
    }
  }

  throw new Error("This delete request type is not supported yet");
}

async function performBulkRemoval(path, body) {
  if (clean(path).startsWith("/api/admin/media")) {
    await safelyDeleteMedia(body.key || body.url);
    return "Media deleted";
  }

  const bulk = clean(path).match(/^\/api\/admin\/bulk\/([^/?]+)/);
  if (bulk && clean(body.action).toLowerCase() === "delete") {
    const entity = clean(bulk[1]);
    const ids = [...new Set((body.ids || []).map(number).filter(Boolean))];
    const tableMap = {
      "website-products": ["products", "deleted_at = NOW(), status = 'Inactive'"],
      "warehouse-products": ["products", "deleted_at = NOW(), status = 'Inactive'"],
      "store-products": ["products", "deleted_at = NOW(), status = 'Inactive'"],
      brands: ["brands", "deleted_at = NOW(), status = 'Inactive'"],
      suppliers: ["suppliers", "status = 'Blocked'"],
      subscribers: ["newsletter_subscribers", "status = 'Unsubscribed', unsubscribed_at = NOW()"],
      blogs: ["blog_posts", "status = 'Draft'"],
    }[entity];
    if (!tableMap || !ids.length) throw new Error("Unsupported bulk delete request");
    await dbQuery(`UPDATE ${tableMap[0]} SET ${tableMap[1]} WHERE id IN (?)`, [ids]);
    return `Bulk ${entity} request applied to ${ids.length} record(s)`;
  }

  if (clean(path).startsWith("/api/admin/tags/bulk-delete")) {
    const ids = [...new Set((body.ids || []).map(number).filter(Boolean))];
    if (!ids.length) throw new Error("No tags selected");
    await dbQuery("UPDATE tags SET deleted_at = NOW(), status = 'Inactive' WHERE id IN (?)", [ids]);
    return `Bulk tag request applied to ${ids.length} tag(s)`;
  }

  return deleteOneByPath(path);
}

export async function getRemovalRequests(req, res) {
  if (!isSuperAdmin(req.admin)) return res.status(403).json({ message: "Super Admin access required" });
  try {
    await ensureRemovalRequestsSchema();
    const status = clean(req.query.status);
    const values = [];
    const where = [];
    if (status) {
      where.push("status = ?");
      values.push(status);
    }
    const rows = await dbQuery(
      `
        SELECT *
        FROM removal_requests
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY created_at DESC
        LIMIT 250
      `,
      values
    );
    res.json({ requests: rows.map((row) => ({ ...row, request_body: parseRequestBody(row.request_body) })) });
  } catch (error) {
    res.status(500).json({ message: error.message || "Unable to load removal requests" });
  }
}

export async function decideRemovalRequest(req, res) {
  if (!isSuperAdmin(req.admin)) return res.status(403).json({ message: "Super Admin access required" });
  const id = number(req.params.id);
  const decision = clean(req.body?.decision).toLowerCase();
  const remarks = clean(req.body?.remarks);
  if (!["approved", "rejected"].includes(decision)) {
    return res.status(400).json({ message: "Decision must be approved or rejected" });
  }

  try {
    await ensureRemovalRequestsSchema();
    const rows = await dbQuery("SELECT * FROM removal_requests WHERE id = ? LIMIT 1", [id]);
    const request = rows[0];
    if (!request) return res.status(404).json({ message: "Removal request not found" });
    if (request.status !== "Pending") return res.status(409).json({ message: "Removal request already reviewed" });

    let resultMessage = "Removal request rejected";
    if (decision === "approved") {
      resultMessage = await performBulkRemoval(request.request_path, parseRequestBody(request.request_body));
    }

    const nextStatus = decision === "approved" ? "Approved" : "Rejected";
    await dbQuery(
      `
        UPDATE removal_requests
        SET status = ?, reviewer_admin_id = ?, reviewer_name = ?, remarks = ?, reviewed_at = NOW()
        WHERE id = ?
      `,
      [nextStatus, req.admin?.id || null, req.admin?.name || null, remarks || null, id]
    );

    await notify({
      type: "removal_request_reviewed",
      title: `Removal request ${nextStatus.toLowerCase()}`,
      message: `${request.target_label || request.request_path}: ${nextStatus}${remarks ? ` - ${remarks}` : ""}`,
      link: "/removal-requests",
    });

    res.json({ message: resultMessage, status: nextStatus });
  } catch (error) {
    res.status(500).json({ message: error.message || "Unable to review removal request" });
  }
}
