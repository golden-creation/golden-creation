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
      PRIMARY KEY (id),
      KEY idx_admin_audit_created (created_at),
      KEY idx_admin_audit_admin (admin_id, created_at),
      KEY idx_admin_audit_module (module_name, created_at),
      KEY idx_admin_audit_outcome (outcome, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
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
