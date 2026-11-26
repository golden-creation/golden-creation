import db from "../config/db.js";
import {
  auditAction,
  auditModule,
  auditOutcome,
  auditRecordTarget,
  changedAuditFields,
  classifyAdminRoute,
  enqueueAuditOutbox,
  flushAuditOutbox,
  isCriticalAudit,
  loginActor,
  newRequestId,
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
    return rows[0] ? sanitizeAuditValue(rows[0]) : null;
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
  const changedFields = changedAuditFields(before, after);
  return {
    adminId: actor?.id,
    actorName: actor?.name,
    actorEmail: actor?.email,
    actorRole: actor?.role,
    sessionId: sessionKey(bearer(req)),
    requestId: req.auditRequestId,
    source: "backend",
    layer: "confirmed",
    module: auditModule(path),
    page: path,
    action: status === 401 && /expired/i.test(message) ? "Session expiry" : auditAction(method, path, status, message),
    outcome: path.startsWith("/login") && status >= 400 ? "failure" : auditOutcome(status, path, message),
    method,
    path,
    recordId: target.id,
    recordName: after?.[target.nameColumn] || before?.[target.nameColumn] || "",
    previousValue: before,
    updatedValue: after,
    changedFields,
    detail: {
      status,
      response: res.locals.auditResponse || null,
      persistence: classifyAdminRoute(method, path).persistence,
      diff: classifyAdminRoute(method, path).diff,
      confirmed: false,
    },
    ip: clientIp(req),
    userAgent: req.headers["user-agent"],
  };
}

export function attachAdminAudit(req, res, next) {
  if (req.path.startsWith("/audit/events") || req.path.startsWith("/audit/observations") || req.path.startsWith("/audit/export")) {
    next();
    return;
  }
  const requestId = newRequestId();
  req.auditRequestId = requestId;
  res.setHeader("x-request-id", requestId);
  const method = req.method.toUpperCase();
  const target = auditRecordTarget(req.path);
  const captureBefore = ["PUT", "PATCH", "DELETE"].includes(method) ? readRecord(target) : Promise.resolve(null);
  let persisted = false;
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    res.locals.auditBody = body;
    res.locals.auditMessage = String(body?.message || "");
    res.locals.auditResponse = sanitizeAuditValue(
      body && typeof body === "object" ? { message: body.message, id: body.id } : {}
    );
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return originalJson(body);
    if (req.auditPersisted) {
      res.setHeader("x-audit-persisted", "yes");
      return originalJson(body);
    }
    captureBefore.then(async (before) => {
      const after = ["PUT", "PATCH", "POST"].includes(method) ? await readRecord(target) : null;
      const event = buildEvent(req, res, before, after);
      try {
        if (isCriticalAudit(method, req.path)) {
          await withAuditConnection((database) => writeAuditEvent(event, database));
          res.setHeader("x-audit-persisted", "yes");
          persisted = true;
        } else {
          await withAuditConnection(async (database) => {
            await enqueueAuditOutbox(event, database);
            try {
              await flushAuditOutbox(database);
              res.setHeader("x-audit-persisted", "yes");
            } catch (flushError) {
              await alertAuditFailure(requestId, flushError);
              res.setHeader("x-audit-persisted", "no");
            }
          });
          res.setHeader("x-audit-durable", "yes");
          persisted = true;
        }
      } catch (error) {
        await alertAuditFailure(requestId, error);
        res.setHeader("x-audit-persisted", "no");
        res.setHeader("x-audit-durable", "no");
      }
      return originalJson(body);
    }).catch(async (error) => {
      await alertAuditFailure(requestId, error);
      res.setHeader("x-audit-persisted", "no");
      return originalJson(body);
    });
    return res;
  };

  res.on("finish", () => {
    if (persisted || method !== "GET") return;
    if (shouldSkipDuplicateRead(`${sessionKey(bearer(req))}|${req.path}|${JSON.stringify(req.query || {})}`)) return;
    const event = buildEvent(req, res, null, null);
    withAuditConnection(async (database) => {
      await enqueueAuditOutbox(event, database);
      await flushAuditOutbox(database);
    }).catch((error) => {
      alertAuditFailure(requestId, error);
    });
  });

  next();
}
