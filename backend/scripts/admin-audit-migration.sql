-- Append-only Super Admin audit log.
-- Does not change products, stock, orders, customers, payments, or admin accounts.
-- The application should receive INSERT and SELECT on admin_audit_events.
-- UPDATE and DELETE on that table stay blocked by the triggers below.
-- admin_audit_chain and admin_audit_outbox need INSERT, SELECT, and UPDATE for the lock row and retry state.
-- This script does not GRANT privileges and does not delete audit rows.
-- Keep an encrypted copy of the audit tables off this server for the retention period. A dump on the same VPS is not that copy.
-- Run against production only after explicit approval.

CREATE TABLE IF NOT EXISTS admin_audit_chain (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  latest_hash CHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO admin_audit_chain (id, latest_hash)
VALUES (1, '0000000000000000000000000000000000000000000000000000000000000000');

CREATE TABLE IF NOT EXISTS admin_audit_outbox (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payload JSON NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  last_error VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_admin_audit_outbox_status (status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_audit_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  retention_days INT NOT NULL DEFAULT 365
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO admin_audit_settings (id, retention_days) VALUES (1, 365);

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS admin_audit_events_no_update;
CREATE TRIGGER admin_audit_events_no_update
BEFORE UPDATE ON admin_audit_events
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit records are append-only';

DROP TRIGGER IF EXISTS admin_audit_events_no_delete;
CREATE TRIGGER admin_audit_events_no_delete
BEFORE DELETE ON admin_audit_events
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit records are append-only';
