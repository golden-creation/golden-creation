import db from "../config/db.js";
import { categoryGstTotal, composeCheckoutTotal } from "./checkout-totals.js";
import { validateDiscountCart } from "./discount.service.js";
import {
  APPROVED_DISTANCE_METERS,
  PORTER_DELIVERY_LABEL,
  PORTER_PICKUP,
  allocateDiscountedLines,
  assertCapturedQuote,
  buildPaymentPlan,
  rupeesToPaise,
} from "./payment-policy.js";
import { measureRoadDistance } from "./road-distance.js";

export function dbQuery(sql, values = [], connection = db) {
  return new Promise((resolve, reject) => {
    connection.query(sql, values, (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
}

export function getConnection() {
  return new Promise((resolve, reject) => {
    db.getConnection((error, connection) => {
      if (error) reject(error);
      else resolve(connection);
    });
  });
}

export function connectionQuery(connection, sql, values = []) {
  return new Promise((resolve, reject) => {
    connection.query(sql, values, (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
}

export function beginTransaction(connection) {
  return new Promise((resolve, reject) => {
    connection.beginTransaction((error) => (error ? reject(error) : resolve()));
  });
}

export function commit(connection) {
  return new Promise((resolve, reject) => {
    connection.commit((error) => (error ? reject(error) : resolve()));
  });
}

export function rollback(connection) {
  return new Promise((resolve) => connection.rollback(resolve));
}

function cleanString(value) {
  return String(value || "").trim();
}

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function parseJson(value, fallback = []) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function loadProduct(productId, variantId, connection = db) {
  const rows = await dbQuery(
    `
      SELECT
        p.id,
        p.name,
        p.price,
        p.gst_inclusive,
        p.stock_quantity,
        p.category_id,
        p.status,
        p.deleted_at,
        b.name AS brand_name,
        c.name AS category_name,
        pv.id AS variant_id,
        pv.sku AS variant_sku,
        pv.price AS variant_price,
        pv.stock AS variant_stock,
        pv.status AS variant_status,
        pv.visibility AS variant_visibility
      FROM products p
      LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN product_variants pv
        ON pv.product_id = p.id AND pv.id = ?
      WHERE p.id = ?
      LIMIT 1
    `,
    [variantId || 0, productId],
    connection
  );
  const product = rows[0];

  if (!product || product.deleted_at || product.status !== "Active") {
    throw new Error("A product in your cart is no longer available");
  }
  if (variantId && !product.variant_id) {
    throw new Error(`${product.name} variant is no longer available`);
  }
  if (
    variantId &&
    (product.variant_status !== "Active" || product.variant_visibility === "Hidden")
  ) {
    throw new Error(`${product.name} variant is unavailable`);
  }

  return product;
}

async function loadProductCollections(productIds, connection = db) {
  const ids = [...new Set(productIds.map(Number).filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await dbQuery(
    `SELECT product_id, collection_id
       FROM collection_products
      WHERE product_id IN (${ids.map(() => "?").join(",")})`,
    ids,
    connection
  );
  return rows.reduce((map, row) => {
    const current = map.get(Number(row.product_id)) || [];
    current.push(Number(row.collection_id));
    map.set(Number(row.product_id), current);
    return map;
  }, new Map());
}

export function checkoutQuantity(value, label = "quantity") {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(text)) {
    const error = new Error(`The ${label} must be a whole number of at least 1. Fractional quantities are not accepted.`);
    error.statusCode = 400;
    throw error;
  }
  const quantity = Number(text);
  if (!Number.isInteger(quantity) || quantity < 1 || !Number.isSafeInteger(quantity)) {
    const error = new Error(`The ${label} must be a whole number of at least 1. Fractional quantities are not accepted.`);
    error.statusCode = 400;
    throw error;
  }
  return quantity;
}

async function normalizeProductLine(item, connection = db) {
  const quantity = checkoutQuantity(item.quantity, "product quantity");
  const productId = Number(item.productId || item.product_id || item.id) || 0;
  const variantId = Number(item.variantId || item.variant_id) || null;
  if (!productId) throw new Error("A cart product is missing its product ID");

  const product = await loadProduct(productId, variantId, connection);
  const price = toMoney(variantId ? product.variant_price : product.price);
  const stock = Number(variantId ? product.variant_stock : product.stock_quantity);
  if (stock < quantity) {
    throw new Error(`${product.name} has only ${Math.max(0, stock)} unit(s) available`);
  }

  return {
    productId,
    variantId,
    variantSku: product.variant_sku || cleanString(item.variantSku || item.variant_sku),
    variantTitle: checkoutVariantTitle(item.variantTitle || item.variant_title),
    variantOptions: parseJson(item.variantOptions || item.variant_options, []),
    productName: checkoutItemName(product.name, "product"),
    itemType: "Product",
    bundleName: null,
    bundleItems: [],
    categoryId: Number(product.category_id) || null,
    categoryName: product.category_name || "",
    brand: product.brand_name || "",
    quantity,
    price,
    lineTotal: toMoney(price * quantity),
    gstInclusive: Boolean(Number(product.gst_inclusive ?? 1)),
    taxComponents: [{
      categoryId: Number(product.category_id) || null,
      amount: toMoney(price * quantity),
      gstInclusive: Boolean(Number(product.gst_inclusive ?? 1)),
    }],
    stockLines: [{ productId, variantId, quantity }],
  };
}

async function normalizeBundleLine(item, connection = db) {
  const quantity = checkoutQuantity(item.quantity, "bundle quantity");
  const bundleType = cleanString(item.bundleType || item.bundle_type).toLowerCase();
  const requestedBundleId = Number(item.bundleId || item.bundle_id) || 0;
  let name = cleanString(item.bundleName || item.name) || "Golden Creation Bundle";
  let price = 0;
  let bundleItems = [];

  if (bundleType !== "custom" && requestedBundleId) {
    const bundles = await dbQuery(
      `SELECT id, name, price
         FROM bundle_products
        WHERE id = ? AND status = 'Active' AND deleted_at IS NULL
        LIMIT 1`,
      [requestedBundleId],
      connection
    );
    if (!bundles.length) throw new Error("A bundle in your cart is unavailable");
    const rows = await dbQuery(
      `SELECT bpi.product_id, bpi.variant_id, bpi.quantity, p.name
         FROM bundle_product_items bpi
         JOIN products p ON p.id = bpi.product_id
        WHERE bpi.bundle_id = ?
        ORDER BY bpi.sort_order, bpi.id`,
      [requestedBundleId],
      connection
    );
    name = bundles[0].name;
    price = toMoney(bundles[0].price);
    bundleItems = rows;
  } else {
    bundleItems = Array.isArray(item.bundleItems) ? item.bundleItems : [];
  }

  if (!bundleItems.length) throw new Error(`${name} has no products`);

  const stockLines = [];
  const resolvedItems = [];
  let customPrice = 0;
  for (const bundleItem of bundleItems) {
    const unitQuantity = checkoutQuantity(bundleItem.quantity, "bundle item quantity");
    const product = await loadProduct(
      Number(bundleItem.productId || bundleItem.product_id),
      Number(bundleItem.variantId || bundleItem.variant_id) || null,
      connection
    );
    const unitPrice = toMoney(product.variant_id ? product.variant_price : product.price);
    const requiredQuantity = unitQuantity * quantity;
    const stock = Number(product.variant_id ? product.variant_stock : product.stock_quantity);
    if (stock < requiredQuantity) {
      throw new Error(`${product.name} has only ${Math.max(0, stock)} unit(s) available`);
    }
    customPrice += unitPrice * unitQuantity;
    stockLines.push({
      productId: Number(product.id),
      variantId: Number(product.variant_id) || null,
      quantity: requiredQuantity,
    });
    resolvedItems.push({
      productId: Number(product.id),
      variantId: Number(product.variant_id) || null,
      name: product.name,
      quantity: unitQuantity,
      price: unitPrice,
      categoryId: Number(product.category_id) || null,
      gstInclusive: Boolean(Number(product.gst_inclusive ?? 1)),
    });
  }

  if (bundleType === "custom" || !requestedBundleId) price = toMoney(customPrice);
  name = checkoutItemName(name, "bundle");
  const categoryId = resolvedItems[0]?.categoryId || null;
  const componentBase = resolvedItems.reduce(
    (sum, resolvedItem) => sum + resolvedItem.price * resolvedItem.quantity * quantity,
    0
  );
  const componentScale = componentBase > 0 ? (price * quantity) / componentBase : 1;
  return {
    productId: null,
    variantId: null,
    variantSku: "",
    variantTitle: "",
    variantOptions: [],
    productName: name,
    itemType: "Bundle",
    bundleName: name,
    bundleItems: resolvedItems,
    categoryId,
    categoryName: "Bundle",
    brand: "",
    quantity,
    price,
    lineTotal: toMoney(price * quantity),
    gstInclusive: resolvedItems.every((resolvedItem) => resolvedItem.gstInclusive),
    taxComponents: resolvedItems.map((resolvedItem) => ({
      categoryId: resolvedItem.categoryId,
      amount: toMoney(resolvedItem.price * resolvedItem.quantity * quantity * componentScale),
      gstInclusive: resolvedItem.gstInclusive,
    })),
    stockLines,
  };
}

export async function normalizeCartItems(items, connection = db) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error("Order must contain at least one item");
  }
  const normalized = [];
  for (const item of items) {
    const isBundle =
      Boolean(item.isBundle) ||
      cleanString(item.itemType || item.item_type).toLowerCase() === "bundle";
    normalized.push(
      isBundle
        ? await normalizeBundleLine(item, connection)
        : await normalizeProductLine(item, connection)
    );
  }
  const collectionMap = await loadProductCollections(
    normalized.flatMap((item) => item.stockLines.map((line) => line.productId)),
    connection
  );
  normalized.forEach((item) => {
    item.collectionIds = [
      ...new Set(
        item.stockLines.flatMap((line) => collectionMap.get(line.productId) || [])
      ),
    ];
  });
  return normalized;
}

async function categoryAncestorMap(categoryIds, connection = db) {
  const pending = [...new Set(categoryIds.map(Number).filter(Boolean))];
  const map = new Map(pending.map((id) => [id, new Set([id])]));
  let frontier = [...pending];
  let guard = 0;

  while (frontier.length && guard < 50) {
    const rows = await dbQuery(
      `SELECT id, parent_id FROM categories WHERE id IN (${frontier.map(() => "?").join(",")})`,
      frontier,
      connection
    );
    const next = [];
    rows.forEach((row) => {
      if (!row.parent_id) return;
      for (const original of pending) {
        if (map.get(original)?.has(Number(row.id))) {
          map.get(original).add(Number(row.parent_id));
        }
      }
      next.push(Number(row.parent_id));
    });
    frontier = [...new Set(next)];
    guard += 1;
  }
  return map;
}

export function locationMatches(location, address) {
  const type = cleanString(location.location_type).toLowerCase();
  const value = cleanString(location.location_value).toLowerCase();
  if (type === "all india") return true;
  if (type === "state") return value === cleanString(address.state).toLowerCase();
  if (type === "pincode") {
    return value.replace(/\s+/g, "") === cleanString(address.zipCode || address.zip_code).replace(/\s+/g, "").toLowerCase();
  }
  return false;
}

export function selectShippingRuleCandidate({
  rules,
  targetMap,
  locationMap,
  categoryMap,
  items,
  address,
}) {
  const candidates = [];
  for (const rule of rules) {
    const ruleLocations = locationMap.get(Number(rule.id)) || [
      { location_type: "All India", location_value: "" },
    ];
    if (!ruleLocations.some((location) => locationMatches(location, address))) continue;

    const ruleTargets = targetMap.get(Number(rule.id)) || [];
    let specificity = 0;
    let matched = ruleTargets.length === 0;
    for (const target of ruleTargets) {
      const targetId = Number(target.target_id);
      let targetMatched = false;
      if (target.target_type === "Product") {
        targetMatched = items.some((item) =>
          item.stockLines.some((line) => line.productId === targetId)
        );
        if (targetMatched) specificity = Math.max(specificity, 3);
      } else if (target.target_type === "Collection") {
        targetMatched = items.some((item) => item.collectionIds.includes(targetId));
        if (targetMatched) specificity = Math.max(specificity, 2);
      } else if (target.target_type === "Category") {
        targetMatched = items.some((item) => {
          const ids = [
            item.categoryId,
            ...item.bundleItems.map((bundleItem) => bundleItem.categoryId),
          ].filter(Boolean);
          return ids.some((id) => categoryMap.get(Number(id))?.has(targetId));
        });
        if (targetMatched) specificity = Math.max(specificity, 1);
      }
      matched = matched || targetMatched;
      if (specificity === 3) break;
    }
    if (matched) candidates.push({ ...rule, specificity });
  }

  candidates.sort(
    (a, b) =>
      Number(b.priority || 0) - Number(a.priority || 0) ||
      Number(b.specificity || 0) - Number(a.specificity || 0) ||
      Number(b.min_order_value || 0) - Number(a.min_order_value || 0) ||
      Number(a.id) - Number(b.id)
  );
  return candidates[0] || null;
}

export async function resolveShippingRule(items, subtotal, address = {}, connection = db) {
  const rules = await dbQuery(
    `SELECT id, name, region, min_order_value, charge, delivery_days, eta, status, priority
       FROM shipping_rules
      WHERE status = 'Active' AND min_order_value <= ?`,
    [subtotal],
    connection
  );
  if (!rules.length) return null;

  const ruleIds = rules.map((rule) => Number(rule.id));
  const [targets, locations] = await Promise.all([
    dbQuery(
      `SELECT rule_id, target_type, target_id
         FROM shipping_rule_targets
        WHERE rule_id IN (${ruleIds.map(() => "?").join(",")})`,
      ruleIds,
      connection
    ),
    dbQuery(
      `SELECT rule_id, location_type, location_value
         FROM shipping_rule_locations
        WHERE rule_id IN (${ruleIds.map(() => "?").join(",")})`,
      ruleIds,
      connection
    ),
  ]);
  const targetMap = targets.reduce((map, row) => {
    const list = map.get(Number(row.rule_id)) || [];
    list.push(row);
    map.set(Number(row.rule_id), list);
    return map;
  }, new Map());
  const locationMap = locations.reduce((map, row) => {
    const list = map.get(Number(row.rule_id)) || [];
    list.push(row);
    map.set(Number(row.rule_id), list);
    return map;
  }, new Map());
  const categoryMap = await categoryAncestorMap(
    items.flatMap((item) => [
      item.categoryId,
      ...item.bundleItems.map((bundleItem) => bundleItem.categoryId),
    ]),
    connection
  );

  const selected = selectShippingRuleCandidate({
    rules,
    targetMap,
    locationMap,
    categoryMap,
    items,
    address,
  });
  return selected
    ? {
        id: Number(selected.id),
        name: selected.name,
        charge: toMoney(selected.charge),
        deliveryDays: Number(selected.delivery_days || 0),
        eta: selected.eta,
      }
    : null;
}

async function resolveTax(items, discountedSubtotal, subtotal, connection = db) {
  const components = items.flatMap((item) => item.taxComponents || []);
  const categoryIds = [...new Set(components.map((item) => item.categoryId).filter(Boolean))];
  if (!categoryIds.length || subtotal <= 0) {
    items.forEach((item) => {
      item.gstRate = 0;
      item.gstAmount = 0;
    });
    return 0;
  }
  const rows = await dbQuery(
    `SELECT category_id, MAX(tax_rate) AS tax_rate
       FROM category_tax_rules
      WHERE status = 'Active'
        AND category_id IN (${categoryIds.map(() => "?").join(",")})
      GROUP BY category_id`,
    categoryIds,
    connection
  );
  const rates = new Map(rows.map((row) => [Number(row.category_id), Number(row.tax_rate || 0)]));
  const taxed = categoryGstTotal(items, rates, discountedSubtotal, subtotal);
  taxed.items.forEach((item, index) => {
    items[index].gstRate = item.gstRate;
    items[index].gstAmount = item.gstAmount;
  });
  return taxed.total;
}

async function resolvePaymentOptions(items, connection = db, context = {}) {
  const settingsRows = await dbQuery("SELECT * FROM payment_settings WHERE id = 1", [], connection);
  const settings = settingsRows[0] || {};
  const configured =
    Boolean(cleanString(process.env.RAZORPAY_KEY_ID)) &&
    Boolean(cleanString(process.env.RAZORPAY_KEY_SECRET)) &&
    Boolean(cleanString(process.env.RAZORPAY_WEBHOOK_SECRET));
  const lines = allocateDiscountedLines(items, context.productDiscountAmount || 0);
  const distance = context.distance || await measureRoadDistance({
    address: [context.address, context.city, context.state, context.pin].filter(Boolean).join(", "),
  });
  const plan = buildPaymentPlan({
    lines,
    shippingFee: context.shippingFee || 0,
    taxAmount: context.taxAmount || 0,
    settings,
    distance,
    razorpayConfigured: configured,
    deliveryMethod: context.deliveryMethod,
    quoteTotal: context.quoteTotal,
  });
  return {
    ...plan,
    razorpayConfigured: configured,
    keyId: configured ? process.env.RAZORPAY_KEY_ID : "",
  };
}

export async function buildCheckoutQuote(payload, connection = db) {
  const items = await normalizeCartItems(payload.items, connection);
  const subtotal = toMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));
  const customer = payload.customer || payload;
  const deliveryMethod = cleanString(payload.deliveryMethod || customer.deliveryMethod) === "Porter" ? "Porter" : "Standard";
  const pin = customer.zipCode || customer.zip_code || payload.zipCode || "";
  let shippingRule = await resolveShippingRule(items, subtotal, customer, connection);
  const address = [customer.streetAddress || customer.address, customer.city, customer.state, pin].filter(Boolean).join(", ");
  const distance = await measureRoadDistance({ address });
  if (deliveryMethod === "Porter") {
    const [paymentSettings] = await dbQuery("SELECT * FROM payment_settings WHERE id = 1", [], connection);
    const porterMeters = Number(distance.meters);
    const porterAllowed = Boolean(Number(paymentSettings?.porter_enabled))
      && distance.verified === true
      && Number.isFinite(porterMeters)
      && porterMeters <= APPROVED_DISTANCE_METERS;
    if (!porterAllowed) {
      const error = new Error(distance.verified
        ? "Local Porter delivery is not available beyond the road-distance limit"
        : "Local Porter delivery is unavailable until the road distance can be verified");
      error.statusCode = 422;
      throw error;
    }
    shippingRule = {
      id: shippingRule?.id || null,
      name: PORTER_DELIVERY_LABEL,
      charge: 0,
      deliveryMethod: "Porter",
      pickup: PORTER_PICKUP,
    };
  } else if (!shippingRule) {
    const error = new Error("Delivery is not available for this address");
    error.statusCode = 422;
    throw error;
  }

  let discountAmount = 0;
  let productDiscountAmount = 0;
  let discountCode = cleanString(payload.discountCode || payload.couponCode);
  let appliedDiscounts = [];
  let shippingFee = shippingRule.charge;
  const discountResult = await validateDiscountCart({
    code: discountCode,
    items,
    subtotal,
    shippingFee,
    taxAmount: 0,
    customer: payload.customer || {},
    paymentMethod: payload.paymentMethod || payload.customer?.paymentMethod,
    state: payload.customer?.state || payload.state,
  });
  if (!discountResult.valid && discountCode) {
    const error = new Error(discountResult.message || "Coupon code is invalid");
    error.statusCode = 400;
    throw error;
  }
  if (discountResult.valid) {
    discountAmount = toMoney(discountResult.totals?.discountAmount);
    productDiscountAmount = toMoney(
      discountResult.totals?.productDiscountAmount ?? discountAmount
    );
    shippingFee = toMoney(discountResult.totals?.shippingFee ?? shippingFee);
    appliedDiscounts = discountResult.appliedDiscounts || [];
    discountCode = appliedDiscounts[0]?.code || discountCode || "";
  }
  let priced = composeCheckoutTotal({
    subtotal,
    productDiscountAmount,
    shippingFee: deliveryMethod === "Porter" ? 0 : shippingFee,
    shippingDiscountAmount: 0,
    taxAmount: await resolveTax(items, toMoney(Math.max(0, subtotal - productDiscountAmount)), subtotal, connection),
  });
  const discountedSubtotal = priced.discountedSubtotal;
  shippingFee = priced.shippingFee;
  const taxAmount = priced.taxAmount;
  const totalAmount = priced.totalAmount;
  const paymentOptions = await resolvePaymentOptions(items, connection, {
    pin,
    address,
    city: customer.city,
    state: customer.state,
    deliveryMethod,
    productDiscountAmount,
    shippingFee,
    taxAmount,
    distance,
  });
  const allocatedTotal = paymentOptions.fullOnline.amountOnline;
  if (rupeesToPaise(allocatedTotal) !== rupeesToPaise(priced.totalAmount)) {
    priced = { ...priced, totalAmount: allocatedTotal };
  }

  return {
    items,
    subtotal,
    discountAmount,
    productDiscountAmount,
    discountCode,
    discountId: appliedDiscounts[0]?.id || null,
    appliedDiscounts,
    discountedSubtotal,
    shippingFee,
    shippingRule,
    taxAmount,
    totalAmount: priced.totalAmount,
    paymentOptions,
    deliveryMethod,
    delivery: {
      method: deliveryMethod,
      porter: paymentOptions.porter,
      pickup: deliveryMethod === "Porter" ? PORTER_PICKUP : "",
      buyerPaysPorter: deliveryMethod === "Porter",
    },
  };
}

export async function deductQuoteStock(connection, items) {
  for (const item of items) {
    for (const line of item.stockLines) {
      const result = line.variantId
        ? await connectionQuery(
            connection,
            "UPDATE product_variants SET stock=stock-? WHERE id=? AND stock>=?",
            [line.quantity, line.variantId, line.quantity]
          )
        : await connectionQuery(
            connection,
            "UPDATE products SET stock_quantity=stock_quantity-? WHERE id=? AND stock_quantity>=?",
            [line.quantity, line.productId, line.quantity]
          );
      if (!result.affectedRows) {
        throw new Error(`${item.productName} no longer has enough stock`);
      }
    }
  }
}

export function checkoutItemName(value, label = "item") {
  const name = String(value ?? "").trim();
  if (!name) {
    const error = new Error(`The ${label} name is missing. Checkout was stopped before an order was created.`);
    error.statusCode = 400;
    throw error;
  }
  if (name.length > 255) {
    const error = new Error(`The ${label} name is longer than 255 characters and was not shortened.`);
    error.statusCode = 400;
    throw error;
  }
  return name;
}

function checkoutVariantTitle(value) {
  const title = cleanString(value);
  if (title.length > 255) {
    const error = new Error("The variant name is longer than 255 characters and was not shortened.");
    error.statusCode = 400;
    throw error;
  }
  return title;
}

export function createOrderNumber() {
  const random = Math.floor(Math.random() * 900 + 100);
  return `GC-${Date.now().toString().slice(-8)}${random}`;
}

export async function insertQuotedOrder(
  connection,
  {
    payload,
    quote,
    paymentMethod,
    paymentStatus,
    orderStatus,
    amountPaid,
    codDue,
    paymentExpiresAt = null,
    checkoutAttemptId = null,
  }
) {
  for (const item of quote?.items || []) {
    checkoutItemName(item?.productName, item?.itemType === "Bundle" ? "bundle" : "product");
    checkoutVariantTitle(item?.variantTitle);
  }
  assertCapturedQuote({ quote, paymentMethod, codDue, amountPaid });
  const customer = payload.customer || {};
  const customerName =
    cleanString(customer.name) ||
    [cleanString(customer.firstName), cleanString(customer.lastName)]
      .filter(Boolean)
      .join(" ") ||
    "Guest Customer";
  const orderNumber = createOrderNumber();
  const orderResult = await connectionQuery(
    connection,
    `INSERT INTO orders (
       order_number, user_id, customer_name, customer_email, customer_phone,
       street_address, city, state, zip_code, payment_method, payment_status,
       subtotal, shipping_fee, tax_amount, discount_id, discount_code,
       discount_amount, total_amount, amount_paid, cod_due, payment_expires_at,
       quote_snapshot, delivery_method, partial_advance_percent, order_status, checkout_attempt_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderNumber,
      Number(payload.userId || customer.userId) || null,
      customerName,
      cleanString(customer.email) || null,
      cleanString(customer.phoneNumber || customer.phone) || null,
      cleanString(customer.streetAddress) || null,
      cleanString(customer.city) || null,
      cleanString(customer.state) || null,
      cleanString(customer.zipCode || customer.zip_code) || null,
      paymentMethod,
      paymentStatus,
      quote.subtotal,
      quote.shippingFee,
      quote.taxAmount,
      quote.discountId,
      quote.discountCode || null,
      quote.discountAmount,
      quote.totalAmount,
      amountPaid,
      codDue,
      paymentExpiresAt,
      JSON.stringify({
        shippingRule: quote.shippingRule,
        paymentOption: payload.paymentOption || paymentMethod,
        deliveryMethod: quote.deliveryMethod || "Standard",
        partialAdvancePercent: quote.paymentOptions?.partialCod?.percentage || null,
        lines: quote.paymentOptions?.lines || [],
        distance: quote.paymentOptions?.distance || null,
        amountOnline: paymentMethod === "Full Online"
          ? quote.paymentOptions?.fullOnline?.amountOnline
          : paymentMethod === "Partial COD"
            ? quote.paymentOptions?.partialCod?.amountOnline
            : 0,
        amountCod: codDue,
      }),
      quote.deliveryMethod || "Standard",
      paymentMethod === "Partial COD" ? quote.paymentOptions?.partialCod?.percentage || null : null,
      orderStatus,
      checkoutAttemptId,
    ]
  );
  const orderId = Number(orderResult.insertId);

  for (const item of quote.items) {
    await connectionQuery(
      connection,
      `INSERT INTO order_items (
         order_id, product_id, variant_id, variant_sku, variant_title,
         variant_options, item_type, bundle_name, bundle_items,
         product_name, quantity, price, line_total, gst_inclusive, gst_rate, gst_amount
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        item.productId,
        item.variantId,
        item.variantSku || null,
        item.variantTitle || null,
        item.variantOptions?.length ? JSON.stringify(item.variantOptions) : null,
        item.itemType,
        item.bundleName,
        item.bundleItems?.length ? JSON.stringify(item.bundleItems) : null,
        item.productName,
        item.quantity,
        item.price,
        item.lineTotal,
        item.gstInclusive ? 1 : 0,
        item.gstRate || 0,
        item.gstAmount || 0,
      ]
    );
  }

  return { orderId, orderNumber, customerName };
}

export async function restoreOrderStock(connection, orderId) {
  const rows = await connectionQuery(
    connection,
    `SELECT product_id, variant_id, quantity, item_type, bundle_items
       FROM order_items
      WHERE order_id = ?`,
    [orderId]
  );
  for (const row of rows) {
    const lines =
      row.item_type === "Bundle"
        ? parseJson(row.bundle_items, []).map((item) => ({
            productId: Number(item.productId || item.product_id),
            variantId: Number(item.variantId || item.variant_id) || null,
            quantity: checkoutQuantity(item.quantity, "bundle item quantity") * checkoutQuantity(row.quantity, "order quantity"),
          }))
        : [{
            productId: Number(row.product_id),
            variantId: Number(row.variant_id) || null,
            quantity: checkoutQuantity(row.quantity, "order quantity"),
          }];
    for (const line of lines) {
      if (line.variantId) {
        await connectionQuery(
          connection,
          "UPDATE product_variants SET stock=stock+? WHERE id=?",
          [line.quantity, line.variantId]
        );
      } else if (line.productId) {
        await connectionQuery(
          connection,
          "UPDATE products SET stock_quantity=stock_quantity+? WHERE id=?",
          [line.quantity, line.productId]
        );
      }
    }
  }
}
