import db from "../config/db.js";

function dbQuery(sql, values = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, values, (error, results) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(results);
    });
  });
}

function cleanString(value) {
  return String(value || "").trim();
}

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function parseJson(value, fallbackValue = {}) {
  if (!value) return fallbackValue;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallbackValue;
  }
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => Number(item)).filter(Boolean);
}

function normalizeTextList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanString(item).toLowerCase()).filter(Boolean);
}

function normalizeDiscount(row = {}) {
  const appliesTo = parseJson(row.applies_to, {});
  const customerEligibility = parseJson(row.customer_eligibility, {});
  const config = parseJson(row.config_json, {});

  return {
    ...row,
    value: Number(row.value || 0),
    max_discount_amount: row.max_discount_amount === null ? null : Number(row.max_discount_amount || 0),
    min_order_value: Number(row.min_order_value || 0),
    max_order_value: Number(row.max_order_value || 0),
    min_quantity: Number(row.min_quantity || 0),
    usage_limit: Number(row.usage_limit || 0),
    usage_limit_per_customer: Number(row.usage_limit_per_customer || 0),
    is_stackable: Boolean(row.is_stackable),
    first_order_only: Boolean(row.first_order_only),
    applies_to: appliesTo,
    customer_eligibility: customerEligibility,
    config_json: config,
  };
}

export function normalizeCart(input = {}) {
  const items = Array.isArray(input.items) ? input.items : [];
  const normalizedItems = items
    .map((item) => {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const price = toMoney(item.price);
      return {
        id: Number(item.id || item.product_id || item.productId) || null,
        productId: Number(item.id || item.product_id || item.productId) || null,
        variantId: Number(item.variant_id || item.variantId) || null,
        name: cleanString(item.name || item.product_name) || "Product",
        categoryId: Number(item.categoryId || item.category_id) || null,
        categoryName: cleanString(item.categoryName || item.category_name),
        brand: cleanString(item.brand),
        quantity,
        price,
        lineTotal: toMoney(price * quantity),
      };
    })
    .filter((item) => item.quantity > 0 && item.price >= 0);

  const subtotal = toMoney(
    input.subtotal ??
      normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0)
  );

  return {
    items: normalizedItems,
    subtotal,
    shippingFee: toMoney(input.shippingFee),
    taxAmount: toMoney(input.taxAmount),
    paymentMethod: cleanString(input.paymentMethod),
    shippingMethod: cleanString(input.shippingMethod),
    country: cleanString(input.country || input.customer?.country),
    state: cleanString(input.state || input.customer?.state),
    customer: input.customer || {},
  };
}

function itemMatchesAppliesTo(item, appliesTo = {}) {
  const scope = appliesTo.scope || "all";
  if (scope === "all") return true;

  const productIds = normalizeIdList(appliesTo.productIds || appliesTo.products);
  const categoryIds = normalizeIdList(appliesTo.categoryIds || appliesTo.categories);
  const brands = normalizeTextList(appliesTo.brands);

  if (productIds.length && productIds.includes(Number(item.productId))) return true;
  if (categoryIds.length && categoryIds.includes(Number(item.categoryId))) return true;
  if (brands.length && brands.includes(cleanString(item.brand).toLowerCase())) return true;

  return false;
}

function customerMatches(discount, cart) {
  const eligibility = discount.customer_eligibility || {};
  const scope = eligibility.scope || "all";
  const customer = cart.customer || {};
  const email = cleanString(customer.email).toLowerCase();
  const userId = Number(customer.userId || customer.id) || null;

  if (scope === "all") return true;
  if (scope === "logged_in") return Boolean(userId || email);

  const customerIds = normalizeIdList(eligibility.customerIds || eligibility.customers);
  const customerEmails = normalizeTextList(eligibility.customerEmails || eligibility.emails);
  const groups = normalizeTextList(eligibility.groups);
  const customerGroup = cleanString(customer.group || customer.customerGroup).toLowerCase();

  if (scope === "specific_customers") {
    return (userId && customerIds.includes(userId)) || (email && customerEmails.includes(email));
  }

  if (scope === "groups") {
    return customerGroup && groups.includes(customerGroup);
  }

  return true;
}

function restrictionMatches(discount, cart) {
  const config = discount.config_json || {};
  const countries = normalizeTextList(config.countries);
  const states = normalizeTextList(config.states);
  const paymentMethods = normalizeTextList(config.paymentMethods);
  const shippingMethods = normalizeTextList(config.shippingMethods);

  if (countries.length && !countries.includes(cleanString(cart.country).toLowerCase())) return false;
  if (states.length && !states.includes(cleanString(cart.state).toLowerCase())) return false;
  if (paymentMethods.length && !paymentMethods.includes(cleanString(cart.paymentMethod).toLowerCase())) return false;
  if (shippingMethods.length && !shippingMethods.includes(cleanString(cart.shippingMethod).toLowerCase())) return false;

  return true;
}

function eligibleItems(discount, cart) {
  return cart.items.filter((item) => itemMatchesAppliesTo(item, discount.applies_to));
}

function eligibleSubtotal(discount, cart) {
  return toMoney(eligibleItems(discount, cart).reduce((sum, item) => sum + item.lineTotal, 0));
}

function calculateBogo(discount, cart) {
  const config = discount.config_json || {};
  const buyQuantity = Math.max(1, Number(config.buyQuantity || 1));
  const getQuantity = Math.max(1, Number(config.getQuantity || 1));
  const getDiscountType = cleanString(config.getDiscountType || "free").toLowerCase();
  const getDiscountValue = Number(config.getDiscountValue ?? 100);
  const items = eligibleItems(discount, cart);
  let amount = 0;

  if (config.mode === "different_product") {
    const getProductIds = normalizeIdList(config.getProductIds);
    const getCategoryIds = normalizeIdList(config.getCategoryIds);
    const buyQty = items.reduce((sum, item) => sum + item.quantity, 0);
    if (buyQty < buyQuantity) return 0;

    const discountedUnits = Math.floor(buyQty / buyQuantity) * getQuantity;
    const candidates = cart.items
      .filter((item) => {
        if (getProductIds.length && getProductIds.includes(Number(item.productId))) return true;
        if (getCategoryIds.length && getCategoryIds.includes(Number(item.categoryId))) return true;
        return !getProductIds.length && !getCategoryIds.length && itemMatchesAppliesTo(item, discount.applies_to);
      })
      .flatMap((item) => Array.from({ length: item.quantity }, () => item.price))
      .sort((a, b) => a - b)
      .slice(0, discountedUnits);

    amount = candidates.reduce((sum, price) => {
      if (getDiscountType === "percentage" || getDiscountType === "percent" || getDiscountType === "free") {
        const percent = getDiscountType === "free" ? 100 : Math.min(100, getDiscountValue);
        return sum + (price * percent) / 100;
      }
      return sum + Math.min(price, getDiscountValue);
    }, 0);

    return toMoney(amount);
  }

  for (const item of items) {
    const groupSize = buyQuantity + getQuantity;
    const freeUnits = Math.floor(item.quantity / groupSize) * getQuantity;
    if (!freeUnits) continue;

    if (getDiscountType === "fixed") {
      amount += Math.min(item.price, getDiscountValue) * freeUnits;
    } else {
      const percent = getDiscountType === "free" ? 100 : Math.min(100, getDiscountValue);
      amount += ((item.price * percent) / 100) * freeUnits;
    }
  }

  return toMoney(amount);
}

export function calculateDiscountAmount(discount, cart) {
  const type = cleanString(discount.discount_type).toLowerCase();
  const base = eligibleSubtotal(discount, cart);
  let amount = 0;

  if (type.includes("percent")) {
    amount = (base * discount.value) / 100;
    if (discount.max_discount_amount) {
      amount = Math.min(amount, discount.max_discount_amount);
    }
  } else if (type.includes("fixed")) {
    amount = Math.min(base, discount.value);
  } else if (type.includes("shipping")) {
    amount = cart.subtotal >= discount.min_order_value ? cart.shippingFee : 0;
  } else if (type.includes("bogo") || type.includes("buy")) {
    amount = calculateBogo(discount, cart);
  }

  return toMoney(Math.max(0, Math.min(amount, cart.subtotal + cart.shippingFee)));
}

async function hasFirstOrder(customer = {}) {
  const email = cleanString(customer.email);
  const phone = cleanString(customer.phoneNumber || customer.phone);
  const userId = Number(customer.userId || customer.id) || 0;

  if (!email && !phone && !userId) return false;

  const rows = await dbQuery(
    `
      SELECT id
      FROM orders
      WHERE (? > 0 AND user_id = ?)
        OR (? <> '' AND customer_email = ?)
        OR (? <> '' AND customer_phone = ?)
      LIMIT 1
    `,
    [userId, userId, email, email, phone, phone]
  );

  return rows.length > 0;
}

async function usageCounts(discount, coupon, customer = {}) {
  const email = cleanString(customer.email);
  const phone = cleanString(customer.phoneNumber || customer.phone);
  const userId = Number(customer.userId || customer.id) || 0;

  const totalRows = await dbQuery(
    "SELECT COUNT(*) AS total FROM discount_usage WHERE discount_id = ?",
    [discount.id]
  );
  const customerRows = await dbQuery(
    `
      SELECT COUNT(*) AS total
      FROM discount_usage
      WHERE discount_id = ?
        AND (
          (? > 0 AND user_id = ?)
          OR (? <> '' AND customer_email = ?)
          OR (? <> '' AND customer_phone = ?)
        )
    `,
    [discount.id, userId, userId, email, email, phone, phone]
  );

  const couponTotalRows = coupon?.id
    ? await dbQuery("SELECT COUNT(*) AS total FROM discount_usage WHERE coupon_id = ?", [coupon.id])
    : [{ total: 0 }];

  return {
    discountTotal: Number(totalRows[0]?.total || 0),
    couponTotal: Number(couponTotalRows[0]?.total || 0),
    customerTotal: Number(customerRows[0]?.total || 0),
  };
}

export async function evaluateDiscount(discountRow, cartInput, coupon = null) {
  const discount = normalizeDiscount(discountRow);
  const cart = normalizeCart(cartInput);
  const now = new Date();
  const startsAt = discount.starts_at ? new Date(discount.starts_at) : null;
  const endsAt = discount.ends_at ? new Date(discount.ends_at) : null;

  if (discount.deleted_at) return { valid: false, reason: "Discount is no longer available" };
  if (discount.status !== "Active") return { valid: false, reason: "Discount is inactive" };
  if (startsAt && startsAt > now) return { valid: false, reason: "Discount has not started yet" };
  if (endsAt && endsAt < now) return { valid: false, reason: "Discount has expired" };
  if (discount.min_order_value && cart.subtotal < discount.min_order_value) {
    return { valid: false, reason: `Minimum order value is Rs. ${discount.min_order_value}` };
  }
  if (discount.max_order_value && cart.subtotal > discount.max_order_value) {
    return { valid: false, reason: `Maximum order value is Rs. ${discount.max_order_value}` };
  }
  if (discount.min_quantity && cart.items.reduce((sum, item) => sum + item.quantity, 0) < discount.min_quantity) {
    return { valid: false, reason: `Minimum quantity is ${discount.min_quantity}` };
  }
  if (!customerMatches(discount, cart)) {
    return { valid: false, reason: "Customer is not eligible for this discount" };
  }
  if (!restrictionMatches(discount, cart)) {
    return { valid: false, reason: "Discount is not valid for this checkout method or region" };
  }
  if (eligibleItems(discount, cart).length === 0 && !cleanString(discount.discount_type).toLowerCase().includes("shipping")) {
    return { valid: false, reason: "Discount does not apply to these products" };
  }
  if (discount.first_order_only && (await hasFirstOrder(cart.customer))) {
    return { valid: false, reason: "This discount is only for first orders" };
  }

  const counts = await usageCounts(discount, coupon, cart.customer);
  if (discount.usage_limit && counts.discountTotal >= discount.usage_limit) {
    return { valid: false, reason: "Discount usage limit reached" };
  }
  if (coupon?.usage_limit && counts.couponTotal >= Number(coupon.usage_limit)) {
    return { valid: false, reason: "Coupon usage limit reached" };
  }
  if (discount.usage_limit_per_customer && counts.customerTotal >= discount.usage_limit_per_customer) {
    return { valid: false, reason: "You have already used this discount" };
  }

  const discountAmount = calculateDiscountAmount(discount, cart);
  if (discountAmount <= 0) {
    return { valid: false, reason: "Discount amount is zero for this cart" };
  }

  return {
    valid: true,
    discount: {
      id: discount.id,
      name: discount.name || discount.code,
      method: discount.method,
      type: discount.discount_type,
      code: coupon?.code || discount.code || "",
      amount: discountAmount,
      isStackable: discount.is_stackable,
    },
  };
}

export async function findDiscountByCode(code) {
  const normalizedCode = cleanString(code).toUpperCase();
  if (!normalizedCode) return null;

  const rows = await dbQuery(
    `
      SELECT d.*, c.id AS coupon_id, c.code AS coupon_code, c.usage_limit AS coupon_usage_limit, c.usage_count AS coupon_usage_count
      FROM discounts d
      LEFT JOIN discount_coupon_codes c
        ON c.discount_id = d.id
        AND UPPER(c.code) = ?
        AND c.status = 'Active'
      WHERE d.deleted_at IS NULL
        AND (
          UPPER(d.code) = ?
          OR c.id IS NOT NULL
        )
      ORDER BY c.id DESC
      LIMIT 1
    `,
    [normalizedCode, normalizedCode]
  );

  if (!rows.length) return null;

  const row = rows[0];
  return {
    discount: row,
    coupon: row.coupon_id
      ? {
          id: row.coupon_id,
          code: row.coupon_code,
          usage_limit: Number(row.coupon_usage_limit || 0),
          usage_count: Number(row.coupon_usage_count || 0),
        }
      : null,
  };
}

export async function findAutomaticDiscounts() {
  const rows = await dbQuery(
    `
      SELECT *
      FROM discounts
      WHERE deleted_at IS NULL
        AND status = 'Active'
        AND method = 'Automatic'
      ORDER BY value DESC, id DESC
    `
  );

  return rows;
}

export async function validateDiscountCart(input = {}) {
  const cart = normalizeCart(input);
  const code = cleanString(input.code).toUpperCase();
  const evaluated = [];
  let invalidReason = "";

  if (code) {
    const match = await findDiscountByCode(code);
    if (!match) {
      return { valid: false, message: "Coupon code is invalid", cart, appliedDiscount: null };
    }

    const result = await evaluateDiscount(match.discount, cart, match.coupon);
    if (!result.valid) {
      return { valid: false, message: result.reason, cart, appliedDiscount: null };
    }

    evaluated.push(result.discount);
  } else {
    const automaticDiscounts = await findAutomaticDiscounts();
    for (const discount of automaticDiscounts) {
      const result = await evaluateDiscount(discount, cart);
      if (result.valid) {
        evaluated.push(result.discount);
      } else if (!invalidReason) {
        invalidReason = result.reason;
      }
    }
  }

  const stackable = evaluated.filter((discount) => discount.isStackable);
  const applied = stackable.length
    ? stackable
    : evaluated.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0)).slice(0, 1);

  const discountAmount = toMoney(applied.reduce((sum, discount) => sum + Number(discount.amount || 0), 0));
  const shippingDiscount = applied
    .filter((discount) => cleanString(discount.type).toLowerCase().includes("shipping"))
    .reduce((sum, discount) => sum + Number(discount.amount || 0), 0);
  const productDiscount = Math.max(0, discountAmount - shippingDiscount);
  const taxableSubtotal = Math.max(0, cart.subtotal - productDiscount);
  const shippingFee = Math.max(0, cart.shippingFee - shippingDiscount);
  const totalAmount = toMoney(taxableSubtotal + shippingFee + cart.taxAmount);

  return {
    valid: applied.length > 0,
    message: applied.length ? "Discount applied" : invalidReason || "No automatic discount applies",
    cart,
    appliedDiscounts: applied,
    appliedDiscount: applied[0] || null,
    totals: {
      subtotal: cart.subtotal,
      discountAmount,
      productDiscountAmount: toMoney(productDiscount),
      shippingDiscountAmount: toMoney(shippingDiscount),
      shippingFee,
      taxAmount: cart.taxAmount,
      totalAmount,
    },
  };
}

export async function recordDiscountUsage({ discounts = [], orderId, customer = {}, subtotal = 0 }) {
  const rows = Array.isArray(discounts) ? discounts : discounts ? [discounts] : [];

  for (const discount of rows) {
    if (!discount?.id || Number(discount.amount || 0) <= 0) continue;

    const couponRows = discount.code
      ? await dbQuery("SELECT id FROM discount_coupon_codes WHERE code = ? LIMIT 1", [discount.code])
      : [];
    const couponId = couponRows[0]?.id || null;

    await dbQuery(
      `
        INSERT INTO discount_usage (
          discount_id,
          coupon_id,
          order_id,
          user_id,
          customer_email,
          customer_phone,
          amount_discounted,
          cart_subtotal
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        discount.id,
        couponId,
        orderId || null,
        Number(customer.userId || customer.id) || null,
        cleanString(customer.email) || null,
        cleanString(customer.phoneNumber || customer.phone) || null,
        toMoney(discount.amount),
        toMoney(subtotal),
      ]
    );

    await dbQuery("UPDATE discounts SET usage_count = usage_count + 1 WHERE id = ?", [discount.id]);
    if (couponId) {
      await dbQuery("UPDATE discount_coupon_codes SET usage_count = usage_count + 1 WHERE id = ?", [couponId]);
    }
  }
}

export { dbQuery, cleanString, toMoney, parseJson };
