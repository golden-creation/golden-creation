import db from "../config/db.js";
import ExcelJS from "exceljs";
import { auditFailureCount, writeAuditEvent } from "../middleware/admin-audit.middleware.js";
import {
  AUDIT_RETENTION_DAYS,
  csvCell,
  istDayRange,
  istTimestamp,
  isAuditSuperAdmin,
} from "../services/admin-audit.js";

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
}

export function requireAuditSuperAdmin(req, res, next) {
  if (!isAuditSuperAdmin(req.admin)) {
    res.status(403).json({ message: "Only a Super Admin can view audit records" });
    return;
  }
  next();
}

function filters(req) {
  const range = istDayRange(req.query.date);
  const clauses = ["created_at >= ?", "created_at <= ?"];
  const params = [range.start, range.end];
  const view = String(req.query.view || "daily");
  if (view === "live") {
    clauses[0] = "created_at >= ?";
    params[0] = new Date(Date.now() - 15 * 60 * 1000);
    params[1] = new Date();
  }
  if (view === "changes") clauses.push("changed_fields IS NOT NULL");
  if (view === "login") clauses.push("module_name = 'Authentication'");
  if (view === "security") clauses.push("(outcome IN ('failure','unauthorized') OR module_name = 'Security')");
  const equals = [
    ["user", "admin_id", Number],
    ["role", "actor_role", String],
    ["module", "module_name", String],
    ["action", "action_name", String],
    ["status", "outcome", String],
    ["page", "page_name", String],
  ];
  for (const [key, column, cast] of equals) {
    if (req.query[key]) {
      clauses.push(`${column} = ?`);
      params.push(cast === Number ? Number(req.query[key]) : String(req.query[key]).slice(0, 160));
    }
  }
  if (req.query.q) {
    clauses.push("(actor_name LIKE ? OR actor_email LIKE ? OR action_name LIKE ? OR request_path LIKE ? OR record_name LIKE ?)");
    const like = `%${String(req.query.q).slice(0, 80)}%`;
    params.push(like, like, like, like, like);
  }
  return { where: clauses.join(" AND "), params, range, view };
}

function present(row) {
  return {
    ...row,
    created_at_ist: istTimestamp(row.created_at),
    previous_value: parseJson(row.previous_value),
    updated_value: parseJson(row.updated_value),
    changed_fields: parseJson(row.changed_fields),
    detail: parseJson(row.detail),
    confirmed: row.layer === "confirmed",
  };
}

function parseJson(value) {
  if (!value || typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function listAuditEvents(req, res) {
  try {
    const { where, params, range, view } = filters(req);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const rows = await query(
      `SELECT * FROM admin_audit_events WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );
    const countRows = await query(`SELECT COUNT(*) AS total FROM admin_audit_events WHERE ${where}`, params);
    const sessions = view === "live"
      ? await query(
        `SELECT admin_id, actor_name, actor_email, actor_role, MAX(created_at) AS last_activity, MIN(created_at) AS first_seen
           FROM admin_audit_events
          WHERE created_at >= ?
          GROUP BY admin_id, actor_name, actor_email, actor_role
          ORDER BY last_activity DESC
          LIMIT 50`,
        [new Date(Date.now() - 30 * 60 * 1000)]
      )
      : [];
    res.json({
      events: rows.map(present),
      page,
      limit,
      total: Number(countRows[0]?.total || 0),
      date: range.day,
      retentionDays: AUDIT_RETENTION_DAYS,
      loggingFailures: auditFailureCount(),
      sessions: sessions.map((session) => ({ ...session, last_activity_ist: istTimestamp(session.last_activity) })),
    });
  } catch (error) {
    res.status(500).json({ message: "Audit records are unavailable" });
  }
}

export async function exportAuditEvents(req, res) {
  try {
    const { where, params, range } = filters(req);
    const rows = (await query(
      `SELECT created_at, actor_name, actor_email, actor_role, module_name, page_name, action_name, outcome,
              record_id, record_name, source, layer, ip_address
         FROM admin_audit_events WHERE ${where} ORDER BY id DESC LIMIT 5000`,
      params
    )).map(present);
    const columns = ["created_at_ist", "actor_name", "actor_email", "actor_role", "module_name", "page_name", "action_name", "outcome", "record_id", "record_name", "source", "layer", "ip_address"];
    if (String(req.query.format) === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Audit");
      sheet.addRow(columns);
      rows.forEach((row) => sheet.addRow(columns.map((column) => row[column] ?? "")));
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="audit-${range.day}.xlsx"`);
      await workbook.xlsx.write(res);
      res.end();
      return;
    }
    const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="audit-${range.day}.csv"`);
    res.send(csv);
  } catch {
    res.status(500).json({ message: "Audit export is unavailable" });
  }
}

export async function recordAuditObservations(req, res) {
  const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, 20) : [];
  try {
    for (const event of events) {
      const page = String(event.page || "").slice(0, 160);
      const action = String(event.action || "View").slice(0, 80);
      if (!page || !["View", "Click", "Search", "Filter"].includes(action)) continue;
      await writeAuditEvent({
        adminId: req.admin?.id,
        actorName: req.admin?.name,
        actorEmail: req.admin?.email,
        actorRole: req.admin?.role,
        sessionId: null,
        requestId: req.auditRequestId,
        source: "frontend",
        layer: "observed",
        module: "Admin",
        page,
        action,
        outcome: "observed",
        method: "POST",
        path: page,
        detail: { label: String(event.label || "").slice(0, 120), confirmed: false },
        ip: String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].slice(0, 64),
        userAgent: req.headers["user-agent"],
      });
    }
    res.json({ recorded: true, confirmed: false });
  } catch (error) {
    console.error(`AUDIT_LOG_FAILURE observation ${error.message || "failed"}`);
    res.status(202).json({ recorded: false, message: "Observation was not stored" });
  }
}

export function rejectAuditMutation(_req, res) {
  res.status(405).json({ message: "Audit records are append-only" });
}
