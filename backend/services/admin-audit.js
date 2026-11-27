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
  [/^\/inventory\/products\/(\d+)/, "products", "name"],
  [/^\/seo\/products\/(\d+)/, "products", "name"],
  [/^\/seo\/blogs\/(\d+)/, "blog_posts", "title"],
  [/^\/products\/(\d+)/, "products", "name"],
  [/^\/categories\/(\d+)/, "categories", "name"],
  [/^\/brands\/(\d+)/, "brands", "name"],
  [/^\/tags\/(\d+)/, "tags", "name"],
  [/^\/orders\/(\d+)/, "orders", "order_number"],
  [/^\/customers\/(\d+)/, "users", "id"],
  [/^\/discounts\/(\d+)/, "discounts", "code"],
  [/^\/blog\/(\d+)/, "blog_posts", "title"],
  [/^\/staff\/(\d+)/, "admins", "name"],
  [/^\/roles\/(\d+)/, "roles", "name"],
  [/^\/bundles\/(\d+)/, "bundles", "name"],
  [/^\/collections\/(\d+)/, "collections", "name"],
  [/^\/menus\/(\d+)/, "menus", "name"],
  [/^\/suppliers\/(\d+)/, "suppliers", "name"],
  [/^\/shipping\/rules\/(\d+)/, "shipping_rules", "name"],
  [/^\/returns\/(\d+)/, "return_requests", "id"],
];
const REDACT_NAME_TABLES = new Set(["users", "orders", "return_requests"]);

export function isAuditSuperAdmin(admin) {
  return String(admin?.role || "").trim().toLowerCase() === "super admin";
}

export const ALLOWED_CHANGE_FIELDS = new Set([
  "price", "selling_price", "mrp", "compare_price", "compare_at_price", "cost_price", "discount", "discount_type", "discount_value",
  "stock", "quantity", "shop_stock", "warehouse_stock", "stock_quantity", "stock_on_hand", "reorder_level",
  "status", "order_status", "payment_status", "fulfillment_status", "shipping_status", "visibility", "published", "active", "is_active", "featured",
  "role", "permissions", "sku", "barcode", "hsn", "eligible", "percentage", "code", "title", "slug", "category", "category_id", "brand_id",
  "sort_order", "position", "priority", "enabled", "weight", "tax_rate", "gst_rate", "charge", "delivery_days", "min_order_value", "region",
  "stock_hold_minutes", "full_online_enabled", "partial_cod_enabled", "full_cod_enabled", "default_partial_percent",
  "cod_min_amount", "cod_max_amount", "cod_max_distance_km", "partial_cod_above", "porter_enabled", "porter_collects_cod", "porter_max_distance_km", "porter_requires_full_payment", "porter_customer_pays_delivery", "cod_pin_restricted",
]);
const PII_KEY = /email|phone|mobile|address|street|city|state|zip|postal|customer|password|otp|token|secret|authorization|cookie|cvv|card|pan|razorpay|api[_-]?key|session|name/i;

export const AUDIT_COVERAGE_GAPS = [
  "Field-level rows store only allowlisted business fields. Customer names, contact details, credentials, remarks, and file bytes are omitted.",
  "Bulk imports and multi-row saves store affected ids, a count, and up to 20 allowlisted row summaries. They are not a full before/after of every cell.",
  "Uploads, drive files, and media migration store the action and outcome only. Raw files and per-item async work are unsupported.",
  "Payment settings and staff permission updates commit with the audit row. Other critical updates are written before the response on a separate connection.",
  "The x-audit-persisted header is the persistence result. An HTTP success status is not that result.",
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

export function redactRecordName(table = "") {
  return REDACT_NAME_TABLES.has(table);
}

export function sanitizeAuditValue(value, depth = 0, options = {}) {
  if (depth > 2) return "[truncated]";
  if (value == null || ["number", "boolean"].includes(typeof value)) return value;
  if (typeof value === "string") return value.length > 80 ? "[text omitted]" : value;
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => sanitizeAuditValue(item, depth + 1, options));
  if (typeof value !== "object" || (typeof Buffer !== "undefined" && Buffer.isBuffer(value))) return "[omitted]";
  const clean = {};
  const hideName = Boolean(options.redactNames);
  for (const [key, item] of Object.entries(value)) {
    if (/remark|note|comment|content|description|excerpt|file|buffer/i.test(key)) continue;
    if (PII_KEY.test(key) && key !== "name") {
      clean[key] = "[redacted]";
      continue;
    }
    if (key === "name" && (hideName || /@/.test(String(item || "")))) {
      clean[key] = "[redacted]";
      continue;
    }
    if (!ALLOWED_CHANGE_FIELDS.has(key) && key !== "name") continue;
    clean[key] = sanitizeAuditValue(item, depth + 1, options);
  }
  const encoded = JSON.stringify(clean);
  if (encoded.length > 1500) return { truncated: true };
  return clean;
}

export function bulkAuditSummary(body) {
  const sources = [body?.ids, body?.products, body?.rows, body?.items, body?.changes].filter(Array.isArray);
  const ids = [];
  const changes = [];
  for (const source of sources) {
    for (const item of source) {
      if (ids.length >= 50 && changes.length >= 20) break;
      if (item && typeof item === "object") {
        const id = item.id || item.product_id || item.productId || item.sku;
        if (id != null && ids.length < 50) ids.push(String(id).slice(0, 40));
        if (changes.length < 20) {
          const safe = sanitizeAuditValue(item);
          if (safe && typeof safe === "object" && Object.keys(safe).length) changes.push(safe);
        }
      } else if (item != null && ids.length < 50 && String(item).length <= 40) {
        ids.push(String(item));
      }
    }
  }
  if (!ids.length && !changes.length) return null;
  return { count: Math.max(ids.length, changes.length), ids, changes };
}

export function changedAuditFields(before, after, options = {}) {
  const previous = before && typeof before === "object" ? before : {};
  const next = after && typeof after === "object" ? after : {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const changes = [];
  for (const key of keys) {
    if (["updated_at", "created_at"].includes(key)) continue;
    if (/remark|note|comment|content|description|excerpt|file|buffer/i.test(key)) continue;
    if ((PII_KEY.test(key) && key !== "name") || (!ALLOWED_CHANGE_FIELDS.has(key) && key !== "name")) continue;
    if (key === "name" && options.redactNames) continue;
    if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) {
      changes.push({
        field: key,
        before: sanitizeAuditValue(previous[key], 0, options),
        after: sanitizeAuditValue(next[key], 0, options),
      });
    }
  }
  return changes.slice(0, 40);
}

export function auditModule(path = "") {
  const found = MODULE_RULES.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  return found?.[1] || "Admin";
}

export function auditRecordTarget(path = "") {
  if (path === "/payment-settings") return { id: "1", table: "payment_settings", nameColumn: "id" };
  for (const [pattern, table, nameColumn] of RECORD_TABLES) {
    const match = String(path).match(pattern);
    if (match && /^[a-z_]+$/i.test(table) && /^[a-z_]+$/i.test(nameColumn)) {
      return { id: match[1], table, nameColumn };
    }
  }
  const fallback = String(path).match(/\/(\d+)(?:\/|$)/);
  return fallback ? { id: fallback[1], table: "", nameColumn: "" } : { id: "", table: "", nameColumn: "" };
}

export function auditCoverageBucket(method, path) {
  const item = classifyAdminRoute(method, path);
  if (!item.mutation) return "read";
  if (item.diff === "single-row-allowlist") return "field-level";
  if (item.diff === "multi-record") return "bulk-summary";
  if (item.diff === "file-or-job") return "unsupported";
  return "outcome-only";
}

export function auditCoverageMatrix(routes) {
  const modules = new Map();
  for (const route of routes) {
    const bucket = auditCoverageBucket(route.method, route.path);
    if (bucket === "read") continue;
    const name = route.module || auditModule(route.path);
    const row = modules.get(name) || { module: name, fieldLevel: 0, bulkSummary: 0, outcomeOnly: 0, unsupported: 0 };
    if (bucket === "field-level") row.fieldLevel += 1;
    else if (bucket === "bulk-summary") row.bulkSummary += 1;
    else if (bucket === "unsupported") row.unsupported += 1;
    else row.outcomeOnly += 1;
    modules.set(name, row);
  }
  return [...modules.values()];
}

export function auditIdempotencyKey(event = {}) {
  return createHash("sha256")
    .update([event.requestId || "", event.method || "", event.path || "", event.action || "", event.recordId || ""].join("\n"))
    .digest("hex");
}

export function responseAuditSnapshot(method, args = []) {
  if (method === "json" && args[0] && typeof args[0] === "object" && !Buffer.isBuffer(args[0])) {
    return { kind: "json", message: String(args[0].message || "").slice(0, 180), id: args[0].id ?? null };
  }
  if (method === "redirect") {
    const location = String(args[args.length - 1] || "");
    return { kind: "redirect", message: "redirect", location: location.replace(/(token|code|otp|password)=[^&]*/gi, "$1=[redacted]").slice(0, 180) };
  }
  if (method === "download" || method === "sendFile" || method === "end" || method === "send") {
    return { kind: "body", message: "" };
  }
  return { kind: method || "response", message: "" };
}

export function instrumentAdminResponse(req, res, persist) {
  let armed = false;
  let done = false;
  for (const name of ["json", "send", "end", "redirect", "sendFile", "download"]) {
    if (typeof res[name] !== "function") continue;
    const original = res[name].bind(res);
    res[name] = (...args) => {
      if (armed || done) return original(...args);
      armed = true;
      const snapshot = responseAuditSnapshot(name, args);
      persist(snapshot).then((headers) => {
        done = true;
        if (!res.headersSent && headers) {
          for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
        }
        return original(...args);
      }).catch(() => {
        done = true;
        if (!res.headersSent) res.setHeader("x-audit-persisted", "no");
        return original(...args);
      });
      return res;
    };
  }
  return { recorded: () => done || armed };
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
         previous_value, updated_value, changed_fields, detail, ip_address, user_agent, previous_hash, row_hash, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        event.idempotencyKey || null,
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
  const idempotencyKey = event.idempotencyKey || auditIdempotencyKey(event);
  const payload = { ...event, idempotencyKey };
  await db.query(
    `INSERT INTO admin_audit_outbox (payload, status, attempts, idempotency_key, next_attempt_at)
     VALUES (?, 'pending', 0, ?, NOW())
     ON DUPLICATE KEY UPDATE id = id`,
    [JSON.stringify(payload), idempotencyKey]
  );
  return { durable: true, persisted: false, idempotencyKey };
}

async function markOutboxRetry(db, row, error, maxAttempts) {
  const attempts = Number(row.attempts || 0) + 1;
  const message = String(error?.message || "audit outbox failed").slice(0, 255);
  if (attempts >= maxAttempts) {
    await db.query(
      "UPDATE admin_audit_outbox SET status = 'exhausted', attempts = ?, last_error = ? WHERE id = ?",
      [attempts, message, row.id]
    );
    console.error(`AUDIT_LOG_FAILURE outbox ${row.id} exhausted after ${attempts} attempts`);
    return "exhausted";
  }
  const delay = Math.min(300, 2 ** attempts);
  await db.query(
    "UPDATE admin_audit_outbox SET status = 'pending', attempts = ?, last_error = ?, next_attempt_at = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id = ?",
    [attempts, message, delay, row.id]
  );
  return "retry";
}

export async function processAuditOutbox(db, options = {}) {
  const limit = options.limit || 20;
  const maxAttempts = options.maxAttempts || 5;
  const due = await db.query(
    `SELECT id FROM admin_audit_outbox
      WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
      ORDER BY id LIMIT ?`,
    [limit]
  );
  let stored = 0;
  let retried = 0;
  let exhausted = 0;
  for (const item of due) {
    if (!db.joined) await db.begin();
    try {
      const rows = await db.query(
        "SELECT id, payload, attempts FROM admin_audit_outbox WHERE id = ? AND status = 'pending' FOR UPDATE",
        [item.id]
      );
      if (!rows[0]) {
        if (!db.joined) await db.commit();
        continue;
      }
      let payload;
      try {
        payload = typeof rows[0].payload === "string" ? JSON.parse(rows[0].payload) : rows[0].payload;
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          throw new Error("Audit outbox payload is not an event");
        }
      } catch (error) {
        const state = await markOutboxRetry(db, rows[0], error, maxAttempts);
        if (state === "exhausted") exhausted += 1;
        else retried += 1;
        if (!db.joined) await db.commit();
        continue;
      }
      try {
        await writeAuditEvent(payload, joinedAuditDb(db.query));
        await db.query(
          "UPDATE admin_audit_outbox SET status = 'stored', attempts = attempts + 1, last_error = NULL WHERE id = ?",
          [rows[0].id]
        );
        stored += 1;
      } catch (error) {
        if (error.code === "ER_DUP_ENTRY" || error.errno === 1062) {
          await db.query(
            "UPDATE admin_audit_outbox SET status = 'stored', last_error = NULL WHERE id = ?",
            [rows[0].id]
          );
          stored += 1;
        } else {
          const state = await markOutboxRetry(db, rows[0], error, maxAttempts);
          if (state === "exhausted") exhausted += 1;
          else retried += 1;
        }
      }
      if (!db.joined) await db.commit();
    } catch (error) {
      if (!db.joined) await db.rollback();
      throw error;
    }
  }
  return { stored, retried, exhausted };
}

export async function flushAuditOutbox(db, limit = 20) {
  const result = await processAuditOutbox(db, { limit });
  return result.stored;
}

export function csvCell(value) {
  const text = value == null ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
