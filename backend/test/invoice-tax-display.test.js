import test from "node:test";
import assert from "node:assert/strict";
import {
  additionalTaxTotal,
  includedTaxTotal,
  splitInvoiceTax,
} from "../services/invoice-tax-display.js";

test("inclusive GST is displayed from the stored component and is not added again", () => {
  const item = {
    gst_inclusive: 1,
    gst_rate: 18,
    gst_amount: 109.83,
    line_total: 800,
  };
  const line = splitInvoiceTax(item);

  assert.equal(line.includedTax, 109.83);
  assert.equal(line.additionalTax, 0);
  assert.equal(line.cgstRate, 9);
  assert.equal(line.cgstAmount, 54.91);
  assert.equal(line.sgstAmount, 54.92);
  assert.equal(line.cgstAmount + line.sgstAmount, 109.83);
  assert.equal(additionalTaxTotal([item]), 0);
  assert.equal(includedTaxTotal([item]), 109.83);
  assert.equal(Number((800 - 80 + 40 + line.additionalTax).toFixed(2)), 760);
});

test("exclusive GST remains additional tax", () => {
  const item = {
    gst_inclusive: 0,
    gst_rate: 18,
    line_total: 800,
  };
  const line = splitInvoiceTax(item);

  assert.equal(line.includedTax, 0);
  assert.equal(line.additionalTax, 144);
  assert.equal(additionalTaxTotal([item]), 144);
});
