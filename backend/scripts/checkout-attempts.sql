-- Prepared migration only. Do not run this on goldencreation_db or lekhanmart
-- until a separate schema approval is given.
--
-- Checkout orders reference checkout_attempts.id. The column is nullable so
-- existing admin and historical inserts keep working after the column exists.

CREATE TABLE IF NOT EXISTS checkout_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idempotency_key VARCHAR(80) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  status VARCHAR(30) NOT NULL,
  order_id INT NULL,
  order_number VARCHAR(40) NULL,
  response_json LONGTEXT NULL,
  error_message VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_checkout_attempt_key (idempotency_key),
  KEY idx_checkout_attempt_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Run only after orders exists. Skip if the column is already present.
-- ALTER TABLE orders
--   ADD COLUMN checkout_attempt_id BIGINT UNSIGNED NULL AFTER quote_snapshot,
--   ADD UNIQUE KEY uq_orders_checkout_attempt (checkout_attempt_id);
