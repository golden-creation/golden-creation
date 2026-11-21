import assert from "node:assert/strict";
import test from "node:test";

import {
  appendUniqueBrands,
  brandMenuChildren,
  brandsForMenu,
  hasAnotherBrandPage,
} from "./brandCatalog.js";

test("brand pages keep names after the first 100 and drop duplicates", () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    id: index + 1,
    name: `Brand ${String(index).padStart(3, "0")}`,
    slug: `brand-${index}`,
    status: "Active",
  }));
  firstPage[99] = { id: 100, name: "TVS", slug: "tvs", status: "Active" };

  const secondPage = [
    { id: 100, name: "TVS", slug: "tvs", status: "Active" },
    { id: 101, name: "Uniball", slug: "uniball", status: "Active" },
    { id: 108, name: "Zoook", slug: "zoook", status: "Active" },
    { id: 109, name: "Hidden", slug: "hidden", status: "Inactive" },
  ];

  assert.equal(hasAnotherBrandPage({ total: 108, page: 1, limit: 100 }, firstPage.length), true);

  const merged = appendUniqueBrands(firstPage, secondPage);
  assert.equal(merged.added, 3);
  assert.equal(merged.brands.length, 103);
  assert.equal(hasAnotherBrandPage({ total: 108, page: 2, limit: 100 }, merged.brands.length), true);
  assert.equal(hasAnotherBrandPage({ total: merged.brands.length, page: 2, limit: 100 }, merged.brands.length), false);

  const menu = brandMenuChildren(merged.brands);
  assert.equal(menu.some((item) => item.title === "Zoook"), true);
  assert.equal(menu.some((item) => item.title === "Uniball"), true);
  assert.equal(menu.some((item) => item.title === "Hidden"), false);
  assert.equal(menu.filter((item) => item.title === "TVS").length, 1);
  assert.equal(menu.at(-1).title, "Zoook");
  assert.equal(menu.find((item) => item.title === "Zoook").url, "/brand/zoook");
});

test("menu brands stay alphabetical when pages arrive out of order", () => {
  const brands = brandsForMenu([
    { id: 2, name: "zebra", slug: "zebra", status: "Active" },
    { id: 1, name: "Apsara", slug: "apsara", status: "Active" },
    { id: 3, name: "3M", slug: "3m", status: "Active" },
  ]);

  assert.deepEqual(
    brands.map((brand) => brand.name),
    ["3M", "Apsara", "zebra"]
  );
});

test("a brand without a slug still links to its collection filter", () => {
  const [item] = brandMenuChildren([{ id: 4, name: "Camlin", status: "Active" }]);
  assert.equal(item.url, "/writing-essentials?brands=Camlin");
});
