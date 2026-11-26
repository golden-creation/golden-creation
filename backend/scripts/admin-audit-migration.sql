-- Append-only Super Admin audit log.
-- Does not change products, stock, orders, customers, payments, or admin accounts.
-- Proposed retention is 365 days. This script does not delete old rows.
-- Run against production only after explicit approval.

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
