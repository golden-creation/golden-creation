import fs from "fs";
import os from "os";
import path from "path";
import test from "node:test";
import assert from "node:assert/strict";
import { sendTransactionalEmail } from "../services/email.service.js";
import { loadConfiguration } from "../config/load-env.js";
import {
  isolatedTestFailures,
  listenHost,
  productionDatabaseFailures,
  safeIsolatedTestEnv,
  startupJobsEnabled,
} from "../config/runtime-safety.js";
import { rateLimit } from "../middleware/rate-limit.js";

function writeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gc-env-"));
  fs.writeFileSync(
    path.join(dir, ".env"),
    "RAZORPAY_KEY_ID=live-key\nDB_NAME=goldencreation_db\nMAILER_CLOUD_ENABLED=true\n"
  );
  const testFile = path.join(dir, ".env.test");
  fs.writeFileSync(
    testFile,
    [
      "GC_ISOLATED_TEST=true",
      "PORT=5001",
      "DB_HOST=127.0.0.1",
      "DB_USER=gc_restore",
      "DB_PASSWORD=test-only",
      "DB_NAME=goldencreation_restore_20261122T142649Z",
      "RUN_STARTUP_JOBS=false",
      "MAILER_CLOUD_ENABLED=false",
      "NIMBUS_SMS_ENABLED=false",
      "RAZORPAY_KEY_ID=",
    ].join("\n")
  );
  return { dir, testFile };
}

test("startup jobs run unless RUN_STARTUP_JOBS is false", () => {
  assert.equal(startupJobsEnabled({}), true);
  assert.equal(startupJobsEnabled({ RUN_STARTUP_JOBS: "true" }), true);
  assert.equal(startupJobsEnabled({ RUN_STARTUP_JOBS: "false" }), false);
  assert.equal(startupJobsEnabled({ RUN_STARTUP_JOBS: "off" }), false);
});

test("production keeps the existing listen behavior", () => {
  assert.equal(listenHost({}), null);
  assert.equal(listenHost({ PORT: "5000" }), null);
});

test("isolated test binds only to localhost and accepts the safe configuration", () => {
  const env = safeIsolatedTestEnv();
  assert.equal(listenHost(env), "127.0.0.1");
  assert.deepEqual(isolatedTestFailures(env), []);
});

test("isolated test refuses production database, payments, mail, sms, and storage", () => {
  const cases = [
    [{ PORT: "5000" }, "PORT must be 5001"],
    [{ DB_USER: "root" }, "DB_USER must be gc_restore"],
    [{ DB_NAME: "goldencreation_db" }, "DB_NAME must be goldencreation_restore_20261122T142649Z"],
    [{ DB_HOST: "187.127.169.81" }, "DB_HOST must be local"],
    [{ RUN_STARTUP_JOBS: "true" }, "RUN_STARTUP_JOBS must be false"],
    [{ RAZORPAY_KEY_ID: "pay" }, "RAZORPAY_KEY_ID must be empty"],
    [{ RAZORPAY_KEY_SECRET: "secret" }, "RAZORPAY_KEY_SECRET must be empty"],
    [{ RAZORPAY_WEBHOOK_SECRET: "hook" }, "RAZORPAY_WEBHOOK_SECRET must be empty"],
    [{ MAILER_CLOUD_ENABLED: "true" }, "MAILER_CLOUD_ENABLED must be false"],
    [{ NIMBUS_SMS_ENABLED: "" }, "NIMBUS_SMS_ENABLED must be false"],
    [{ DO_SPACES_SECRET_KEY: "space" }, "DO_SPACES_SECRET_KEY must be empty"],
  ];
  for (const [overrides, message] of cases) {
    const failures = isolatedTestFailures(safeIsolatedTestEnv(overrides));
    assert.ok(failures.includes(message), failures.join("; "));
  }
});

test("isolated configuration does not merge a production .env or inherited secrets", () => {
  const { dir, testFile } = writeFixture();
  const env = {
    GC_ISOLATED_TEST: "true",
    DOTENV_CONFIG_PATH: testFile,
    DB_NAME: "goldencreation_db",
    RAZORPAY_KEY_SECRET: "inherited-secret",
    DO_SPACES_SECRET_KEY: "inherited-space",
    MAILER_CLOUD_SMTP_PASSWORD: "inherited-mail",
  };
  const result = loadConfiguration(env, { cwd: dir });
  assert.equal(result.mode, "isolated");
  assert.equal(env.DB_NAME, "goldencreation_restore_20261122T142649Z");
  assert.equal(env.RAZORPAY_KEY_ID, "");
  assert.equal(env.RAZORPAY_KEY_SECRET, "");
  assert.equal(env.DO_SPACES_SECRET_KEY, "");
  assert.equal(env.MAILER_CLOUD_SMTP_PASSWORD, "");
  assert.equal(env.MAILER_CLOUD_ENABLED, "false");
  assert.deepEqual(isolatedTestFailures(env), []);
});

test("isolated configuration refuses the production .env filename", () => {
  const { dir } = writeFixture();
  assert.throws(
    () => loadConfiguration(
      { GC_ISOLATED_TEST: "true", DOTENV_CONFIG_PATH: path.join(dir, ".env") },
      { cwd: dir }
    ),
    /production \.env/
  );
});

test("default configuration does not override variables already set", () => {
  const { dir } = writeFixture();
  const env = { DB_NAME: "lekhanmart_itest" };
  loadConfiguration(env, { cwd: dir });
  assert.equal(env.DB_NAME, "lekhanmart_itest");
  assert.equal(env.RAZORPAY_KEY_ID, "live-key");
});

test("MAILER_CLOUD_ENABLED=false does not send transactional email", async () => {
  const keys = [
    "MAILER_CLOUD_ENABLED",
    "MAILER_CLOUD_SMTP_HOST",
    "MAILER_CLOUD_SMTP_USER",
    "MAILER_CLOUD_SMTP_PASSWORD",
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASSWORD",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.MAILER_CLOUD_ENABLED = "false";
  process.env.MAILER_CLOUD_SMTP_HOST = "smtp.example.test";
  process.env.MAILER_CLOUD_SMTP_USER = "mailer";
  process.env.MAILER_CLOUD_SMTP_PASSWORD = "not-a-real-password";
  process.env.SMTP_HOST = "smtp.example.test";
  process.env.SMTP_USER = "mailer";
  process.env.SMTP_PASSWORD = "not-a-real-password";
  try {
    const result = await sendTransactionalEmail({
      to: "person@example.test",
      subject: "Safety check",
      text: "This message must not leave the process.",
    });
    assert.deepEqual(result, { skipped: true, reason: "MailerCloud SMTP is disabled" });
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("production refuses a missing, local, restore, or test database configuration", () => {
  assert.deepEqual(productionDatabaseFailures({ NODE_ENV: "development", DB_NAME: "lekhanmart" }), []);
  assert.ok(productionDatabaseFailures({ NODE_ENV: "production" }).includes("DB_NAME is required in production"));
  for (const name of ["lekhanmart", "lekhanmart_itest", "goldencreation_restore_20261122T142649Z"]) {
    const failures = productionDatabaseFailures({ NODE_ENV: "production", DB_NAME: name });
    assert.ok(failures.includes("DB_NAME must be goldencreation_db"), failures.join("; "));
  }
  const blocked = productionDatabaseFailures({
    NODE_ENV: "production",
    DB_NAME: "goldencreation_db",
    DB_USER: "gc_restore",
    GC_ISOLATED_TEST: "true",
    DOTENV_CONFIG_PATH: "/opt/goldencreation/test-config/.env.test",
  });
  assert.ok(blocked.includes("gc_restore cannot be used in production"));
  assert.ok(blocked.includes("GC_ISOLATED_TEST must not be enabled in production"));
  assert.ok(blocked.includes("A test configuration file cannot be used in production"));
  assert.deepEqual(productionDatabaseFailures({
    NODE_ENV: "production",
    DB_NAME: "goldencreation_db",
    DB_USER: "goldencreation_user",
  }), []);
});

test("sensitive routes are rate limited without blocking a normal request", () => {
  const limit = rateLimit({ windowMs: 1000, max: 1 });
  const req = { ip: "127.0.0.1", baseUrl: "/api/auth", path: "/login" };
  let status = 0;
  const res = {
    set() {},
    status(code) { status = code; return this; },
    json() { return this; },
  };
  let passed = 0;
  limit(req, res, () => { passed += 1; });
  limit(req, res, () => { passed += 1; });
  assert.equal(passed, 1);
  assert.equal(status, 429);
});

test("server.js keeps production listening and gates the startup jobs", () => {
  const source = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(source, /if \(startupJobsEnabled\(process\.env\)\)/);
  assert.match(source, /app\.listen\(PORT, host, onListen\)/);
  assert.match(source, /app\.listen\(PORT, onListen\)/);
});
