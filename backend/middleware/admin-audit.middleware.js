import db from "../config/db.js";
import {
  auditAction,
  auditModule,
  auditOutcome,
  auditRecordTarget,
  changedAuditFields,
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

export function attachAdminAudit(req, res, next) {
  if (req.path.startsWith("/audit/events") || req.path.startsWith("/audit/observations")) {
    next();
    return;
  }
  const requestId = newRequestId();
  req.auditRequestId = requestId;
  res.setHeader("x-request-id", requestId);
  const target = auditRecordTarget(req.path);
  const method = req.method.toUpperCase();
  let wrote = false;
  const captureBefore = ["PUT", "PATCH", "DELETE"].includes(method) ? readRecord(target) : Promise.resolve(null);

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    res.locals.auditResponse = sanitizeAuditValue(
      body && typeof body === "object" ? { message: body.message, id: body.id, name: body.name } : { message: "" }
    );
    res.locals.auditMessage = String(body?.message || "");
    return originalJson(body);
  };

  res.on("finish", () => {
    if (wrote) return;
    wrote = true;
    const path = req.path || "";
    const status = res.statusCode || 500;
    if (method === "GET" && shouldSkipDuplicateRead(`${sessionKey(bearer(req))}|${path}|${JSON.stringify(req.query || {})}`)) {
      return;
    }
    captureBefore.then(async (before) => {
      const after = ["PUT", "PATCH", "POST"].includes(method) ? await readRecord(target) : null;
      const changedFields = before || after ? changedAuditFields(before, after) : [];
      const message = res.locals.auditMessage || "";
      const action = status === 401 && /expired/i.test(message) ? "Session expiry" : auditAction(method, path, status, message);
      await writeAuditEvent({
        adminId: req.admin?.id,
        actorName: req.admin?.name,
        actorEmail: req.admin?.email,
        actorRole: req.admin?.role,
        sessionId: sessionKey(bearer(req)),
        requestId,
        source: "backend",
        layer: "confirmed",
        module: auditModule(path),
        page: path,
        action,
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
          request: method === "GET" ? sanitizeAuditValue(req.query) : sanitizeAuditValue(req.body),
          confirmed: true,
        },
        ip: clientIp(req),
        userAgent: req.headers["user-agent"],
      }, query);
    }).catch((error) => {
      failureCount += 1;
      console.error(`AUDIT_LOG_FAILURE ${requestId} ${error.message || "audit write failed"}`);
    });
  });

  next();
}
