-- Additive payment and Porter columns.
-- Does not update orders.amount_paid, orders.cod_due, stock, or payment history.
-- Does not enable full COD or Porter. Both stay off until an admin configures them.
-- quote_snapshot is added before delivery_method so a fresh orders table can take the later column.
-- Run against production only after explicit approval.

ALTER TABLE payment_settings
  ADD COLUMN IF NOT EXISTS cod_min_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER stock_hold_minutes,
  ADD COLUMN IF NOT EXISTS cod_max_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER cod_min_amount,
  ADD COLUMN IF NOT EXISTS cod_pin_restricted TINYINT(1) NOT NULL DEFAULT 0 AFTER cod_max_amount,
  ADD COLUMN IF NOT EXISTS cod_pins TEXT NULL AFTER cod_pin_restricted,
  ADD COLUMN IF NOT EXISTS porter_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER cod_pins,
  ADD COLUMN IF NOT EXISTS porter_pins TEXT NULL AFTER porter_enabled,
  ADD COLUMN IF NOT EXISTS porter_collects_cod TINYINT(1) NOT NULL DEFAULT 0 AFTER porter_pins;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS quote_snapshot LONGTEXT NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_method VARCHAR(40) NOT NULL DEFAULT 'Standard' AFTER quote_snapshot,
  ADD COLUMN IF NOT EXISTS partial_advance_percent DECIMAL(5,2) NULL AFTER delivery_method,
  ADD COLUMN IF NOT EXISTS porter_booking_reference VARCHAR(120) NULL AFTER partial_advance_percent,
  ADD COLUMN IF NOT EXISTS porter_status VARCHAR(40) NULL AFTER porter_booking_reference;

-- Future quotes only. Existing order amounts stay as stored.
UPDATE payment_settings
   SET default_partial_percent = 20
 WHERE id = 1
   AND default_partial_percent = 10;
