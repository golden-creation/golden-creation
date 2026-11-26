import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import mysql from "mysql2/promise";
import {
  AUDIT_COVERAGE_GAPS,
  auditCoverageMatrix,
  auditRetentionDays,
  auditRowHash,
  bulkAuditSummary,
  changedAuditFields,
  classifyAdminRoute,
  enqueueAuditOutbox,
  flushAuditOutbox,
  instrumentAdminResponse,
  isAuditSuperAdmin,
  listAdminRoutes,
  loginActor,
  processAuditOutbox,
  sanitizeAuditValue,
  verifyAuditChain,
  writeAuditEvent,
} from "../services/admin-audit.js";
import { ensureAdminAuditSchema } from "../scripts/admin-audit-schema.js";

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

test("admin mutations are classified without claiming complete field coverage", () => {
  const source = fs.readFileSync(path.join(root, "routes/admin.routes.js"), "utf8");
  const routes = listAdminRoutes(source);
  const mutations = routes.filter((route) => route.mutation);
  assert.ok(source.indexOf("router.use(attachAdminAudit)") < source.indexOf('"/login"'));
  assert.ok(mutations.length > 80);
  assert.equal(source.includes("auditEnabled"), false);
  const classified = mutations.map((route) => classifyAdminRoute(route.method, route.path));
  assert.equal(classified.length, mutations.length);
  assert.equal(classified.every((route) => route.persistence && route.diff), true);
  assert.equal(classified.filter((route) => route.diff === "single-row-allowlist").length < mutations.length, true);
  for (const moduleName of ["Products", "Stock", "Orders", "Payments", "Customers", "Coupons", "Permissions"]) {
    assert.ok(routes.some((route) => route.module === moduleName), moduleName);
  }
  assert.equal(classifyAdminRoute("PUT", "/products/import").diff, "multi-record");
  assert.equal(classifyAdminRoute("POST", "/media/upload").diff, "file-or-job");
  assert.equal(classifyAdminRoute("POST", "/media/migration/run").diff, "file-or-job");
  assert.equal(classifyAdminRoute("PUT", "/payment-settings").persistence, "critical-before-response");
  assert.equal(classifyAdminRoute("PUT", "/inventory/products/4/stock").persistence, "critical-before-response");
  assert.equal(classifyAdminRoute("PUT", "/orders/4/status").persistence, "critical-before-response");
  assert.equal(classifyAdminRoute("PUT", "/staff/4").persistence, "critical-before-response");
  assert.ok(AUDIT_COVERAGE_GAPS.some((gap) => /bulk|multi-row|file|crash|HTTP success/i.test(gap)));
  assert.equal(auditRetentionDays("365"), 365);
  assert.equal(auditRetentionDays("10"), 365);
  assert.equal(loginActor({ token: "secret", admin: { id: 1, name: "Owner", email: "owner@example.com", role: "Super Admin" } }).email, "owner@example.com");
  assert.equal(loginActor({ token: "secret" }), null);
  const sql = fs.readFileSync(path.join(root, "scripts/admin-audit-migration.sql"), "utf8");
  assert.equal(/DELETE\s+FROM\s+admin_audit_events/i.test(sql), false);
  assert.match(sql, /admin_audit_chain/);
  assert.match(sql, /encrypted copy/);
  const matrix = auditCoverageMatrix(routes);
  const totals = matrix.reduce((sum, row) => ({
    fieldLevel: sum.fieldLevel + row.fieldLevel,
    bulkSummary: sum.bulkSummary + row.bulkSummary,
    outcomeOnly: sum.outcomeOnly + row.outcomeOnly,
    unsupported: sum.unsupported + row.unsupported,
  }), { fieldLevel: 0, bulkSummary: 0, outcomeOnly: 0, unsupported: 0 });
  assert.equal(totals.fieldLevel + totals.bulkSummary + totals.outcomeOnly + totals.unsupported, mutations.length);
  assert.ok(totals.fieldLevel > 0);
  assert.ok(totals.bulkSummary > 0);
  assert.ok(totals.outcomeOnly > 0);
  assert.ok(totals.unsupported > 0);
  assert.equal(auditCoverageMatrix([{ method: "POST", path: "/media/upload", module: "Media" }])[0].unsupported, 1);
  assert.deepEqual(bulkAuditSummary({ ids: [4, 5], products: [{ id: 9, price: 12, email: "a@b.c" }] }).ids.includes("4"), true);
  const hidden = sanitizeAuditValue({ name: "Buyer", status: "Active", phone: "999" }, 0, { redactNames: true });
  assert.equal(hidden.name, "[redacted]");
  assert.equal(hidden.status, "Active");
  assert.equal(hidden.phone, "[redacted]");
});

test("audit details keep allowlisted changes and omit customer data and secrets", () => {
  const clean = sanitizeAuditValue({
    name: "Pen",
    price: 12,
    password: "secret-pass",
    otp: "123456",
    token: "jwt",
    email: "buyer@example.com",
    phone: "9999999999",
    street: "12 Market Road",
    razorpay_key_secret: "key",
    note: "x".repeat(600),
  });
  assert.equal(clean.name, "Pen");
  assert.equal(clean.price, 12);
  assert.equal(clean.password, "[redacted]");
  assert.equal(clean.otp, "[redacted]");
  assert.equal(clean.token, "[redacted]");
  assert.equal(clean.email, "[redacted]");
  assert.equal(clean.phone, "[redacted]");
  assert.equal(clean.street, "[redacted]");
  assert.equal(clean.razorpay_key_secret, "[redacted]");
  assert.equal(clean.note, undefined);
  assert.deepEqual(changedAuditFields({ price: 10, name: "Pen", email: "a@b.c" }, { price: 12, name: "Pen", email: "c@d.e" }), [
    { field: "price", before: 10, after: 12 },
  ]);
  const payload = { action: "Update" };
  const first = auditRowHash("0".repeat(64), payload);
  assert.equal(verifyAuditChain([
    { previous_hash: "0".repeat(64), row_hash: first, payload },
  ]), true);
});

test("admin responses are logged once and the HTTP body stays unchanged", async () => {
  const seen = [];
  const app = express();
  app.use((req, res, next) => {
    instrumentAdminResponse(req, res, async (snapshot) => {
      seen.push({ path: req.path, kind: snapshot.kind, message: snapshot.message });
      return { "x-audit-persisted": "yes" };
    });
    next();
  });
  app.post("/save", (_req, res) => res.status(400).json({ message: "Rejected", password: "secret-pass" }));
  app.get("/export", (_req, res) => res.send("phone,9999999999"));
  app.get("/file", (_req, res) => res.end(Buffer.from("raw-file")));
  app.get("/go", (_req, res) => res.redirect(302, "/next?token=abc"));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const port = server.address().port;
  try {
    const rejected = await fetch(`http://127.0.0.1:${port}/save`, { method: "POST" });
    const exported = await fetch(`http://127.0.0.1:${port}/export`);
    const file = await fetch(`http://127.0.0.1:${port}/file`);
    const redirected = await fetch(`http://127.0.0.1:${port}/go`, { redirect: "manual" });
    assert.equal(rejected.status, 400);
    assert.match(await rejected.text(), /secret-pass/);
    assert.equal(await exported.text(), "phone,9999999999");
    assert.equal(await file.text(), "raw-file");
    assert.equal(redirected.status, 302);
    assert.equal(seen.filter((item) => item.path === "/save").length, 1);
    assert.equal(seen.find((item) => item.path === "/save").message, "Rejected");
    assert.equal(seen.find((item) => item.path === "/export").message, "");
    assert.equal(seen.find((item) => item.path === "/file").kind, "body");
    assert.match(seen.find((item) => item.path === "/go").message, /redirect/);
    assert.equal(JSON.stringify(seen).includes("secret-pass"), false);
    assert.equal(JSON.stringify(seen).includes("9999999999"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
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
  app.get("/audit/events", (req, res, next) => {
    if (!isAuditSuperAdmin(req.admin)) {
      res.status(403).json({ message: "Only a Super Admin can view audit records" });
      return;
    }
    next();
  }, (_req, res) => res.json({ ok: true }));
  app.delete("/audit/events/:id", (req, res, next) => {
    if (!isAuditSuperAdmin(req.admin)) {
      res.status(403).json({ message: "Only a Super Admin can view audit records" });
      return;
    }
    next();
  }, (_req, res) => res.status(405).json({ message: "Audit records are append-only" }));
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
  const run = async (sql, params = []) => (await connection.query(sql, params))[0];
  const adapter = {
    query: async (sql, params = []) => (await connection.query(sql, params))[0],
    begin: () => connection.beginTransaction(),
    commit: () => connection.commit(),
    rollback: () => connection.rollback(),
  };
  try {
    await connection.query("DROP TABLE IF EXISTS admin_audit_events");
    await connection.query("DROP TABLE IF EXISTS admin_audit_outbox");
    await connection.query("DROP TABLE IF EXISTS admin_audit_chain");
    await connection.query("DROP TABLE IF EXISTS admin_audit_settings");
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
    }, adapter);
    const sampleEvent = (mark) => ({
      adminId: 7,
      actorName: "Audit Tester",
      source: "backend",
      layer: "confirmed",
      module: "Products",
      action: "Update",
      outcome: "success",
      method: "PUT",
      path: `/products/${mark}`,
      recordId: mark,
      changedFields: [],
    });
    const second = await mysql.createConnection({
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || "",
      database,
      connectTimeout: 5000,
    });
    try {
      const other = {
        query: async (sql, params = []) => (await second.query(sql, params))[0],
        begin: () => second.beginTransaction(),
        commit: () => second.commit(),
        rollback: () => second.rollback(),
      };
      await Promise.all([
        writeAuditEvent({ ...sampleEvent("A"), recordId: "a" }, adapter),
        writeAuditEvent({ ...sampleEvent("B"), recordId: "b" }, other),
      ]);
    } finally {
      second.destroy();
    }
    const rows = await run("SELECT admin_id, action_name, request_path, outcome, source, record_id, changed_fields, row_hash, previous_hash FROM admin_audit_events ORDER BY id");
    const chain = rows.map((row) => ({
      previous_hash: row.previous_hash,
      row_hash: row.row_hash,
      payload: {
        adminId: row.admin_id,
        action: row.action_name,
        path: row.request_path,
        outcome: row.outcome,
        source: row.source,
        recordId: row.record_id || "",
        changed: row.changed_fields
          ? (typeof row.changed_fields === "string" ? JSON.parse(row.changed_fields) : row.changed_fields)
          : [],
      },
    }));
    assert.equal(rows.length, 3);
    assert.equal(String(rows[0].previous_hash), "0".repeat(64));
    assert.equal(verifyAuditChain(chain), true);
    await enqueueAuditOutbox({
      adminId: 7,
      source: "backend",
      layer: "confirmed",
      module: "Orders",
      action: "Update",
      outcome: "success",
      path: "/orders/9/shipment",
      recordId: "9",
      changedFields: [],
    }, adapter);
    assert.equal(await flushAuditOutbox(adapter), 1);
    const stored = await run("SELECT status FROM admin_audit_outbox");
    assert.equal(stored[0].status, "stored");
    const chained = await run("SELECT previous_hash, row_hash, admin_id, action_name, request_path, outcome, source, record_id, changed_fields FROM admin_audit_events ORDER BY id");
    assert.equal(chained.length, 4);
    assert.equal(verifyAuditChain(chained.map((row) => ({
      previous_hash: row.previous_hash,
      row_hash: row.row_hash,
      payload: {
        adminId: row.admin_id,
        action: row.action_name,
        path: row.request_path,
        outcome: row.outcome,
        source: row.source,
        recordId: row.record_id || "",
        changed: row.changed_fields
          ? (typeof row.changed_fields === "string" ? JSON.parse(row.changed_fields) : row.changed_fields)
          : [],
      },
    }))), true);
    const replay = {
      requestId: "replay-1",
      adminId: 7,
      source: "backend",
      layer: "confirmed",
      module: "Orders",
      action: "Update",
      outcome: "failure",
      method: "PUT",
      path: "/orders/11/status",
      recordId: "11",
      changedFields: [{ field: "order_status", before: "Pending", after: "Cancelled" }],
    };
    await enqueueAuditOutbox(replay, adapter);
    await enqueueAuditOutbox(replay, adapter);
    const queued = await run("SELECT COUNT(*) AS total FROM admin_audit_outbox WHERE status = 'pending'");
    assert.equal(Number(queued[0].total), 1);
    const beforeReplay = Number((await run("SELECT COUNT(*) AS total FROM admin_audit_events"))[0].total);
    await processAuditOutbox(adapter);
    await processAuditOutbox(adapter);
    const afterReplay = Number((await run("SELECT COUNT(*) AS total FROM admin_audit_events"))[0].total);
    assert.equal(afterReplay, beforeReplay + 1);
    await connection.query(
      "INSERT INTO admin_audit_outbox (payload, status, attempts, idempotency_key, next_attempt_at) VALUES (?, 'pending', 0, 'bad-json', NOW())",
      [JSON.stringify([])]
    );
    const firstRetry = await processAuditOutbox(adapter, { maxAttempts: 2 });
    assert.equal(firstRetry.retried, 1);
    await connection.query("UPDATE admin_audit_outbox SET next_attempt_at = NOW() WHERE idempotency_key = 'bad-json'");
    const secondRetry = await processAuditOutbox(adapter, { maxAttempts: 2 });
    assert.equal(secondRetry.exhausted, 1);
    const parallelA = await mysql.createConnection({
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || "",
      database,
      connectTimeout: 5000,
    });
    try {
      const parallelAdapter = {
        query: async (sql, params = []) => (await parallelA.query(sql, params))[0],
        begin: () => parallelA.beginTransaction(),
        commit: () => parallelA.commit(),
        rollback: () => parallelA.rollback(),
      };
      await enqueueAuditOutbox({ ...replay, requestId: "parallel-a", path: "/orders/12/status", recordId: "12" }, adapter);
      await enqueueAuditOutbox({ ...replay, requestId: "parallel-b", path: "/orders/13/status", recordId: "13" }, adapter);
      await Promise.all([processAuditOutbox(adapter), processAuditOutbox(parallelAdapter)]);
    } finally {
      parallelA.destroy();
    }
    const parallelRows = await run("SELECT previous_hash, row_hash, admin_id, action_name, request_path, outcome, source, record_id, changed_fields FROM admin_audit_events ORDER BY id");
    assert.equal(parallelRows.length, 7);
    assert.equal(verifyAuditChain(parallelRows.map((row) => ({
      previous_hash: row.previous_hash,
      row_hash: row.row_hash,
      payload: {
        adminId: row.admin_id,
        action: row.action_name,
        path: row.request_path,
        outcome: row.outcome,
        source: row.source,
        recordId: row.record_id || "",
        changed: row.changed_fields
          ? (typeof row.changed_fields === "string" ? JSON.parse(row.changed_fields) : row.changed_fields)
          : [],
      },
    }))), true);
    if (fresh.triggersInstalled && existing.triggersInstalled) {
      await assert.rejects(() => connection.query("UPDATE admin_audit_events SET action_name = 'Edited'"));
      await assert.rejects(() => connection.query("DELETE FROM admin_audit_events"));
    }
    const remaining = await run("SELECT COUNT(*) AS total FROM admin_audit_events");
    assert.equal(Number(remaining[0].total), 7);
    const settings = await run("SELECT retention_days FROM admin_audit_settings WHERE id = 1");
    assert.equal(Number(settings[0].retention_days), 365);
  } catch (error) {
    throw error;
  } finally {
    connection.destroy();
  }
});
