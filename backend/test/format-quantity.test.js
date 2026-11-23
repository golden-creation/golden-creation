import assert from "node:assert/strict";
import test from "node:test";
import { formatQuantity, quantityFieldValue } from "../../saas-panel/src/lib/formatQuantity.js";

test("whole-number quantities drop trailing decimal zeros", () => {
  assert.equal(formatQuantity("1.0000"), "1");
  assert.equal(formatQuantity("2.0000"), "2");
  assert.equal(formatQuantity("0.0000"), "0");
  assert.equal(formatQuantity("25.0000"), "25");
  assert.equal(formatQuantity("100.0000"), "100");
  assert.equal(formatQuantity(5), "5");
});

test("fractional quantities keep significant digits", () => {
  assert.equal(formatQuantity("1.5000"), "1.5");
  assert.equal(formatQuantity("2.2500"), "2.25");
  assert.equal(formatQuantity("1.2300"), "1.23");
});

test("null and invalid quantities stay blank", () => {
  assert.equal(formatQuantity(null), "");
  assert.equal(formatQuantity(undefined), "");
  assert.equal(formatQuantity(""), "");
  assert.equal(formatQuantity("abc"), "");
  assert.equal(formatQuantity("1.0000abc"), "");
  assert.equal(formatQuantity(Number.NaN), "");
});

test("quantity inputs strip stored trailing zeros without blocking a typed fraction", () => {
  assert.equal(quantityFieldValue("1.0000"), "1");
  assert.equal(quantityFieldValue("1.5000"), "1.5");
  assert.equal(quantityFieldValue("2.2500"), "2.25");
  assert.equal(quantityFieldValue("1."), "1.");
  assert.equal(quantityFieldValue("1.0"), "1.0");
  assert.equal(quantityFieldValue(null), "");
});
