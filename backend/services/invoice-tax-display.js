function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

export function splitInvoiceTax(item = {}) {
  const gstInclusive = Boolean(Number(item.gst_inclusive ?? item.gstInclusive ?? 1));
  const quantity = Number(item.quantity || 1);
  const lineAmount = Number(
    item.line_total ?? item.lineTotal ?? quantity * Number(item.price || 0)
  );
  const gstRate = Number(item.gst_rate ?? item.gstRate ?? 0);
  const stored = Number(item.gst_amount ?? item.gstAmount ?? 0);
  const component = roundMoney(
    gstInclusive ? stored : stored || (lineAmount * gstRate) / 100
  );
  const cgstAmount = roundMoney(component / 2);
  const sgstAmount = roundMoney(component - cgstAmount);

  return {
    gstInclusive,
    gstRate,
    includedTax: gstInclusive ? component : 0,
    additionalTax: gstInclusive ? 0 : component,
    taxAmount: component,
    cgstRate: gstRate / 2,
    sgstRate: gstRate / 2,
    cgstAmount,
    sgstAmount,
  };
}

export function includedTaxTotal(items = []) {
  return roundMoney(items.reduce((sum, item) => sum + splitInvoiceTax(item).includedTax, 0));
}

export function additionalTaxTotal(items = []) {
  return roundMoney(items.reduce((sum, item) => sum + splitInvoiceTax(item).additionalTax, 0));
}
