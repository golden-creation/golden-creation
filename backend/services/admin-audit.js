import { createHash, randomUUID } from "node:crypto";

export const AUDIT_RETENTION_DAYS = 365;
export const AUDIT_GENESIS = "0".repeat(64);
const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const MODULE_RULES = [
  ["/login", "Authentication"],
  ["/password-reset", "Authentication"],
  ["/logout", "Authentication"],
  ["/security", "Security"],
  ["/audit", "Audit"],
  ["/products", "Products"],
  ["/categories", "Categories"],
  ["/brands", "Brands"],
  ["/tags", "Tags"],
  ["/collections", "Collections"],
  ["/menus", "Menus"],
  ["/bundles", "Bundles"],
  ["/orders", "Orders"],
  ["/payments", "Payments"],
  ["/payment-settings", "Payments"],
  ["/discounts", "Coupons"],
  ["/customers", "Customers"],
  ["/inventory", "Stock"],
  ["/warehouse", "Stock"],
  ["/godowns", "Stock"],
  ["/catalogs", "Stock"],
  ["/store-settings", "Store"],
  ["/shipping", "Shipping"],
  ["/blog", "Website content"],
  ["/seo", "Website content"],
  ["/media", "Media"],
  ["/drive", "Media"],
  ["/staff", "Permissions"],
  ["/roles", "Permissions"],
  ["/profile", "Settings"],
  ["/reports", "Reports"],
  ["/exports", "Reports"],
  ["/newsletter", "Customers"],
  ["/returns", "Orders"],
  ["/billing", "Billing"],
  ["/suppliers", "Suppliers"],
  ["/leads", "Sales"],
  ["/sales", "Sales"],
  ["/referrals", "Referrals"],
  ["/affiliate", "Referrals"],
  ["/wallet", "Referrals"],
  ["/tasks", "Tasks"],
  ["/hr", "HR"],
  ["/contact-enquiries", "Enquiries"],
  ["/corporate-enquiries", "Enquiries"],
  ["/removal-requests", "Security"],
];

const RECORD_TABLES = [
  [/^\/products\/(\d+)/, "products", "name"],
  [/^\/categories\/(\d+)/, "categories", "name"],
  [/^\/brands\/(\d+)/, "brands", "name"],
  [/^\/orders\/(\d+)/, "orders", "order_number"],
  [/^\/customers\/(\d+)/, "customers", "name"],
  [/^\/discounts\/(\d+)/, "discounts", "code"],
  [/^\/blog\/(\d+)/, "blog_posts", "title"],
  [/^\/staff\/(\d+)/, "admins", "name"],
  [/^\/bundles\/(\d+)/, "bundles", "name"],
  [/^\/collections\/(\d+)/, "collections", "name"],
  [/^\/menus\/(\d+)/, "menus", "name"],
  [/^\/suppliers\/(\d+)/, "suppliers", "name"],
];

export function isAuditSuperAdmin(admin) {
  return String(admin?.role || "").trim().toLowerCase() === "super admin";
}

const ALLOWED_CHANGE_FIELDS = new Set([
  "price", "selling_price", "mrp", "compare_price", "stock", "quantity", "shop_stock", "warehouse_stock",
  "status", "order_status", "payment_status", "role", "permissions", "sku", "eligible", "percentage",
  "full_online_enabled", "partial_cod_enabled", "full_cod_enabled", "default_partial_percent",
  "cod_min_amount", "cod_max_amount", "porter_enabled", "porter_collects_cod", "cod_pin_restricted",
]);
const PII_KEY = /email|phone|mobile|address|street|city|state|zip|postal|customer|password|otp|token|secret|authorization|cookie|cvv|card|pan|razorpay|api[_-]?key|session|name/i;

export const AUDIT_COVERAGE_GAPS = [
  "Before and after values are limited to one row in an allowlisted table. Bulk imports, spreadsheet applies, and multi-row catalog saves are counted, not field-diffed.",
  "File uploads and drive objects store only a file marker. File bytes are never stored.",
  "Media migration and other background jobs are logged when their admin route returns, not once per asynchronous item.",
  "The payment-settings update and the staff permission update commit in the same database transaction as their audit row. Stock changes and order-status changes are recorded before the HTTP response, on a separate connection, because those flows also call stock history, cancellation, and commission services.",
  "HTTP success is not proof the hash-chain row exists. The x-audit-persisted response header is the persistence result.",
  "Read requests are queued after the response and can be lost if the process stops first.",
];

export function isCriticalAudit(method, path = "") {
  if (!MUTATIONS.has(String(method || "").toUpperCase())) return false;
  const concrete = String(path).replace(/:[A-Za-z0-9_]+/g, "1");
  return [
    /^\/payment-settings(?:\/|$)/,
    /^\/inventory\/products\/\d+\/stock$/,
    /^\/orders\/\d+\/status$/,
    /^\/orders\/\d+\/cod-collected$/,
    /^\/staff(?:\/\d+)?$/,
    /^\/roles(?:\/\d+)?$/,
    /^\/catalogs\/(?:warehouse|store)\/products(?:\/|$)/,
    /^\/products\/\d+$/,
  ].some((pattern) => pattern.test(concrete));
}

export function classifyAdminRoute(method, path = "") {
  const verb = String(method || "GET").toUpperCase();
  const mutation = MUTATIONS.has(verb);
  const concrete = String(path).replace(/:[A-Za-z0-9_]+/g, "1");
  const singleRow = Boolean(auditRecordTarget(concrete).table);
  let diff = "none";
  if (mutation && /import|bulk|catalogs\/.+\/products$/.test(concrete)) diff = "multi-record";
  else if (mutation && /upload|drive\/files|migration/.test(concrete)) diff = "file-or-job";
  else if (mutation && singleRow) diff = "single-row-allowlist";
  else if (mutation) diff = "outcome-only";
  return {
    method: verb,
    path,
    module: auditModule(path),
    mutation,
    diff,
    persistence: !mutation ? "read-after-response" : isCriticalAudit(verb, path) ? "critical-before-response" : "outbox-before-response",
  };
}

export function sanitizeAuditValue(value, depth = 0) {
  if (depth > 2) return "[truncated]";
  if (value == null || ["number", "boolean"].includes(typeof value)) return value;
  if (typeof value === "string") return value.length > 80 ? "[text omitted]" : value;
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => sanitizeAuditValue(item, depth + 1));
  if (typeof value !== "object" || (typeof Buffer !== "undefined" && Buffer.isBuffer(value))) return "[omitted]";
  const clean = {};
  for (const [key, item] of Object.entries(value)) {
    if (PII_KEY.test(key) && key !== "name") {
      clean[key] = "[redacted]";
      continue;
    }
    if (!ALLOWED_CHANGE_FIELDS.has(key) && key !== "name") continue;
    if (key === "name" && /@/.test(String(item || ""))) {
      clean[key] = "[redacted]";
      continue;
    }
    clean[key] = sanitizeAuditValue(item, depth + 1);
  }
  const encoded = JSON.stringify(clean);
  if (encoded.length > 1500) return { truncated: true };
  return clean;
}

export function changedAuditFields(before, after) {
  const previous = before && typeof before === "object" ? before : {};
  const next = after && typeof after === "object" ? after : {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const changes = [];
  for (const key of keys) {
    if (["updated_at", "created_at"].includes(key)) continue;
    if ((PII_KEY.test(key) && key !== "name") || (!ALLOWED_CHANGE_FIELDS.has(key) && key !== "name")) continue;
    if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) {
      changes.push({
        field: key,
        before: sanitizeAuditValue(previous[key]),
        after: sanitizeAuditValue(next[key]),
      });
    }
  }
  return changes;
}

export function auditModule(path = "") {
  const found = MODULE_RULES.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  return found?.[1] || "Admin";
}

export function auditRecordTarget(path = "") {
  for (const [pattern, table, nameColumn] of RECORD_TABLES) {
    const match = String(path).match(pattern);
    if (match && /^[a-z_]+$/i.test(table) && /^[a-z_]+$/i.test(nameColumn)) {
      return { id: match[1], table, nameColumn };
    }
  }
  const fallback = String(path).match(/\/(\d+)(?:\/|$)/);
  return fallback ? { id: fallback[1], table: "", nameColumn: "" } : { id: "", table: "", nameColumn: "" };
}

export function auditAction(method, path, status, message = "") {
  if (status === 401 && /expired/i.test(message)) return "Session expiry";
  if (path.startsWith("/login/verify-otp")) return status >= 400 ? "Failed login" : "OTP verification";
  if (path === "/login") return status >= 400 ? "Failed login" : "Login";
  if (path === "/logout") return "Logout";
  if (method === "GET") return "View";
  if (method === "DELETE") return "Delete";
  if (method === "PUT" || method === "PATCH") return "Update";
  if (/import/i.test(path)) return "Import";
  if (/export/i.test(path)) return "Export";
  if (/upload/i.test(path)) return "Upload";
  return "Create";
}

export function auditOutcome(status, path, message = "") {
  if (status === 401 && /expired/i.test(message)) return "failure";
  if (status === 401 || status === 403) return "unauthorized";
  if (status >= 400) return "failure";
  if (path.startsWith("/login") && status >= 400) return "failure";
  return "success";
}

export function sessionKey(token) {
  if (!token) return "";
  return createHash("sha256").update(String(token)).digest("hex").slice(0, 32);
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((sorted, key) => {
      sorted[key] = stableJson(value[key]);
      return sorted;
    }, {});
  }
  return value;
}

export function auditRowHash(previousHash, payload) {
  return createHash("sha256")
    .update(`${previousHash || AUDIT_GENESIS}\n${JSON.stringify(stableJson(payload))}`)
    .digest("hex");
}

export function verifyAuditChain(rows) {
  let previous = AUDIT_GENESIS;
  for (const row of rows) {
    const expected = auditRowHash(previous, row.payload);
    if (row.previous_hash !== previous || row.row_hash !== expected) return false;
    previous = row.row_hash;
  }
  return true;
}

export function listAdminRoutes(source) {
  const routes = [];
  const pattern = /router\.(get|post|put|patch|delete)\(\s*(?:[\s\S]{0,180}?)["'`]([^"'`]+)["'`]/g;
  let match = pattern.exec(source);
  while (match) {
    const method = match[1].toUpperCase();
    const path = match[2];
    routes.push({
      method,
      path,
      module: auditModule(path),
      mutation: MUTATIONS.has(method),
      automatic: true,
    });
    match = pattern.exec(source);
  }
  return routes;
}

export function istTimestamp(value = new Date()) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function istDayRange(dateText) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(dateText || ""))
    ? dateText
    : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return {
    day,
    start: new Date(`${day}T00:00:00+05:30`),
    end: new Date(`${day}T23:59:59.999+05:30`),
  };
}

export function newRequestId() {
  return randomUUID();
}

const recentReads = new Map();

export function shouldSkipDuplicateRead(key, now = Date.now()) {
  const previous = recentReads.get(key);
  recentReads.set(key, now);
  if (recentReads.size > 1000) {
    for (const [entry, seen] of recentReads) {
      if (now - seen > 10000) recentReads.delete(entry);
    }
  }
  return previous && now - previous < 3000;
}

export function auditRetentionDays(value = process.env.AUDIT_RETENTION_DAYS) {
  const parsed = Number(value ?? 365);
  if (!Number.isFinite(parsed) || parsed < 30) return 365;
  return Math.min(3650, Math.floor(parsed));
}

export function loginActor(body) {
  const admin = body?.admin;
  if (!admin || typeof admin !== "object") return null;
  return {
    id: Number(admin.id) || null,
    name: String(admin.name || "").slice(0, 160),
    email: String(admin.email || "").slice(0, 190),
    role: String(admin.role || "").slice(0, 80),
  };
}

export function joinedAuditDb(query) {
  return {
    joined: true,
    query,
    begin: async () => {},
    commit: async () => {},
    rollback: async () => {},
  };
}

export async function writeAuditEvent(event, db, attempt = 0) {
  const payload = {
    adminId: event.adminId || null,
    action: event.action,
    path: event.path || "",
    outcome: event.outcome,
    source: event.source,
    recordId: event.recordId || "",
    changed: event.changedFields || [],
  };
  if (!db.joined) await db.begin();
  try {
    const locked = await db.query("SELECT latest_hash FROM admin_audit_chain WHERE id = 1 FOR UPDATE");
    if (!locked[0]) {
      const missing = new Error("Audit chain row is missing");
      missing.code = "AUDIT_CHAIN_MISSING";
      throw missing;
    }
    const previousHash = locked[0].latest_hash;
    const rowHash = auditRowHash(previousHash, payload);
    await db.query(
      `INSERT INTO admin_audit_events
        (admin_id, actor_name, actor_email, actor_role, session_id, request_id, source, layer,
         module_name, page_name, action_name, outcome, http_method, request_path, record_id, record_name,
         previous_value, updated_value, changed_fields, detail, ip_address, user_agent, previous_hash, row_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.adminId || null,
        event.actorName || null,
        event.actorEmail || null,
        event.actorRole || null,
        event.sessionId || null,
        event.requestId || null,
        event.source,
        event.layer,
        event.module,
        event.page || null,
        event.action,
        event.outcome,
        event.method || null,
        String(event.path || "").slice(0, 255),
        event.recordId || null,
        event.recordName || null,
        event.previousValue ? JSON.stringify(event.previousValue) : null,
        event.updatedValue ? JSON.stringify(event.updatedValue) : null,
        event.changedFields?.length ? JSON.stringify(event.changedFields) : null,
        event.detail ? JSON.stringify(event.detail) : null,
        event.ip || null,
        String(event.userAgent || "").slice(0, 255) || null,
        previousHash,
        rowHash,
      ]
    );
    await db.query("UPDATE admin_audit_chain SET latest_hash = ? WHERE id = 1", [rowHash]);
    if (!db.joined) await db.commit();
    return { persisted: true, rowHash, previousHash };
  } catch (error) {
    if (!db.joined) await db.rollback();
    const retryable = error.code === "ER_LOCK_DEADLOCK" || error.errno === 1213 || error.code === "AUDIT_CHAIN_MISSING";
    if (!db.joined && retryable && attempt < 1) {
      if (error.code === "AUDIT_CHAIN_MISSING") {
        await db.query(
          "INSERT IGNORE INTO admin_audit_chain (id, latest_hash) VALUES (1, ?)",
          [AUDIT_GENESIS]
        );
      }
      return writeAuditEvent(event, db, attempt + 1);
    }
    throw error;
  }
}

export async function enqueueAuditOutbox(event, db) {
  await db.query(
    "INSERT INTO admin_audit_outbox (payload, status, attempts) VALUES (?, 'pending', 0)",
    [JSON.stringify(event)]
  );
  return { durable: true, persisted: false };
}

export async function flushAuditOutbox(db, limit = 20) {
  if (!db.joined) await db.begin();
  try {
    const rows = await db.query(
      "SELECT id, payload FROM admin_audit_outbox WHERE status = 'pending' ORDER BY id LIMIT ? FOR UPDATE",
      [limit]
    );
    for (const row of rows) {
      const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
      await writeAuditEvent(payload, joinedAuditDb(db.query));
      await db.query(
        "UPDATE admin_audit_outbox SET status = 'stored', attempts = attempts + 1, last_error = NULL WHERE id = ?",
        [row.id]
      );
    }
    if (!db.joined) await db.commit();
    return rows.length;
  } catch (error) {
    if (!db.joined) await db.rollback();
    throw error;
  }
}

export function csvCell(value) {
  const text = value == null ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
