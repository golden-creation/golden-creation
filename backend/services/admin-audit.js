import { createHash, randomUUID } from "node:crypto";

export const AUDIT_RETENTION_DAYS = 365;
export const AUDIT_GENESIS = "0".repeat(64);
const SECRET_KEY = /password|otp|token|secret|authorization|cookie|cvv|card|pan|razorpay|api[_-]?key|session/i;
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

export function sanitizeAuditValue(value, depth = 0) {
  if (value == null || ["number", "boolean"].includes(typeof value)) return value;
  if (typeof value === "string") {
    if (value.length > 500) return `[text ${value.length} characters]`;
    return value;
  }
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizeAuditValue(item, depth + 1));
  if (typeof value === "object") {
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return "[file omitted]";
    const clean = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === "file" || key === "buffer" || key === "data") {
        clean[key] = "[file omitted]";
        continue;
      }
      clean[key] = SECRET_KEY.test(key) ? "[redacted]" : sanitizeAuditValue(item, depth + 1);
    }
    return clean;
  }
  return null;
}

export function changedAuditFields(before, after) {
  const previous = before && typeof before === "object" ? before : {};
  const next = after && typeof after === "object" ? after : {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const changes = [];
  for (const key of keys) {
    if (["updated_at", "created_at"].includes(key)) continue;
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

export function auditRowHash(previousHash, payload) {
  return createHash("sha256")
    .update(`${previousHash || AUDIT_GENESIS}\n${JSON.stringify(payload)}`)
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

export function csvCell(value) {
  const text = value == null ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
