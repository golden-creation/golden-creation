import db from "../config/db.js";
import { fileURLToPath } from "url";

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
}

async function columnExists(table, column) {
  const rows = await query(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
      LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function addColumn(table, column, definition) {
  if (!(await columnExists(table, column))) {
    await query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

export async function ensureReferralAffiliateSchema() {
  const { refuseProductionSchemaTarget } = await import("./setup-safety.js");
  refuseProductionSchemaTarget();
  await query(`
    CREATE TABLE IF NOT EXISTS referral_settings (
      id TINYINT UNSIGNED NOT NULL DEFAULT 1,
      minimum_cashout DECIMAL(12,2) NOT NULL DEFAULT 500.00,
      attribution_window_days INT NOT NULL DEFAULT 30,
      commission_hold_days INT NOT NULL DEFAULT 10,
      default_referral_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
      default_affiliate_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
      self_referral_blocking TINYINT(1) NOT NULL DEFAULT 1,
      status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
      updated_by INT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    INSERT IGNORE INTO referral_settings
      (id, minimum_cashout, attribution_window_days, commission_hold_days,
       default_referral_percent, default_affiliate_percent, self_referral_blocking, status)
    VALUES (1, 500.00, 30, 10, 0.00, 0.00, 1, 'Active')
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_accounts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(160) NOT NULL,
      email VARCHAR(190) NOT NULL,
      phone VARCHAR(40) NULL,
      password_hash VARCHAR(255) NOT NULL,
      business_name VARCHAR(190) NULL,
      social_profile VARCHAR(255) NULL,
      city VARCHAR(120) NULL,
      state VARCHAR(120) NULL,
      promotion_channels TEXT NULL,
      expected_monthly_reach VARCHAR(120) NULL,
      notes TEXT NULL,
      status ENUM('Pending','Approved','Rejected','Suspended') NOT NULL DEFAULT 'Approved',
      last_login_at DATETIME NULL,
      created_by INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_affiliate_email (email),
      KEY idx_affiliate_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_applications (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(160) NOT NULL,
      email VARCHAR(190) NOT NULL,
      phone VARCHAR(40) NULL,
      business_name VARCHAR(190) NULL,
      social_profile VARCHAR(255) NULL,
      city VARCHAR(120) NULL,
      state VARCHAR(120) NULL,
      promotion_channels TEXT NULL,
      expected_monthly_reach VARCHAR(120) NULL,
      notes TEXT NULL,
      status ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
      review_remarks TEXT NULL,
      reviewed_by INT NULL,
      reviewed_at DATETIME NULL,
      affiliate_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_affiliate_application_status (status),
      KEY idx_affiliate_application_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS commission_rules (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      program_type ENUM('customer_referral','affiliate') NOT NULL,
      target_type ENUM('Global','Product','Category') NOT NULL DEFAULT 'Global',
      target_id INT NULL,
      commission_type ENUM('percent','fixed') NOT NULL DEFAULT 'percent',
      commission_value DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      priority INT NOT NULL DEFAULT 0,
      status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
      starts_at DATETIME NULL,
      ends_at DATETIME NULL,
      created_by INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_commission_rule_lookup (program_type, target_type, target_id, status),
      KEY idx_commission_rule_dates (starts_at, ends_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS referral_codes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      owner_type ENUM('customer','affiliate') NOT NULL,
      owner_id BIGINT UNSIGNED NOT NULL,
      code VARCHAR(40) NOT NULL,
      status ENUM('Active','Inactive','Suspended') NOT NULL DEFAULT 'Active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_referral_code (code),
      UNIQUE KEY uq_referral_owner (owner_type, owner_id),
      KEY idx_referral_code_owner (owner_type, owner_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS referral_clicks (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      code_id BIGINT UNSIGNED NULL,
      code VARCHAR(40) NOT NULL,
      referrer_type ENUM('customer','affiliate') NOT NULL,
      referrer_id BIGINT UNSIGNED NOT NULL,
      source VARCHAR(80) NULL,
      landing_url TEXT NULL,
      product_id INT NULL,
      category_id INT NULL,
      visitor_key VARCHAR(120) NULL,
      ip_hash CHAR(64) NULL,
      user_agent_hash CHAR(64) NULL,
      metadata_json LONGTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_referral_click_code (code),
      KEY idx_referral_click_referrer (referrer_type, referrer_id),
      KEY idx_referral_click_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS order_referrals (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      order_id INT NOT NULL,
      code_id BIGINT UNSIGNED NULL,
      code VARCHAR(40) NOT NULL,
      referrer_type ENUM('customer','affiliate') NOT NULL,
      referrer_id BIGINT UNSIGNED NOT NULL,
      purchaser_user_id INT NULL,
      status ENUM('Locked','Blocked','Reversed') NOT NULL DEFAULT 'Locked',
      blocked_reason VARCHAR(255) NULL,
      attribution_json LONGTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_order_referral_order (order_id),
      KEY idx_order_referral_referrer (referrer_type, referrer_id),
      CONSTRAINT fk_order_referral_order
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS commission_ledger (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      dedupe_key VARCHAR(190) NOT NULL,
      order_id INT NULL,
      order_item_id INT NULL,
      referrer_type ENUM('customer','affiliate') NOT NULL,
      referrer_id BIGINT UNSIGNED NOT NULL,
      program_type ENUM('customer_referral','affiliate') NOT NULL,
      product_id INT NULL,
      category_id INT NULL,
      base_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      commission_type ENUM('percent','fixed','manual') NOT NULL DEFAULT 'percent',
      commission_value DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      status ENUM('Pending','Approved','Rejected','Reversed','Paid') NOT NULL DEFAULT 'Pending',
      reason VARCHAR(255) NULL,
      release_after DATETIME NULL,
      released_at DATETIME NULL,
      paid_at DATETIME NULL,
      withdrawal_id BIGINT UNSIGNED NULL,
      metadata_json LONGTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_commission_dedupe (dedupe_key),
      KEY idx_commission_owner (referrer_type, referrer_id, status),
      KEY idx_commission_order (order_id),
      KEY idx_commission_release (status, release_after)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS wallet_payout_methods (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      owner_type ENUM('customer','affiliate') NOT NULL,
      owner_id BIGINT UNSIGNED NOT NULL,
      method_type ENUM('UPI','Bank') NOT NULL DEFAULT 'UPI',
      account_holder VARCHAR(160) NULL,
      upi_id VARCHAR(160) NULL,
      bank_name VARCHAR(160) NULL,
      account_number VARCHAR(80) NULL,
      ifsc VARCHAR(40) NULL,
      status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
      is_default TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_wallet_payout_owner (owner_type, owner_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS wallet_withdrawal_requests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      owner_type ENUM('customer','affiliate') NOT NULL,
      owner_id BIGINT UNSIGNED NOT NULL,
      amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      payout_method_id BIGINT UNSIGNED NULL,
      status ENUM('Requested','Approved','Rejected','Paid') NOT NULL DEFAULT 'Requested',
      admin_remarks TEXT NULL,
      payout_reference VARCHAR(190) NULL,
      requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      decided_by INT NULL,
      decided_at DATETIME NULL,
      paid_at DATETIME NULL,
      PRIMARY KEY (id),
      KEY idx_wallet_withdrawal_owner (owner_type, owner_id, status),
      KEY idx_wallet_withdrawal_status (status, requested_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await addColumn("orders", "referral_code", "VARCHAR(40) NULL AFTER quote_snapshot");
  await addColumn("orders", "referral_owner_type", "VARCHAR(30) NULL AFTER referral_code");
  await addColumn("orders", "referral_owner_id", "BIGINT UNSIGNED NULL AFTER referral_owner_type");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ensureReferralAffiliateSchema()
    .then(() => {
      console.log("Referral and affiliate schema is ready.");
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
