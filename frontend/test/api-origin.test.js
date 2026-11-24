import assert from "node:assert/strict";
import test from "node:test";
import { resolveProductionApiBase, resolveProductionSiteBase } from "../src/lib/apiOrigin.js";
import { resolveProductionApiBase as resolveAdminApiBase } from "../../saas-panel/src/lib/apiOrigin.js";

const productionOrigin = "https://www.goldencreation.in";

test("production storefront uses same-origin /api when configuration is missing or local", () => {
  for (const configured of ["", "http://localhost:5000/api", "http://127.0.0.1:5000/api"]) {
    assert.equal(resolveProductionApiBase({ configured }), "/api");
  }
  assert.equal(
    resolveProductionSiteBase({ configured: "http://localhost:5000", origin: productionOrigin }),
    productionOrigin
  );
  assert.equal(resolveProductionSiteBase({ configured: "", origin: productionOrigin }), productionOrigin);
});

test("production admin uses same-origin /api when configuration is missing or local", () => {
  for (const configured of ["", "http://localhost:5000/api", "http://127.0.0.1:5000/api"]) {
    assert.equal(resolveAdminApiBase({ configured }), "/api");
  }
});

test("an explicit public API origin is preserved", () => {
  assert.equal(
    resolveProductionApiBase({ configured: "https://www.goldencreation.in/api" }),
    "https://www.goldencreation.in/api"
  );
  assert.equal(
    resolveAdminApiBase({ configured: "https://admin.goldencreation.in/api" }),
    "https://admin.goldencreation.in/api"
  );
});

test("catalog requests stay on the page origin", () => {
  const apiBase = resolveProductionApiBase({ configured: "http://localhost:5000/api" });
  const requests = ["/categories", "/products", "/brands?limit=100", "/menus/navbar"].map(
    (path) => new URL(apiBase + path, productionOrigin).href
  );
  assert.deepEqual(requests, [
    "https://www.goldencreation.in/api/categories",
    "https://www.goldencreation.in/api/products",
    "https://www.goldencreation.in/api/brands?limit=100",
    "https://www.goldencreation.in/api/menus/navbar",
  ]);
});
