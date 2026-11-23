import assert from "node:assert/strict";
import test from "node:test";
import { resolveProductOffer, sellingPriceFromMrp } from "../../frontend/src/lib/productOffer.js";
import { formatBlockValue, sanitizeBlogHtml } from "../../saas-panel/src/lib/blogEditor.js";

test("a 20 percent product discount prices 1000 as 800 and saves 200", () => {
  assert.equal(sellingPriceFromMrp(1000, 20), 800);
  const offer = resolveProductOffer({ price: 800, mrp: 1000, percent: 20 });
  assert.equal(offer.sellingPrice, 800);
  assert.equal(offer.mrp, 1000);
  assert.equal(offer.percent, 20);
  assert.equal(offer.savings, 200);
  assert.equal(offer.active, true);
});

test("product discount is not applied when compare price is missing or not higher", () => {
  assert.equal(resolveProductOffer({ price: 1000 }).active, false);
  assert.equal(resolveProductOffer({ price: 1000, comparePrice: 900 }).active, false);
  assert.equal(sellingPriceFromMrp(1000, 0), null);
  assert.equal(sellingPriceFromMrp(1000, 100), null);
});

test("blog formatting uses real block tags and strips active content", () => {
  assert.equal(formatBlockValue("h1"), "<h1>");
  assert.equal(formatBlockValue("blockquote"), "<blockquote>");
  const clean = sanitizeBlogHtml(`<p onclick="bad()">Hello</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>`);
  assert.equal(clean.includes("script"), false);
  assert.equal(clean.includes("onclick"), false);
  assert.equal(clean.includes("javascript:"), false);
  assert.equal(clean.includes("<p>Hello</p>"), true);
});
