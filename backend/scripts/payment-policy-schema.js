import { defaultEligiblePinText } from "../services/ncr-pins.js";

export const PAYMENT_SETTINGS_POLICY_COLUMNS = [
  ["cod_min_amount", "DECIMAL(12,2) NOT NULL DEFAULT 0"],
  ["cod_max_amount", "DECIMAL(12,2) NOT NULL DEFAULT 0"],
  ["cod_pin_restricted", "TINYINT(1) NOT NULL DEFAULT 0"],
  ["cod_pins", "TEXT NULL"],
  ["porter_enabled", "TINYINT(1) NOT NULL DEFAULT 0"],
  ["porter_pins", "TEXT NULL"],
  ["porter_collects_cod", "TINYINT(1) NOT NULL DEFAULT 0"],
  ["cod_max_distance_km", "DECIMAL(8,2) NOT NULL DEFAULT 40"],
  ["partial_cod_above", "DECIMAL(12,2) NOT NULL DEFAULT 3000"],
  ["porter_max_distance_km", "DECIMAL(8,2) NOT NULL DEFAULT 40"],
  ["porter_requires_full_payment", "TINYINT(1) NOT NULL DEFAULT 1"],
  ["porter_customer_pays_delivery", "TINYINT(1) NOT NULL DEFAULT 1"],
  ["eligibility_mode", "VARCHAR(16) NOT NULL DEFAULT 'pin'"],
  ["eligible_pins", "MEDIUMTEXT NULL"],
];

export const ORDER_POLICY_COLUMNS = [
  ["delivery_method", "VARCHAR(40) NOT NULL DEFAULT 'Standard'"],
  ["partial_advance_percent", "DECIMAL(5,2) NULL"],
  ["porter_booking_reference", "VARCHAR(120) NULL"],
  ["porter_status", "VARCHAR(40) NULL"],
];

export const PAYMENT_POLICY_COLUMNS = [
  ...PAYMENT_SETTINGS_POLICY_COLUMNS.map(([column]) => ["payment_settings", column]),
  ...ORDER_POLICY_COLUMNS.map(([column]) => ["orders", column]),
];

async function columnExists(query, table, column) {
  const rows = await query(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
      LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function addColumn(query, table, column, definition) {
  if (await columnExists(query, table, column)) return;
  await query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}

export async function ensurePaymentPolicyColumns(query, {
  settingsTable = "payment_settings",
  ordersTable = "orders",
} = {}) {
  for (const [column, definition] of PAYMENT_SETTINGS_POLICY_COLUMNS) {
    await addColumn(query, settingsTable, column, definition);
  }
  await addColumn(query, ordersTable, "quote_snapshot", "LONGTEXT NULL");
  for (const [column, definition] of ORDER_POLICY_COLUMNS) {
    const placement = column === "delivery_method" ? `${definition} AFTER quote_snapshot` : definition;
    await addColumn(query, ordersTable, column, placement);
  }
  await query(
    `UPDATE \`${settingsTable}\`
        SET default_partial_percent = 20
      WHERE id = 1 AND default_partial_percent = 10`
  );
  await query(
    `UPDATE \`${settingsTable}\`
        SET eligibility_mode = 'pin'
      WHERE id = 1 AND (eligibility_mode IS NULL OR eligibility_mode = '')`
  );
  await query(
    `UPDATE \`${settingsTable}\`
        SET eligible_pins = ?
      WHERE id = 1 AND (eligible_pins IS NULL OR eligible_pins = '')`,
    [defaultEligiblePinText()]
  );
}
