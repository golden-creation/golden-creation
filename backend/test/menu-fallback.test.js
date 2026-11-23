import assert from "node:assert/strict";
import test from "node:test";

import { canUseDevelopmentMenuFallback, loadDevelopmentNavbar } from "../services/menu-fallback.js";

test("development menu fallback stays off in production", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  assert.equal(canUseDevelopmentMenuFallback(), false);
  process.env.NODE_ENV = previous;
});

test("local navbar snapshot matches the public live menu order", () => {
  const titles = loadDevelopmentNavbar().map((item) => item.title);

  assert.deepEqual(titles, [
    "Art & Craft",
    "Computer & Electronics Accessories",
    "Office Stationery",
    "School Stationery",
    "All Products",
    "Shop Bundles",
    "Corporate Orders",
    "Shop By Brand",
  ]);
  assert.equal(titles.includes("Premium Pens"), false);
  assert.equal(titles.includes("Trending Items"), false);
  assert.equal(loadDevelopmentNavbar().at(-1).url, "/brands");
  assert.equal(loadDevelopmentNavbar().at(-1).mega_menu, true);
});
