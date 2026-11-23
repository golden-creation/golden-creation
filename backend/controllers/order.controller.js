import db from "../config/db.js";
import PDFDocument from "pdfkit";
import {
  recordDiscountUsage,
  validateDiscountCart,
} from "../services/discount.service.js";
import {
  deductVariantStock,
  findVariantForCart,
} from "../services/variant.service.js";
import { refreshLowStockNotifications } from "./expansion.controller.js";
import { sendOrderConfirmationSms } from "../services/sms.service.js";
import { createCodOrder } from "./checkout.controller.js";
import { includedTaxTotal } from "../services/invoice-tax-display.js";

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

function parseJsonArray(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value || "[]") : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function createOrderNumber() {
  return `LM-${Date.now().toString().slice(-8)}`;
}

function queueOrderConfirmationSms({ phone, customerName, orderNumber, totalAmount }) {
  if (!cleanString(phone)) return;

  void sendOrderConfirmationSms({
    phone,
    customerName,
    orderNumber,
    totalAmount,
  }).catch((error) => {
    console.error(`Order confirmation SMS failed for ${orderNumber}:`, error.message);
  });
}

export async function createOrder(req, res) {
  try {
    const requestedMethod = cleanString(req.body?.customer?.paymentMethod);
    if (
      requestedMethod &&
      !["Cash on Delivery", "Full COD", "COD"].includes(requestedMethod)
    ) {
      return res.status(400).json({
        message: "Online and partial COD orders must be started through checkout",
      });
    }
    const order = await createCodOrder({
      ...(req.body || {}),
      idempotencyKey: req.get("Idempotency-Key") || req.body?.idempotencyKey || req.body?.idempotency_key,
    });
    res.status(201).json({ order });
  } catch (error) {
    res.status(error.statusCode || 400).json({
      message: error.message || "Failed to place order",
    });
  }
}

async function createOrderLegacy(req, res) {
  const customer = req.body?.customer || {};
  const items = Array.isArray(req.body?.items) ? req.body.items : [];

  if (!items.length) {
    return res.status(400).json({
      message: "Order must contain at least one item",
    });
  }

  const normalizedItems = [];

  for (const item of items) {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const isBundle = Boolean(item.isBundle || item.itemType === "Bundle" || item.item_type === "Bundle");
      const productId = isBundle ? null : Number(item.productId || item.product_id || item.id) || null;
      const variantId = Number(item.variantId || item.variant_id) || null;
      let price = toMoney(item.price);
      let variant = null;
      let product = null;

      if (productId && variantId) {
        variant = await findVariantForCart(productId, variantId);

        if (!variant || variant.status !== "Active" || variant.visibility === "Hidden") {
          return res.status(400).json({
            message: `${cleanString(item.name || item.product_name) || "Product"} variant is unavailable`,
          });
        }

        if (Number(variant.stock || 0) < quantity) {
          return res.status(400).json({
            message: `${cleanString(item.name || item.product_name) || "Product"} has only ${variant.stock} unit(s) available for the selected variant`,
          });
        }

        price = toMoney(variant.price);
      } else if (productId) {
        const products = await dbQuery(
          "SELECT id, name, price, stock_quantity, status FROM products WHERE id=? AND deleted_at IS NULL LIMIT 1",
          [productId]
        );
        product = products[0];

        if (!product || product.status !== "Active") {
          return res.status(400).json({
            message: `${cleanString(item.name || item.product_name) || "Product"} is unavailable`,
          });
        }

        if (Number(product.stock_quantity || 0) < quantity) {
          return res.status(400).json({
            message: `${product.name} has only ${product.stock_quantity} unit(s) available`,
          });
        }

        price = toMoney(product.price);
      }

      normalizedItems.push({
        productId,
        variantId,
        variantSku: variant?.sku || cleanString(item.variantSku || item.variant_sku),
        variantTitle: variant?.optionSummary || cleanString(item.variantTitle || item.variant_title),
        variantOptions: variant?.options || item.variantOptions || item.variant_options || [],
        productName: cleanString(item.name || item.product_name) || "Product",
        itemType: isBundle ? "Bundle" : "Product",
        bundleName: isBundle ? cleanString(item.bundleName || item.name) : null,
        bundleItems: isBundle && Array.isArray(item.bundleItems) ? item.bundleItems : [],
        quantity,
        price,
        lineTotal: toMoney(price * quantity),
      });
  }

  const validItems = normalizedItems.filter((item) => item.quantity > 0);

  if (!validItems.length) {
    return res.status(400).json({
      message: "Order items are invalid",
    });
  }

  const subtotal = toMoney(
    req.body?.subtotal ??
      validItems.reduce((sum, item) => sum + item.lineTotal, 0)
  );
  let shippingFee = toMoney(req.body?.shippingFee);
  const taxAmount = toMoney(req.body?.taxAmount);
  let discountAmount = 0;
  let productDiscountAmount = 0;
  let discountCode = cleanString(req.body?.discountCode || req.body?.couponCode);
  let discountId = null;
  let appliedDiscounts = [];

  try {
    const discountResult = await validateDiscountCart({
      code: discountCode,
      items: validItems,
      subtotal,
      shippingFee,
      taxAmount,
      customer,
      paymentMethod: customer.paymentMethod,
      state: customer.state,
    });

    if (discountResult.valid) {
      discountAmount = toMoney(discountResult.totals?.discountAmount);
      productDiscountAmount = toMoney(discountResult.totals?.productDiscountAmount ?? discountAmount);
      shippingFee = toMoney(discountResult.totals?.shippingFee ?? shippingFee);
      appliedDiscounts = discountResult.appliedDiscounts || [];
      discountId = appliedDiscounts[0]?.id || null;
      discountCode = appliedDiscounts[0]?.code || discountCode || null;
    } else if (discountCode) {
      return res.status(400).json({
        message: discountResult.message || "Coupon code is invalid",
      });
    }
  } catch (discountError) {
    console.log("Discount calculation skipped:", discountError.message);
  }

  const totalAmount = toMoney(subtotal + shippingFee + taxAmount - productDiscountAmount);

  const firstName = cleanString(customer.firstName);
  const lastName = cleanString(customer.lastName);
  const customerName =
    cleanString(customer.name) ||
    [firstName, lastName].filter(Boolean).join(" ") ||
    "Guest Customer";

  try {
    const orderNumber = createOrderNumber();
    const orderResult = await dbQuery(
      `
        INSERT INTO orders (
          order_number,
          user_id,
          customer_name,
          customer_email,
          customer_phone,
          street_address,
          city,
          state,
          zip_code,
          payment_method,
          subtotal,
          shipping_fee,
          tax_amount,
          discount_id,
          discount_code,
          discount_amount,
          total_amount,
          order_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        orderNumber,
        Number(req.body?.userId || customer.userId) || null,
        customerName,
        cleanString(customer.email) || null,
        cleanString(customer.phoneNumber || customer.phone) || null,
        cleanString(customer.streetAddress) || null,
        cleanString(customer.city) || null,
        cleanString(customer.state) || null,
        cleanString(customer.zipCode) || null,
        cleanString(customer.paymentMethod) || "Cash on Delivery",
        subtotal,
        shippingFee,
        taxAmount,
        discountId,
        discountCode,
        discountAmount,
        totalAmount,
        "Processing",
      ]
    );

    const orderId = orderResult.insertId;

    await Promise.all(
      validItems.map((item) =>
        dbQuery(
          `
            INSERT INTO order_items (
              order_id,
              product_id,
              variant_id,
              variant_sku,
              variant_title,
              variant_options,
              item_type,
              bundle_name,
              bundle_items,
              product_name,
              quantity,
              price,
              line_total
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            orderId,
            item.productId,
            item.variantId,
            item.variantSku || null,
            item.variantTitle || null,
            item.variantOptions?.length ? JSON.stringify(item.variantOptions) : null,
            item.itemType || "Product",
            item.bundleName || null,
            item.bundleItems?.length ? JSON.stringify(item.bundleItems) : null,
            item.productName,
            item.quantity,
            item.price,
            item.lineTotal,
          ]
        )
      )
    );

    for (const item of validItems) {
      if (item.variantId) {
        const deducted = await deductVariantStock(item.variantId, item.quantity);
        if (!deducted) {
          console.log("Variant stock deduction skipped for", item.variantId);
        }
      } else if (item.productId) {
        const deducted = await dbQuery(
          "UPDATE products SET stock_quantity=stock_quantity-? WHERE id=? AND stock_quantity>=?",
          [item.quantity, item.productId, item.quantity]
        );
        if (!deducted.affectedRows) {
          console.log("Product stock deduction skipped for", item.productId);
        }
      }
    }

    try {
      await refreshLowStockNotifications();
    } catch (stockAlertError) {
      console.log("Low-stock alert refresh skipped:", stockAlertError.message);
    }

    if (appliedDiscounts.length) {
      await recordDiscountUsage({
        discounts: appliedDiscounts,
        orderId,
        customer: {
          ...customer,
          userId: Number(req.body?.userId || customer.userId) || null,
        },
        subtotal,
      });
    }

    try {
      await dbQuery(
        `
          INSERT INTO admin_notifications (type, title, message, link)
          VALUES ('new_order', 'New order received', ?, '/orders')
        `,
        [`${orderNumber} placed by ${customerName} for Rs. ${totalAmount}`]
      );
    } catch (notificationError) {
      console.log("Order notification skipped:", notificationError.message);
    }

    queueOrderConfirmationSms({
      phone: customer.phoneNumber || customer.phone,
      customerName,
      orderNumber,
      totalAmount,
    });

    res.status(201).json({
      order: {
        id: orderNumber,
        databaseId: orderId,
        createdAt: new Date().toISOString(),
        status: "Processing",
        subtotal,
        shippingFee,
        taxAmount,
        discountAmount,
        discountCode,
        total: totalAmount,
        customer,
        items: validItems,
      },
    });
  } catch (error) {
    console.log("Create Order Error:", error);

    res.status(500).json({
      message: "Failed to place order",
    });
  }
}

export async function downloadOrderInvoice(req, res) {
  const orderNumber = cleanString(req.params.orderNumber);
  const userId = Number(req.customer?.id || 0);
  const email = cleanString(req.query.email);
  const phone = cleanString(req.query.phone);

  if (!orderNumber) {
    return res.status(400).json({ message: "Order number is required" });
  }

  try {
    const rows = await dbQuery(
      `
        SELECT
          o.id,
          o.order_number,
          o.customer_name,
          o.customer_email,
          o.customer_phone,
          o.street_address,
          o.city,
          o.state,
          o.zip_code,
          o.payment_method,
          o.subtotal,
          o.shipping_fee,
          o.tax_amount,
          o.discount_code,
          o.discount_amount,
          o.total_amount,
          o.payment_status,
          o.amount_paid,
          o.cod_due,
          o.order_status,
          o.tracking_url,
          o.logistics_provider,
          o.delivered_at,
          o.created_at,
          oi.variant_sku,
          oi.variant_title,
          oi.item_type,
          oi.bundle_name,
          oi.bundle_items,
          oi.product_name,
          oi.quantity,
          oi.price,
          oi.line_total,
          oi.gst_inclusive,
          oi.gst_rate,
          oi.gst_amount
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.order_number = ?
          AND (
            (? > 0 AND o.user_id = ?)
            OR (
              ? = 0
              AND (
                ? = ''
                OR o.customer_email = ?
                OR o.customer_phone = ?
              )
            )
          )
        ORDER BY oi.id
      `,
      [orderNumber, userId, userId, userId, email || phone, email, phone]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Order not found" });
    }

    const order = rows[0];
    const doc = new PDFDocument({ margin: 48 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${order.order_number}-invoice.pdf"`
    );

    doc.pipe(res);

    doc.fontSize(22).text("Golden Creation", { continued: true });
    doc.fontSize(12).text(" Invoice", { align: "right" });
    doc.moveDown();
    doc.fontSize(11).text(`Invoice / Order: ${order.order_number}`);
    doc.text(`Date: ${new Date(order.created_at).toLocaleDateString("en-IN")}`);
    doc.text(`Status: ${order.order_status}`);
    doc.moveDown();

    doc.fontSize(13).text("Bill To", { underline: true });
    doc.fontSize(10).text(order.customer_name || "Customer");
    doc.text(order.customer_email || "");
    doc.text(order.customer_phone || "");
    doc.text(
      [order.street_address, order.city, order.state, order.zip_code]
        .filter(Boolean)
        .join(", ")
    );
    doc.moveDown();

    doc.fontSize(13).text("Items", { underline: true });
    doc.moveDown(0.4);
    rows.forEach((item) => {
      if (!item.product_name) return;
      const productLabel = item.variant_title
        ? `${item.product_name} (${item.variant_title})`
        : item.product_name;
      doc
        .fontSize(10)
        .text(`${productLabel} x ${item.quantity}${Number(item.gst_inclusive) ? " (Inclusive of GST)" : ""}`, { continued: true })
        .text(`Rs. ${Number(item.line_total || item.price * item.quantity || 0).toFixed(2)}`, {
          align: "right",
        });
    });

    doc.moveDown();
    doc.text(`Subtotal: Rs. ${Number(order.subtotal || 0).toFixed(2)}`, { align: "right" });
    if (Number(order.discount_amount || 0) > 0) {
      doc.text(`Discount${order.discount_code ? ` (${order.discount_code})` : ""}: -Rs. ${Number(order.discount_amount || 0).toFixed(2)}`, { align: "right" });
    }
    doc.text(`Shipping: Rs. ${Number(order.shipping_fee || 0).toFixed(2)}`, { align: "right" });
    const includedGst = includedTaxTotal(rows);
    if (includedGst > 0) {
      doc.text(`Included GST: Rs. ${includedGst.toFixed(2)}`, { align: "right" });
    }
    doc.text(
      Number(order.tax_amount || 0) > 0
        ? `Additional GST: Rs. ${Number(order.tax_amount || 0).toFixed(2)}`
        : "GST: Included in product prices",
      { align: "right" }
    );
    doc.fontSize(13).text(`Total: Rs. ${Number(order.total_amount || 0).toFixed(2)}`, {
      align: "right",
    });
    doc.text(`Online / collected: Rs. ${Number(order.amount_paid || 0).toFixed(2)}`, {
      align: "right",
    });
    doc.text(`COD amount due: Rs. ${Number(order.cod_due || 0).toFixed(2)}`, {
      align: "right",
    });
    doc.moveDown();
    doc.fontSize(10).text(`Payment Method: ${order.payment_method || "Not specified"}`);
    doc.text(`Payment Status: ${order.payment_status || "Pending"}`);
    doc.moveDown(2);
    doc.fontSize(9).fillColor("#666").text("Thank you for shopping with Golden Creation.");

    doc.end();
  } catch (error) {
    console.log("Invoice Error:", error);
    res.status(500).json({ message: "Failed to generate invoice" });
  }
}

export async function getCustomerOrders(req, res) {
  const userId = Number(req.customer?.id || 0);
  const email = cleanString(req.query.email);
  const phone = cleanString(req.query.phone);

  if (!userId && !email && !phone) {
    return res.status(400).json({
      message: "Email or phone is required",
    });
  }

  try {
    const rows = await dbQuery(
      `
        SELECT
          o.id,
          o.order_number,
          o.customer_name,
          o.customer_email,
          o.customer_phone,
          o.street_address,
          o.city,
          o.state,
          o.zip_code,
          o.payment_method,
          o.subtotal,
          o.shipping_fee,
          o.tax_amount,
          o.discount_code,
          o.discount_amount,
          o.total_amount,
          o.payment_status,
          o.amount_paid,
          o.cod_due,
          o.order_status,
          o.tracking_url,
          o.logistics_provider,
          o.delivered_at,
          o.created_at,
          oi.product_id,
          oi.variant_id,
          oi.variant_sku,
          oi.variant_title,
          oi.variant_options,
          oi.item_type,
          oi.bundle_name,
          oi.bundle_items,
          oi.product_name,
          oi.quantity,
          oi.price
        FROM orders o
        LEFT JOIN order_items oi
        ON o.id = oi.order_id
        WHERE (? > 0 AND o.user_id = ?)
           OR (
             ? = 0
             AND (
               (? <> '' AND o.customer_email = ?)
               OR (? <> '' AND o.customer_phone = ?)
             )
           )
        ORDER BY o.created_at DESC
      `,
      [userId, userId, userId, email, email, phone, phone]
    );

    const ordersById = new Map();

    rows.forEach((row) => {
      if (!ordersById.has(row.id)) {
        ordersById.set(row.id, {
          id: row.order_number,
          createdAt: row.created_at,
          status: row.order_status,
          trackingUrl: row.tracking_url || "",
          logisticsProvider: row.logistics_provider || "",
          deliveredAt: row.delivered_at || null,
          subtotal: Number(row.subtotal) || 0,
          shippingFee: Number(row.shipping_fee) || 0,
          taxAmount: Number(row.tax_amount) || 0,
          discountCode: row.discount_code || "",
          discountAmount: Number(row.discount_amount) || 0,
          total: Number(row.total_amount) || 0,
          paymentStatus: row.payment_status || "Pending",
          amountPaid: Number(row.amount_paid) || 0,
          codDue: Number(row.cod_due) || 0,
          customer: {
            name: row.customer_name,
            email: row.customer_email,
            phoneNumber: row.customer_phone,
            streetAddress: row.street_address,
            city: row.city,
            state: row.state,
            zipCode: row.zip_code,
            paymentMethod: row.payment_method,
          },
          items: [],
        });
      }

      if (row.product_name) {
        let variantOptions = [];

        try {
          variantOptions =
            typeof row.variant_options === "string"
              ? JSON.parse(row.variant_options || "[]")
              : row.variant_options || [];
        } catch {
          variantOptions = [];
        }

        ordersById.get(row.id).items.push({
          id: row.product_id,
          productId: row.product_id,
          variantId: row.variant_id,
          variantSku: row.variant_sku || "",
          variantTitle: row.variant_title || "",
          variantOptions,
          itemType: row.item_type || "Product",
          isBundle: row.item_type === "Bundle",
          bundleName: row.bundle_name || "",
          bundleItems: parseJsonArray(row.bundle_items),
          name: row.product_name,
          quantity: Number(row.quantity) || 1,
          price: Number(row.price) || 0,
        });
      }
    });

    res.json({
      orders: Array.from(ordersById.values()),
    });
  } catch (error) {
    console.log("Customer Orders Error:", error);

    res.status(500).json({
      message: "Failed to load orders",
    });
  }
}
