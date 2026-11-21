import assert from "node:assert/strict";
import test from "node:test";

import { resolveBrandListLimit } from "../services/brand-query.js";

test("public brand list limit includes catalogs larger than 100", () => {
  assert.equal(resolveBrandListLimit(undefined), 24);
  assert.equal(resolveBrandListLimit(0), 24);
  assert.equal(resolveBrandListLimit(100), 100);
  assert.equal(resolveBrandListLimit(120), 120);
  assert.equal(resolveBrandListLimit(500), 500);
  assert.equal(resolveBrandListLimit(5000), 500);
  assert.equal(resolveBrandListLimit("108"), 108);
});
