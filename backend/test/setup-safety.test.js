import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { seedAdminModuleData } from "../scripts/admin-module-seed.js";
import { dataSeedAuthorized, dataSeedRefusalReason, refuseProductionSchemaTarget } from "../scripts/setup-safety.js";

const scriptsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts");

function source(name) {
  return fs.readFileSync(path.join(scriptsDir, name), "utf8");
}

test("production never authorizes data seed, even with the flag", () => {
  assert.equal(dataSeedAuthorized({ NODE_ENV: "production", ALLOW_DATA_SEED: "yes" }), false);
  assert.match(dataSeedRefusalReason({ NODE_ENV: "production", ALLOW_DATA_SEED: "yes" }), /production/);
});

test("local seed requires the explicit flag", () => {
  assert.equal(dataSeedAuthorized({ NODE_ENV: "development" }), false);
  assert.equal(dataSeedAuthorized({ NODE_ENV: "development", SEED_DEMO_DATA: "yes" }), false);
  assert.equal(dataSeedAuthorized({ NODE_ENV: "development", ALLOW_DATA_SEED: "yes" }), true);
  assert.equal(dataSeedAuthorized({ ALLOW_DATA_SEED: "YES" }), true);
});

test("schema setup refuses the production database", () => {
  assert.throws(() => refuseProductionSchemaTarget({ DB_NAME: "goldencreation_db" }), /goldencreation_db/);
  assert.doesNotThrow(() => refuseProductionSchemaTarget({ DB_NAME: "gc_ci" }));
  assert.doesNotThrow(() => refuseProductionSchemaTarget({ DB_NAME: "lekhanmart_itest" }));
});

test("unauthorized seed does not execute a query", async () => {
  let queries = 0;
  await assert.rejects(
    () => seedAdminModuleData({
      query() {
        queries += 1;
        return Promise.resolve([[]]);
      },
    }, { NODE_ENV: "production", ALLOW_DATA_SEED: "yes" }),
    (error) => error.code === "DATA_SEED_REFUSED"
  );
  assert.equal(queries, 0);
});

test("normal schema file does not contain the warehouse delete or menu overwrite", () => {
  const schema = source("ensure-admin-modules-schema.js");
  assert.equal(schema.includes("DELETE FROM warehouse_locations"), false);
  assert.equal(schema.includes("UPDATE menus"), false);
  assert.equal(schema.includes("DELETE FROM shipping_rules"), false);
  assert.equal(schema.includes("DELETE FROM discounts"), false);
  assert.match(schema, /if \(allowDataSeed\) \{\s*await seedAdminModuleData\(db\);/);
  assert.match(schema, /allowDataWrites: allowDataSeed/);
});

test("destructive statements live only in the authorized seed module", () => {
  const seed = source("admin-module-seed.js");
  assert.match(seed, /if \(!dataSeedAuthorized\(env\)\)/);
  assert.match(seed, /DELETE FROM warehouse_locations WHERE code <> 'WH-GGN'/);
  assert.match(seed, /UPDATE menus/);
  assert.match(seed, /DELETE FROM shipping_rules/);
});

test("expansion and seo data writes are behind allowDataWrites", () => {
  const expansion = source("ensure-expansion-schema.js");
  const seo = source("ensure-seo-schema.js");
  assert.match(expansion, /allowDataWrites = false/);
  assert.match(expansion, /if \(allowDataWrites\) \{[\s\S]*UPDATE products SET reorder_level = 0/);
  assert.match(expansion, /if \(allowDataWrites\) \{[\s\S]*UPDATE orders SET order_status = 'Dispatched'/);
  assert.match(seo, /if \(allowDataWrites\) \{[\s\S]*backfillProductSlugs/);
  assert.equal(seo.includes("allowDataWrites = false") || seo.includes("allowDataWrites === true"), true);
});
