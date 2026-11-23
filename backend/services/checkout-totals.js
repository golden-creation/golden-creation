export function toMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Number(amount.toFixed(2));
}

export function sellingLineTotal({ price, quantity }) {
  return toMoney(Number(price) * Number(quantity || 0));
}

export function composeCheckoutTotal({
  subtotal = 0,
  productDiscountAmount = 0,
  shippingFee = 0,
  shippingDiscountAmount = 0,
  taxAmount = 0,
} = {}) {
  const merchandise = toMoney(Math.max(0, Number(subtotal) - Number(productDiscountAmount || 0)));
  const shipping = toMoney(Math.max(0, Number(shippingFee || 0) - Number(shippingDiscountAmount || 0)));
  const tax = toMoney(taxAmount);
  return {
    subtotal: toMoney(subtotal),
    productDiscountAmount: toMoney(productDiscountAmount),
    discountedSubtotal: merchandise,
    shippingFee: shipping,
    taxAmount: tax,
    totalAmount: toMoney(merchandise + shipping + tax),
  };
}

export function categoryGstTotal(items = [], rateByCategory = new Map(), discountedSubtotal = 0, subtotal = 0) {
  if (!(subtotal > 0)) {
    return { total: 0, items: items.map((item) => ({ ...item, gstRate: 0, gstAmount: 0 })) };
  }
  const ratio = Number(discountedSubtotal) / Number(subtotal);
  let additionalTax = 0;
  const nextItems = items.map((item) => {
    const components = item.taxComponents || [];
    const exclusive = components.filter((component) => !component.gstInclusive);
    const inclusive = components.filter((component) => component.gstInclusive);
    const rateFor = (component) => Number(rateByCategory.get(Number(component.categoryId)) || 0);
    const gstRate = components.reduce((maximum, component) => Math.max(maximum, rateFor(component)), 0);
    const addedAmount = toMoney(
      exclusive.reduce((sum, component) => sum + Number(component.amount || 0) * ratio * (rateFor(component) / 100), 0)
    );
    const includedAmount = toMoney(
      inclusive.reduce((sum, component) => {
        const rate = rateFor(component);
        return sum + Number(component.amount || 0) * ratio * (rate / (100 + rate));
      }, 0)
    );
    additionalTax += addedAmount;
    return { ...item, gstRate, gstAmount: toMoney(addedAmount + includedAmount) };
  });
  return { total: toMoney(additionalTax), items: nextItems };
}

export function razorpayAmountPaise(amountRupees) {
  return Math.round(toMoney(amountRupees) * 100);
}

export function paymentAmountConsistent(orderTotal, gatewayRupees) {
  return Math.abs(toMoney(orderTotal) - toMoney(gatewayRupees)) <= 0.01;
}

export function acceptLatestQuote(requestId, latestRequestId, quote) {
  if (requestId !== latestRequestId) return null;
  return quote || null;
}
