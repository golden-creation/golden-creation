import db from "../config/db.js";
import { processAuditOutbox } from "./admin-audit.js";

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

export function runAuditOutboxRecovery() {
  return new Promise((resolve, reject) => {
    db.getConnection((error, connection) => {
      if (error) {
        reject(error);
        return;
      }
      processAuditOutbox(connectionAdapter(connection))
        .then(resolve, reject)
        .finally(() => connection.release());
    });
  });
}

export function startAuditOutboxWorker(intervalMs = 15000) {
  const tick = () => {
    runAuditOutboxRecovery().catch((error) => {
      console.error(`AUDIT_LOG_FAILURE outbox ${error?.message || "recovery failed"}`);
    });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
