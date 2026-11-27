import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { ensurePaymentPolicyColumns, PAYMENT_POLICY_COLUMNS } from "../scripts/payment-policy-schema.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readEnvFile() {
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function isolatedDatabase() {
  const name = String(process.env.DB_NAME || "lekhanmart").trim();
  if (name === "goldencreation_db") throw new Error("Refusing production database");
  if (name === "lekhanmart") return "lekhanmart_itest";
  if (name === "gc_ci" || name.endsWith("_itest")) return name;
  throw new Error(`Refusing migration test database ${name}`);
}

async function columnNames(connection, table) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME AS name, ORDINAL_POSITION AS position
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [table]
  );
  return rows;
}

test("payment policy migration keeps quote_snapshot ahead of the new order columns", () => {
  const source = fs.readFileSync(path.join(root, "scripts/ensure-commerce-media-schema.js"), "utf8");
  const sql = fs.readFileSync(path.join(root, "scripts/payment-policy-migration.sql"), "utf8");
  const snapshot = source.indexOf('addColumn("orders", "quote_snapshot"');
  const policy = source.indexOf("await ensurePaymentPolicyColumns");
  assert.ok(snapshot > -1 && policy > snapshot);
  assert.equal(source.includes('addColumn("orders", "delivery_method"'), false);
  assert.ok(sql.indexOf("quote_snapshot") < sql.indexOf("delivery_method"));
  assert.equal(/^\s*UPDATE\s+orders\b/im.test(sql), false);
  assert.equal(/full_cod_enabled\s*=\s*1/.test(sql), false);
  assert.equal(/porter_enabled\s*=\s*1/.test(sql), false);
  assert.equal(/CAST\s*\(/i.test(sql), false);
  assert.equal(PAYMENT_POLICY_COLUMNS.length, 16);
});

test("payment policy columns migrate a fresh schema and an existing schema", async () => {
  readEnvFile();
  const database = isolatedDatabase();
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || "",
    database,
  });
  const tables = [
    "gc_policy_fresh_settings",
    "gc_policy_fresh_orders",
    "gc_policy_existing_settings",
    "gc_policy_existing_orders",
  ];
  const query = async (sql, params = []) => {
    const [rows] = await connection.query(sql, params);
    return rows;
  };
  try {
    for (const table of tables) await connection.query(`DROP TABLE IF EXISTS \`${table}\``);
    await connection.query(`
      CREATE TABLE gc_policy_fresh_settings (
        id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
        full_online_enabled TINYINT(1) NOT NULL DEFAULT 0,
        partial_cod_enabled TINYINT(1) NOT NULL DEFAULT 0,
        full_cod_enabled TINYINT(1) NOT NULL DEFAULT 0,
        default_partial_percent DECIMAL(5,2) NOT NULL DEFAULT 10.00,
        stock_hold_minutes INT NOT NULL DEFAULT 30
      )`);
    await connection.query(
      "INSERT INTO gc_policy_fresh_settings (id, full_cod_enabled, default_partial_percent) VALUES (1, 0, 10)"
    );
    await connection.query(`
      CREATE TABLE gc_policy_fresh_orders (
        id INT NOT NULL PRIMARY KEY,
        total_amount DECIMAL(12,2) NOT NULL,
        amount_paid DECIMAL(12,2) NOT NULL,
        cod_due DECIMAL(12,2) NOT NULL
      )`);
    await connection.query(
      "INSERT INTO gc_policy_fresh_orders (id, total_amount, amount_paid, cod_due) VALUES (1, 1000, 100, 900)"
    );

    await connection.query(`
      CREATE TABLE gc_policy_existing_settings (
        id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
        full_online_enabled TINYINT(1) NOT NULL DEFAULT 0,
        partial_cod_enabled TINYINT(1) NOT NULL DEFAULT 0,
        full_cod_enabled TINYINT(1) NOT NULL DEFAULT 0,
        default_partial_percent DECIMAL(5,2) NOT NULL DEFAULT 20.00,
        stock_hold_minutes INT NOT NULL DEFAULT 30
      )`);
    await connection.query(
      "INSERT INTO gc_policy_existing_settings (id, full_cod_enabled, default_partial_percent) VALUES (1, 1, 15)"
    );
    await connection.query(`
      CREATE TABLE gc_policy_existing_orders (
        id INT NOT NULL PRIMARY KEY,
        total_amount DECIMAL(12,2) NOT NULL,
        amount_paid DECIMAL(12,2) NOT NULL,
        cod_due DECIMAL(12,2) NOT NULL,
        quote_snapshot LONGTEXT NULL
      )`);
    await connection.query(
      "INSERT INTO gc_policy_existing_orders (id, total_amount, amount_paid, cod_due, quote_snapshot) VALUES (1, 1000, 100, 900, '{}')"
    );

    await ensurePaymentPolicyColumns(query, {
      settingsTable: "gc_policy_fresh_settings",
      ordersTable: "gc_policy_fresh_orders",
    });
    await ensurePaymentPolicyColumns(query, {
      settingsTable: "gc_policy_fresh_settings",
      ordersTable: "gc_policy_fresh_orders",
    });
    await ensurePaymentPolicyColumns(query, {
      settingsTable: "gc_policy_existing_settings",
      ordersTable: "gc_policy_existing_orders",
    });
    await ensurePaymentPolicyColumns(query, {
      settingsTable: "gc_policy_existing_settings",
      ordersTable: "gc_policy_existing_orders",
    });

    const freshColumns = await columnNames(connection, "gc_policy_fresh_orders");
    const snapshot = freshColumns.find((column) => column.name === "quote_snapshot");
    const delivery = freshColumns.find((column) => column.name === "delivery_method");
    assert.ok(snapshot && delivery && snapshot.position < delivery.position);
    for (const [, column] of PAYMENT_POLICY_COLUMNS) {
      const table = column.startsWith("porter_") || column === "delivery_method" || column === "partial_advance_percent"
        ? "gc_policy_fresh_orders"
        : null;
      if (["delivery_method", "partial_advance_percent", "porter_booking_reference", "porter_status"].includes(column)) {
        assert.ok(freshColumns.some((entry) => entry.name === column));
      }
    }
    const [freshSettings] = await connection.query("SELECT * FROM gc_policy_fresh_settings WHERE id = 1");
    const [freshOrder] = await connection.query("SELECT * FROM gc_policy_fresh_orders WHERE id = 1");
    assert.equal(Number(freshSettings[0].default_partial_percent), 20);
    assert.equal(Number(freshSettings[0].full_cod_enabled), 0);
    assert.equal(Number(freshSettings[0].porter_enabled), 0);
    assert.equal(Number(freshSettings[0].cod_max_distance_km), 40);
    assert.equal(Number(freshSettings[0].partial_cod_above), 3000);
    assert.equal(Number(freshSettings[0].porter_max_distance_km), 40);
    assert.equal(Number(freshSettings[0].porter_requires_full_payment), 1);
    assert.equal(Number(freshSettings[0].porter_customer_pays_delivery), 1);
    assert.equal(Number(freshOrder[0].amount_paid), 100);
    assert.equal(Number(freshOrder[0].cod_due), 900);

    const existingColumns = await columnNames(connection, "gc_policy_existing_orders");
    const existingSnapshot = existingColumns.find((column) => column.name === "quote_snapshot");
    const existingDelivery = existingColumns.find((column) => column.name === "delivery_method");
    assert.ok(existingSnapshot.position < existingDelivery.position);
    const [existingSettings] = await connection.query("SELECT * FROM gc_policy_existing_settings WHERE id = 1");
    const [existingOrder] = await connection.query("SELECT * FROM gc_policy_existing_orders WHERE id = 1");
    assert.equal(Number(existingSettings[0].default_partial_percent), 15);
    assert.equal(Number(existingSettings[0].full_cod_enabled), 1);
    assert.equal(Number(existingSettings[0].porter_enabled), 0);
    assert.equal(Number(existingOrder[0].amount_paid), 100);
    assert.equal(Number(existingOrder[0].cod_due), 900);
    assert.equal(existingOrder[0].quote_snapshot, "{}");
  } finally {
    for (const table of tables) await connection.query(`DROP TABLE IF EXISTS \`${table}\``);
    await connection.end();
  }
});
