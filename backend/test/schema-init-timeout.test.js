import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promiseQueryRows } from "../scripts/admin-audit-schema.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "../scripts/ensure-admin-modules-schema.js");

test("promise schema adapter returns rows without a callback", async () => {
  const connection = {
    query(sql, params, callback) {
      if (typeof params === "function" || typeof callback === "function") {
        return undefined;
      }
      return Promise.resolve([[{ total: 1 }], []]);
    },
  };
  const hanging = new Promise((resolve, reject) => {
    connection.query("SELECT 1", [], (error, results) => (error ? reject(error) : resolve(results)));
  });
  const winner = await Promise.race([
    hanging.then(() => "settled"),
    new Promise((resolve) => setTimeout(() => resolve("hung"), 200)),
  ]);
  assert.equal(winner, "hung");
  const rows = await promiseQueryRows(connection, "SELECT 1", []);
  assert.equal(rows[0].total, 1);
});

test("schema entry closes the promise connection and bounds the wait", () => {
  const source = fs.readFileSync(script, "utf8");
  assert.equal(source.includes("db.query(sql, params, (error, results)"), false);
  assert.match(source, /promiseQueryRows/);
  assert.match(source, /finally/);
  assert.match(source, /schema_init TIMEOUT/);
  const commerce = fs.readFileSync(path.join(here, "../scripts/ensure-commerce-media-schema.js"), "utf8");
  const referral = fs.readFileSync(path.join(here, "../scripts/ensure-referral-affiliate-schema.js"), "utf8");
  assert.match(commerce, /from "\.\.\/config\/db\.js"/);
  assert.match(referral, /from "\.\.\/config\/db\.js"/);
  assert.equal(commerce.includes("mysql2/promise"), false);
  assert.equal(referral.includes("mysql2/promise"), false);
});

test("schema initialization exits before its timeout", { timeout: 150000 }, async (t) => {
  const name = process.env.SCHEMA_INIT_TEST_DB || (process.env.DB_NAME === "gc_ci" ? "gc_ci" : "");
  if (!name || name === "goldencreation_db" || name === "lekhanmart") {
    t.skip("isolated schema database is not configured");
    return;
  }
  const child = spawn(process.execPath, [script], {
    cwd: path.join(here, ".."),
    env: {
      ...process.env,
      NODE_ENV: "development",
      ALLOW_DATA_SEED: "no",
      DB_HOST: process.env.SCHEMA_INIT_DB_HOST || process.env.DB_HOST || "127.0.0.1",
      DB_PORT: process.env.SCHEMA_INIT_DB_PORT || process.env.DB_PORT || "3306",
      DB_USER: process.env.SCHEMA_INIT_DB_USER || process.env.DB_USER || "root",
      DB_PASSWORD: process.env.SCHEMA_INIT_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "",
      DB_NAME: name,
      SCHEMA_INIT_TIMEOUT_MS: "120000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const code = await new Promise((resolve, reject) => {
    const killer = setTimeout(() => {
      child.kill();
      reject(new Error(`schema initialization hung\n${output}`));
    }, 130000);
    child.on("exit", (status) => {
      clearTimeout(killer);
      resolve(status);
    });
  });
  assert.equal(code, 0, output);
  assert.match(output, /schema_init_exit=0/);
  assert.match(output, /Data seed skipped/);
});
