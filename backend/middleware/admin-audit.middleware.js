import db from "../config/db.js";
import {
  auditAction,
  auditCoverageBucket,
  auditIdempotencyKey,
  auditModule,
  auditOutcome,
  auditRecordTarget,
  bulkAuditSummary,
  changedAuditFields,
  classifyAdminRoute,
  enqueueAuditOutbox,
  flushAuditOutbox,
  instrumentAdminResponse,
  isCriticalAudit,
  loginActor,
  newRequestId,
  redactRecordName,
  sanitizeAuditValue,
  sessionKey,
  shouldSkipDuplicateRead,
  writeAuditEvent,
} from "../services/admin-audit.js";

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
}

let failureCount = 0;

export function auditFailureCount() {
  return failureCount;
}

async function readRecord(target) {
  if (!target.table || !target.id) return null;
  try {
    const rows = await query(
      `SELECT * FROM \`${target.table}\` WHERE id = ? LIMIT 1`,
      [Number(target.id)]
    );
    return rows[0] ? sanitizeAuditValue(rows[0], 0, { redactNames: redactRecordName(target.table) }) : null;
  } catch {
    return null;
  }
}

function bearer(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return (forwarded || req.ip || "").slice(0, 64);
}

function connectionAdapter(connection) {
  return {
    query: (sql, params = []) => new Promise((resolve, reject) => {
      connection.query(sql, params, (error, results) => (error ? reject(error) : resolve(results)));
    }),
    begin: () => new Promise((resolve, reject) => connection.beginTransaction((error) => (error ? reject(error) : resolve()))),
    commit: () => new Promise((resolve, reject) => connection.commit((error) => (error ? reject(error) : resolve()))),
    rollback: () => new Promise((resolve) => connection.rollback(() => resolve())),
  };
}

function withAuditConnection(fn) {
  return new Promise((resolve, reject) => {
    db.getConnection((error, connection) => {
      if (error) {
        reject(error);
        return;
      }
      fn(connectionAdapter(connection)).then(resolve, reject).finally(() => connection.release());
    });
  });
}

async function alertAuditFailure(requestId, error) {
  failureCount += 1;
  console.error(`AUDIT_LOG_FAILURE ${requestId} ${error?.message || "audit write failed"}`);
}

function buildEvent(req, res, before, after) {
  const path = req.path || "";
  const method = req.method.toUpperCase();
  const status = res.statusCode || 200;
  const message = res.locals.auditMessage || "";
  const actor = req.admin?.id ? req.admin : loginActor(res.locals.auditBody);
  const target = auditRecordTarget(path);
  const fieldOptions = { redactNames: redactRecordName(target.table) };
  const changedFields = changedAuditFields(before, after, fieldOptions);
  const bulk = bulkAuditSummary(req.body);
  const recordName = fieldOptions.redactNames ? "" : (after?.[target.nameColumn] || before?.[target.nameColumn] || "");
  return {
    adminId: actor?.id,
    actorName: actor?.name,
    actorEmail: actor?.email,
    actorRole: actor?.role,
    sessionId: sessionKey(bearer(req)),
    requestId: req.auditRequestId,
    idempotencyKey: auditIdempotencyKey({
      requestId: req.auditRequestId,
      method,
      path,
      action: status === 401 && /expired/i.test(message) ? "Session expiry" : auditAction(method, path, status, message),
      recordId: target.id,
    }),
    source: "backend",
    layer: "confirmed",
    module: auditModule(path),
    page: path,
    action: status === 401 && /expired/i.test(message) ? "Session expiry" : auditAction(method, path, status, message),
    outcome: path.startsWith("/login") && status >= 400 ? "failure" : auditOutcome(status, path, message),
    method,
    path,
    recordId: target.id,
    recordName,
    previousValue: before,
    updatedValue: after,
    changedFields,
    detail: {
      status,
      response: { message: String(message || "").slice(0, 180) },
      persistence: classifyAdminRoute(method, path).persistence,
      coverage: auditCoverageBucket(method, path),
      bulk,
      confirmed: Boolean(req.admin?.id || loginActor(res.locals.auditBody)?.id),
    },
    ip: clientIp(req),
    userAgent: req.headers["user-agent"],
  };
}

export function attachAdminAudit(req, res, next) {
  if (req.path.startsWith("/audit/observations")) {
    next();
    return;
  }
  const requestId = newRequestId();
  req.auditRequestId = requestId;
  res.setHeader("x-request-id", requestId);
  const method = req.method.toUpperCase();
  const target = auditRecordTarget(req.path);
  const captureBefore = ["PUT", "PATCH", "DELETE"].includes(method) ? readRecord(target) : Promise.resolve(null);
  const sensitiveReport = req.path.startsWith("/audit/events") || req.path.startsWith("/audit/export");
  instrumentAdminResponse(req, res, async (snapshot) => {
    res.locals.auditMessage = snapshot.message || "";
    res.locals.auditBody = snapshot.kind === "json" ? { message: snapshot.message, id: snapshot.id } : null;
    if (method === "GET" && !sensitiveReport && shouldSkipDuplicateRead(`${sessionKey(bearer(req))}|${req.path}|${JSON.stringify(req.query || {})}`)) {
      return { "x-audit-persisted": "skipped" };
    }
    if (req.auditPersisted) return { "x-audit-persisted": "yes" };
    const before = await captureBefore;
    const after = ["PUT", "PATCH", "POST"].includes(method) ? await readRecord(target) : null;
    const event = buildEvent(req, res, before, after);
    if (sensitiveReport) event.action = req.path.startsWith("/audit/export") ? "Export audit report" : "View audit report";
    try {
      if (isCriticalAudit(method, req.path)) {
        await withAuditConnection((database) => writeAuditEvent(event, database));
        return { "x-audit-persisted": "yes" };
      }
      await withAuditConnection(async (database) => {
        await enqueueAuditOutbox(event, database);
        await flushAuditOutbox(database);
      });
      return { "x-audit-persisted": "yes", "x-audit-durable": "yes" };
    } catch (error) {
      await alertAuditFailure(requestId, error);
      return { "x-audit-persisted": "no", "x-audit-durable": "no" };
    }
  });
  next();
}
