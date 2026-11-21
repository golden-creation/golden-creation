import assert from "node:assert/strict";
import test from "node:test";

import {
  canUseDevelopmentBrandFallback,
  findDevelopmentBrand,
  isDatabaseUnavailable,
  loadDevelopmentBrandCatalog,
  queryDevelopmentBrands,
} from "../services/brand-fallback.js";

test("database outages are recognized without treating query bugs as outages", () => {
  assert.equal(isDatabaseUnavailable({ code: "ECONNREFUSED" }), true);
  assert.equal(isDatabaseUnavailable({ errors: [{ code: "ECONNREFUSED" }] }), true);
  assert.equal(isDatabaseUnavailable({ code: "ER_BAD_FIELD_ERROR" }), false);
});

test("development brand fallback stays off in production", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  assert.equal(canUseDevelopmentBrandFallback(), false);
  process.env.NODE_ENV = previous;
});

test("a 100-item page ends at TVS and the next page keeps U through Z", () => {
  const catalog = loadDevelopmentBrandCatalog();
  const firstPage = queryDevelopmentBrands(catalog, { limit: 100, sort: "name", page: 1 }, { publicOnly: true });
  const secondPage = queryDevelopmentBrands(catalog, { limit: 100, sort: "name", page: 2 }, { publicOnly: true });

  assert.equal(firstPage.pagination.total, 108);
  assert.equal(firstPage.brands.at(-1).name, "TVS");
  assert.deepEqual(
    secondPage.brands.map((brand) => brand.name),
    ["Uniball", "Unomax", "V-Cube", "Victorinox", "Waterman", "Zebion", "ZEBRA", "Zoook"]
  );
  assert.equal(findDevelopmentBrand(catalog, "zoook")?.name, "Zoook");
});

test("an uncapped name sort returns every active brand once, from 3M through Zoook", () => {
  const catalog = loadDevelopmentBrandCatalog();
  const payload = queryDevelopmentBrands(catalog, { limit: 500, sort: "name" }, { publicOnly: true });
  const names = payload.brands.map((brand) => brand.name);

  assert.equal(payload.brands.length, 108);
  assert.equal(names[0], "3M");
  assert.equal(names.at(-1), "Zoook");
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(names, [...names].sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base", numeric: true })));
});
