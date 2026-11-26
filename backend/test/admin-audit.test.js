import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import mysql from "mysql2/promise";
import {
  auditRowHash,
  changedAuditFields,
  isAuditSuperAdmin,
  listAdminRoutes,
  sanitizeAuditValue,
  verifyAuditChain,
} from "../services/admin-audit.js";
import { ensureAdminAuditSchema } from "../scripts/admin-audit-schema.js";
import { writeAuditEvent } from "../middleware/admin-audit.middleware.js";
import { rejectAuditMutation, requireAuditSuperAdmin } from "../controllers/admin-audit.controller.js";

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
  throw new Error(`Refusing audit test database ${name}`);
}

test("admin mutations are covered by the central audit middleware", () => {
  const source = fs.readFileSync(path.join(root, "routes/admin.routes.js"), "utf8");
  const routes = listAdminRoutes(source);
  const mutations = routes.filter((route) => route.mutation);
  assert.ok(source.indexOf("router.use(attachAdminAudit)") < source.indexOf('"/login"'));
  assert.ok(mutations.length > 80);
  assert.ok(mutations.every((route) => route.automatic));
  for (const moduleName of ["Products", "Stock", "Orders", "Payments", "Customers", "Coupons", "Permissions"]) {
    assert.ok(routes.some((route) => route.module === moduleName), moduleName);
  }
  assert.equal(source.includes("auditEnabled"), false);
});

test("audit details hide secrets and keep before and after field changes", () => {
  const clean = sanitizeAuditValue({
    name: "Pen",
    password: "secret-pass",
    otp: "123456",
    token: "jwt",
    razorpay_key_secret: "key",
    note: "x".repeat(600),
  });
  assert.equal(clean.password, "[redacted]");
  assert.equal(clean.otp, "[redacted]");
  assert.equal(clean.token, "[redacted]");
  assert.equal(clean.razorpay_key_secret, "[redacted]");
  assert.match(clean.note, /600/);
  assert.deepEqual(changedAuditFields({ price: 10, name: "Pen" }, { price: 12, name: "Pen" }), [
    { field: "price", before: 10, after: 12 },
  ]);
  const payload = { action: "Update" };
  const first = auditRowHash("0".repeat(64), payload);
  assert.equal(verifyAuditChain([
    { previous_hash: "0".repeat(64), row_hash: first, payload },
  ]), true);
});

test("only a Super Admin can read audit records and nobody can edit them", async () => {
  assert.equal(isAuditSuperAdmin({ role: "Super Admin" }), true);
  assert.equal(isAuditSuperAdmin({ role: "Technical Developer" }), false);
  assert.equal(isAuditSuperAdmin({ role: "Staff" }), false);
  const app = express();
  app.use((req, _res, next) => {
    req.admin = { role: req.header("x-role") };
    next();
  });
  app.get("/audit/events", requireAuditSuperAdmin, (_req, res) => res.json({ ok: true }));
  app.delete("/audit/events/:id", requireAuditSuperAdmin, rejectAuditMutation);
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const port = server.address().port;
  try {
    const staff = await fetch(`http://127.0.0.1:${port}/audit/events`, { headers: { "x-role": "Staff" } });
    const developer = await fetch(`http://127.0.0.1:${port}/audit/events`, { headers: { "x-role": "Technical Developer" } });
    const allowed = await fetch(`http://127.0.0.1:${port}/audit/events`, { headers: { "x-role": "Super Admin" } });
    const removed = await fetch(`http://127.0.0.1:${port}/audit/events/4`, { method: "DELETE", headers: { "x-role": "Super Admin" } });
    assert.equal(staff.status, 403);
    assert.equal(developer.status, 403);
    assert.equal(allowed.status, 200);
    assert.equal(removed.status, 405);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("audit records are append-only on a fresh and an existing audit table", async () => {
  readEnvFile();
  const database = isolatedDatabase();
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || "",
    database,
    connectTimeout: 5000,
  });
  const run = async (sql, params = []) => {
    const [rows] = await connection.query(sql, params);
    return rows;
  };
  try {
    await connection.query("DROP TABLE IF EXISTS admin_audit_events");
    const fresh = await ensureAdminAuditSchema(run);
    const existing = await ensureAdminAuditSchema(run);
    await writeAuditEvent({
      adminId: 7,
      actorName: "Audit Tester",
      actorEmail: "audit@example.com",
      actorRole: "Super Admin",
      source: "backend",
      layer: "confirmed",
      module: "Products",
      page: "/products/4",
      action: "Update",
      outcome: "success",
      method: "PUT",
      path: "/products/4",
      recordId: "4",
      recordName: "Pen",
      previousValue: { price: 10 },
      updatedValue: { price: 12 },
      changedFields: [{ field: "price", before: 10, after: 12 }],
      detail: { password: "[redacted]" },
    }, run);
    const rows = await run("SELECT previous_value, updated_value, changed_fields, row_hash, previous_hash FROM admin_audit_events");
    assert.equal(rows.length, 1);
    assert.equal(String(rows[0].previous_hash), "0".repeat(64));
    assert.equal(String(rows[0].row_hash).length, 64);
    if (fresh.triggersInstalled && existing.triggersInstalled) {
      await assert.rejects(() => connection.query("UPDATE admin_audit_events SET action_name = 'Edited'"));
      await assert.rejects(() => connection.query("DELETE FROM admin_audit_events"));
    }
    const remaining = await run("SELECT COUNT(*) AS total FROM admin_audit_events");
    assert.equal(Number(remaining[0].total), 1);
  } catch (error) {
    fs.writeFileSync(path.join(root, "audit-test-error.txt"), `${error.code || ""} ${error.message || error}`);
    throw error;
  } finally {
    connection.destroy();
  }
});
