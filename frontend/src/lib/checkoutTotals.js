export function presentCheckoutAmounts(quote, { loading = false, error = "" } = {}) {
  if (loading || !quote) {
    return {
      ready: false,
      unavailable: Boolean(error) && !loading,
      shippingConfirmed: false,
      shippingLabel: loading ? "Calculating..." : "Calculated at checkout",
      taxLabel: loading ? "Calculating..." : "Calculated at checkout",
      totalLabel: loading ? "Calculating..." : "Calculated at checkout",
      shippingAmount: null,
      taxAmount: null,
      totalAmount: null,
    };
  }

  const shippingAmount = Number(quote.shippingFee);
  const taxAmount = Number(quote.taxAmount || 0);
  const totalAmount = Number(quote.totalAmount);
  return {
    ready: Number.isFinite(totalAmount),
    shippingConfirmed: Number.isFinite(shippingAmount),
    shippingLabel: Number.isFinite(shippingAmount) ? "" : "Calculated at checkout",
    shippingAmount: Number.isFinite(shippingAmount) ? shippingAmount : null,
    taxLabel: taxAmount > 0 ? "" : "Included",
    taxAmount,
    totalLabel: "",
    totalAmount: Number.isFinite(totalAmount) ? totalAmount : null,
    subtotal: Number(quote.subtotal),
    discountAmount: Number(quote.discountAmount || 0),
  };
}

export function acceptLatestQuote(requestId, latestRequestId, quote) {
  if (requestId !== latestRequestId) return null;
  return quote || null;
}
