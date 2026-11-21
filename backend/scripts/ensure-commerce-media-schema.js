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

export async function ensureCommerceMediaSchema() {
  await addColumn("shipping_rules", "priority", "INT NOT NULL DEFAULT 0 AFTER status");

  await query(`
    CREATE TABLE IF NOT EXISTS shipping_rule_targets (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      rule_id INT NOT NULL,
      target_type ENUM('Product','Category','Collection') NOT NULL,
      target_id INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_shipping_rule_target (rule_id, target_type, target_id),
      KEY idx_shipping_target_lookup (target_type, target_id),
      CONSTRAINT fk_shipping_target_rule
        FOREIGN KEY (rule_id) REFERENCES shipping_rules(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS shipping_rule_locations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      rule_id INT NOT NULL,
      location_type ENUM('All India','State','Pincode') NOT NULL DEFAULT 'All India',
      location_value VARCHAR(120) NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_shipping_rule_location (rule_id, location_type, location_value),
      KEY idx_shipping_location_lookup (location_type, location_value),
      CONSTRAINT fk_shipping_location_rule
        FOREIGN KEY (rule_id) REFERENCES shipping_rules(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    INSERT IGNORE INTO shipping_rule_locations (rule_id, location_type, location_value)
    SELECT id, 'All India', '' FROM shipping_rules
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS payment_settings (
      id TINYINT UNSIGNED NOT NULL DEFAULT 1,
      full_online_enabled TINYINT(1) NOT NULL DEFAULT 0,
      partial_cod_enabled TINYINT(1) NOT NULL DEFAULT 0,
      full_cod_enabled TINYINT(1) NOT NULL DEFAULT 1,
      default_partial_percent DECIMAL(5,2) NOT NULL DEFAULT 20.00,
      stock_hold_minutes INT NOT NULL DEFAULT 30,
      updated_by INT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await query(`
    INSERT IGNORE INTO payment_settings
      (id, full_online_enabled, partial_cod_enabled, full_cod_enabled, default_partial_percent, stock_hold_minutes)
    VALUES (1, 0, 0, 1, 20.00, 30)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS partial_cod_rules (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      target_type ENUM('Product','Category','Collection') NOT NULL,
      target_id INT NOT NULL,
      percentage DECIMAL(5,2) NULL,
      eligible TINYINT(1) NOT NULL DEFAULT 1,
      priority INT NOT NULL DEFAULT 0,
      status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_partial_cod_target (target_type, target_id),
      KEY idx_partial_cod_lookup (target_type, target_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await addColumn("orders", "payment_status", "VARCHAR(30) NOT NULL DEFAULT 'Pending' AFTER payment_method");
  await addColumn("orders", "amount_paid", "DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER total_amount");
  await addColumn("orders", "cod_due", "DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER amount_paid");
  await addColumn("orders", "razorpay_order_id", "VARCHAR(100) NULL AFTER cod_due");
  await addColumn("orders", "razorpay_payment_id", "VARCHAR(100) NULL AFTER razorpay_order_id");
  await addColumn("orders", "payment_expires_at", "DATETIME NULL AFTER razorpay_payment_id");
  await addColumn("orders", "payment_completed_at", "DATETIME NULL AFTER payment_expires_at");
  await addColumn("orders", "stock_restored_at", "DATETIME NULL AFTER payment_completed_at");
  await addColumn("orders", "cod_collected_at", "DATETIME NULL AFTER stock_restored_at");
  await addColumn("orders", "quote_snapshot", "LONGTEXT NULL AFTER cod_collected_at");

  await query(`
    CREATE TABLE IF NOT EXISTS payment_transactions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      order_id INT NOT NULL,
      provider VARCHAR(40) NOT NULL,
      provider_order_id VARCHAR(120) NULL,
      provider_payment_id VARCHAR(120) NULL,
      event_type VARCHAR(80) NOT NULL,
      status VARCHAR(40) NOT NULL,
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      payload_json LONGTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_payment_transaction_event (provider, provider_order_id, provider_payment_id, event_type),
      KEY idx_payment_transaction_order (order_id),
      CONSTRAINT fk_payment_transaction_order
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS payment_webhook_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      provider VARCHAR(40) NOT NULL,
      event_id VARCHAR(160) NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      status ENUM('Received','Processed','Ignored','Failed') NOT NULL DEFAULT 'Received',
      payload_json LONGTEXT NULL,
      error_message TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_payment_webhook_event (provider, event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS media_assets (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      storage_key VARCHAR(500) NOT NULL,
      public_url TEXT NOT NULL,
      mime_type VARCHAR(120) NULL,
      size_bytes BIGINT UNSIGNED NULL,
      folder VARCHAR(120) NULL,
      status ENUM('Pending','Ready','Deleted','Failed') NOT NULL DEFAULT 'Ready',
      uploaded_by INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_media_asset_key (storage_key),
      KEY idx_media_asset_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS remote_media_imports (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      source_url TEXT NOT NULL,
      source_hash CHAR(64) NOT NULL,
      storage_key VARCHAR(500) NULL,
      storage_url TEXT NULL,
      status ENUM('Pending','Copying','Copied','Failed') NOT NULL DEFAULT 'Pending',
      attempts INT NOT NULL DEFAULT 0,
      last_error TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_remote_media_source_hash (source_hash),
      KEY idx_remote_media_status (status, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await addColumn("blog_posts", "featured_media_type", "ENUM('image','video') NOT NULL DEFAULT 'image' AFTER cover_image");
  await addColumn("blog_posts", "featured_video_url", "TEXT NULL AFTER featured_media_type");
  await addColumn("blog_posts", "video_poster", "TEXT NULL AFTER featured_video_url");
  await addColumn("blog_posts", "media_gallery", "LONGTEXT NULL AFTER video_poster");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ensureCommerceMediaSchema()
    .then(() => {
      console.log("Commerce and media schema is ready.");
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
