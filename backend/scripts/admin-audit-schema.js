export const ADMIN_AUDIT_COLUMNS = [
  "admin_id",
  "session_id",
  "request_id",
  "source",
  "layer",
  "outcome",
  "changed_fields",
  "previous_hash",
  "row_hash",
];

async function addColumn(query, table, column, definition) {
  const rows = await query(
    `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (Number(rows[0]?.total || rows[0]?.["COUNT(*)"] || 0) > 0) return;
  await query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}

async function addIndex(query, table, name, column, unique) {
  const rows = await query(
    `SELECT COUNT(*) AS total FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, name]
  );
  if (Number(rows[0]?.total || 0) > 0) return;
  await query(`CREATE ${unique ? "UNIQUE " : ""}INDEX \`${name}\` ON \`${table}\` (\`${column}\`)`);
}

export async function ensureAdminAuditSchema(query) {
  await query(`
    CREATE TABLE IF NOT EXISTS admin_audit_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      admin_id INT NULL,
      actor_name VARCHAR(160) NULL,
      actor_email VARCHAR(190) NULL,
      actor_role VARCHAR(80) NULL,
      session_id CHAR(32) NULL,
      request_id CHAR(36) NULL,
      source VARCHAR(20) NOT NULL DEFAULT 'backend',
      layer VARCHAR(20) NOT NULL DEFAULT 'confirmed',
      module_name VARCHAR(80) NOT NULL,
      page_name VARCHAR(160) NULL,
      action_name VARCHAR(160) NOT NULL,
      outcome VARCHAR(20) NOT NULL,
      http_method VARCHAR(12) NULL,
      request_path VARCHAR(255) NULL,
      record_id VARCHAR(64) NULL,
      record_name VARCHAR(255) NULL,
      previous_value JSON NULL,
      updated_value JSON NULL,
      changed_fields JSON NULL,
      detail JSON NULL,
      ip_address VARCHAR(64) NULL,
      user_agent VARCHAR(255) NULL,
      previous_hash CHAR(64) NOT NULL,
      row_hash CHAR(64) NOT NULL,
      idempotency_key CHAR(64) NULL,
      PRIMARY KEY (id),
      KEY idx_admin_audit_created (created_at),
      KEY idx_admin_audit_admin (admin_id, created_at),
      KEY idx_admin_audit_module (module_name, created_at),
      KEY idx_admin_audit_outcome (outcome, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS admin_audit_chain (
      id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      latest_hash CHAR(64) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await query("INSERT IGNORE INTO admin_audit_chain (id, latest_hash) VALUES (1, ?)", ["0".repeat(64)]);
  await query(`
    CREATE TABLE IF NOT EXISTS admin_audit_outbox (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      payload JSON NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0,
      last_error VARCHAR(255) NULL,
      idempotency_key CHAR(64) NULL,
      next_attempt_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_admin_audit_outbox_status (status, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS admin_audit_settings (
      id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      retention_days INT NOT NULL DEFAULT 365
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await query("INSERT IGNORE INTO admin_audit_settings (id, retention_days) VALUES (1, 365)");
  await addColumn(query, "admin_audit_outbox", "idempotency_key", "CHAR(64) NULL");
  await addColumn(query, "admin_audit_outbox", "next_attempt_at", "DATETIME NULL");
  await addColumn(query, "admin_audit_events", "idempotency_key", "CHAR(64) NULL");
  await addIndex(query, "admin_audit_outbox", "uq_admin_audit_outbox_key", "idempotency_key", true);
  await addIndex(query, "admin_audit_events", "uq_admin_audit_event_key", "idempotency_key", true);
  const triggers = await query(
    `SELECT TRIGGER_NAME AS name
       FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA = DATABASE()
        AND EVENT_OBJECT_TABLE = 'admin_audit_events'`
  );
  const names = new Set(triggers.map((row) => row.name || row.TRIGGER_NAME));
  let triggersInstalled = names.has("admin_audit_events_no_update") && names.has("admin_audit_events_no_delete");
  const install = async (name, timing) => {
    if (names.has(name)) return;
    try {
      await query("SET SESSION lock_wait_timeout = 3");
      await query(`
        CREATE TRIGGER ${name}
        BEFORE ${timing} ON admin_audit_events
        FOR EACH ROW
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit records are append-only'
      `);
      triggersInstalled = true;
    } catch (error) {
      const skipped = ["ER_BINLOG_CREATE_ROUTINE_NEED_SUPER", "ER_LOCK_WAIT_TIMEOUT"].includes(error.code)
        || [1419, 1205].includes(error.errno);
      if (!skipped) throw error;
      triggersInstalled = false;
    }
  };
  await install("admin_audit_events_no_update", "UPDATE");
  await install("admin_audit_events_no_delete", "DELETE");
  return { triggersInstalled };
}
