import crypto from "crypto";
import {
  beginTransaction,
  buildCheckoutQuote,
  commit,
  connectionQuery,
  dbQuery,
  deductQuoteStock,
  getConnection,
  insertQuotedOrder,
  restoreOrderStock,
  rollback,
} from "../services/commerce.service.js";
import { refreshLowStockNotifications } from "./expansion.controller.js";
import { sendOrderConfirmationSms } from "../services/sms.service.js";
import {
  sendOrderSuccessEmail,
  sendPaymentSuccessEmail,
} from "../services/email.service.js";
import { razorpayAmountPaise } from "../services/checkout-totals.js";
import { buildPaymentPlan, describeUnitPayment, effectiveUnitPrice, normalizeEligibilityMode, shouldMeasureRoadDistance } from "../services/payment-policy.js";
import { measureRoadDistance } from "../services/road-distance.js";
import { normalizeCartItems } from "../services/commerce.service.js";
import { placeRazorpayCheckout } from "../services/checkout-transaction.js";
import {
  beginCheckoutAttempt,
  checkoutPayloadHash,
  markCheckoutAttempt,
  normalizeIdempotencyKey,
  claimCheckoutQuote,
  recordCommitUncertainty,
} from "../services/checkout-attempt.js";
import {
  calculateOrderCommission,
  captureOrderAttribution,
} from "../services/referral-affiliate.service.js";

function cleanString(value) {
  return String(value || "").trim();
}

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function safeEqual(left, right) {
  const a = Buffer.from(cleanString(left));
  const b = Buffer.from(cleanString(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function razorpayConfigured() {
  return Boolean(
    cleanString(process.env.RAZORPAY_KEY_ID) &&
      cleanString(process.env.RAZORPAY_KEY_SECRET) &&
      cleanString(process.env.RAZORPAY_WEBHOOK_SECRET)
  );
}

async function callRazorpay(path, options = {}) {
  const authorization = Buffer.from(
    `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
  ).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.description || "Razorpay request failed");
  }
  return payload;
}

async function notifyOrder(order) {
  try {
    await dbQuery(
      `INSERT INTO admin_notifications (type, title, message, link)
       VALUES ('new_order', 'New order received', ?, '/orders')`,
      [
        `${order.order_number} placed by ${order.customer_name || "Customer"} for Rs. ${Number(
          order.total_amount || 0
        ).toFixed(2)}`,
      ]
    );
  } catch (error) {
    console.error("Order notification skipped:", error.message);
  }
  if (cleanString(order.customer_phone)) {
    void sendOrderConfirmationSms({
      phone: order.customer_phone,
      customerName: order.customer_name,
      orderNumber: order.order_number,
      totalAmount: order.total_amount,
    }).catch((error) => {
      console.error(`Order SMS failed for ${order.order_number}:`, error.message);
    });
  }
  if (cleanString(order.customer_email)) {
    void sendOrderSuccessEmail(order).catch((error) => {
      console.error(`Order email failed for ${order.order_number}:`, error.message);
    });
  }
  void refreshLowStockNotifications().catch((error) => {
    console.error("Low-stock refresh skipped:", error.message);
  });
}

function publicQuote(quote) {
  return {
    items: quote.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      name: item.productName,
      itemType: item.itemType,
      quantity: item.quantity,
      price: item.price,
      lineTotal: item.lineTotal,
      gstInclusive: item.gstInclusive,
      gstRate: item.gstRate || 0,
      gstAmount: item.gstAmount || 0,
    })),
    subtotal: quote.subtotal,
    discountAmount: quote.discountAmount,
    discountedSubtotal: quote.discountedSubtotal,
    shippingFee: quote.shippingFee,
    shippingRule: quote.shippingRule,
    taxAmount: quote.taxAmount,
    totalAmount: quote.totalAmount,
    discountCode: quote.discountCode,
    paymentOptions: quote.paymentOptions,
    deliveryMethod: quote.deliveryMethod || "Standard",
    delivery: quote.delivery || null,
  };
}

export async function createCheckoutQuote(req, res) {
  try {
    const quote = await buildCheckoutQuote(req.body || {});
    res.json({ quote: publicQuote(quote) });
  } catch (error) {
    res.status(error.statusCode || 400).json({
      message: error.message || "Unable to calculate checkout",
    });
  }
}

export async function createCodOrder(payload) {
  const key = normalizeIdempotencyKey(payload.idempotencyKey || payload.idempotency_key);
  const payloadHash = checkoutPayloadHash({ ...payload, paymentMode: "Full COD" });
  const started = await beginCheckoutAttempt(dbQuery, { key, payloadHash });
  if (started.mode === "stored" && started.response) return started.response;
  if (started.mode === "replay") {
    const rows = await dbQuery("SELECT * FROM orders WHERE id = ?", [started.orderId]);
    return codOrderResponse(rows[0], payload, null);
  }

  const quote = await claimCheckoutQuote({
    query: dbQuery,
    attemptId: started.attemptId,
    buildQuote: async () => {
      const quoted = await buildCheckoutQuote(payload);
      if (!quoted.paymentOptions.fullCod.enabled) {
        const error = new Error("Cash on Delivery is currently unavailable");
        error.statusCode = 422;
        throw error;
      }
      return quoted;
    },
  });
  let connection;
  let commitConfirmed = false;
  try {
    connection = await getConnection();
    await beginTransaction(connection);
    const created = await insertQuotedOrder(connection, {
      payload,
      quote,
      paymentMethod: "Full COD",
      paymentStatus: "COD Due",
      orderStatus: "Processing",
      amountPaid: 0,
      codDue: quote.totalAmount,
      checkoutAttemptId: started.attemptId,
    });
    await deductQuoteStock(connection, quote.items);
    await captureOrderAttribution(created.orderId, payload, connection);
    await calculateOrderCommission(created.orderId, connection);
    try {
      await commit(connection);
      commitConfirmed = true;
    } catch (error) {
      connection.destroy?.();
      connection.destroyed = true;
      const outcome = await recordCommitUncertainty(dbQuery, started.attemptId, error);
      if (!outcome.committed) throw outcome.error;
      const rows = await dbQuery("SELECT * FROM orders WHERE id = ?", [outcome.order.id]);
      return codOrderResponse(rows[0], payload, quote);
    }
    const rows = await dbQuery("SELECT * FROM orders WHERE id = ?", [created.orderId]);
    await notifyOrder(rows[0]);
    const response = codOrderResponse(rows[0], payload, quote);
    await markCheckoutAttempt(dbQuery, started.attemptId, "completed", {
      orderId: created.orderId,
      orderNumber: created.orderNumber,
      responseJson: JSON.stringify(response),
    });
    return response;
  } catch (error) {
    if (connection && !connection.destroyed && !commitConfirmed) {
      await rollback(connection).catch((rollbackError) => {
        console.error("COD checkout rollback failed:", rollbackError?.message || rollbackError);
      });
    }
    if (!commitConfirmed && !connection?.destroyed) {
      await markCheckoutAttempt(dbQuery, started.attemptId, "retryable", {
        errorMessage: error.message,
      }).catch((markError) => {
        console.error("Could not record retryable checkout:", markError?.message || markError);
      });
    }
    throw error;
  } finally {
    if (connection && !connection.destroyed) connection.release();
  }
}

function codOrderResponse(order, payload, quote) {
  return {
    id: order.order_number,
    databaseId: order.id,
    createdAt: order.created_at || new Date().toISOString(),
    status: order.order_status,
    paymentStatus: order.payment_status,
    amountPaid: Number(order.amount_paid || 0),
    codDue: Number(order.cod_due || 0),
    ...(quote ? publicQuote(quote) : {}),
    total: Number(order.total_amount),
    customer: payload.customer || {},
  };
}

async function cancelPendingOrder(orderId, reason) {
  const connection = await getConnection();
  try {
    await beginTransaction(connection);
    const rows = await connectionQuery(
      connection,
      "SELECT * FROM orders WHERE id = ? FOR UPDATE",
      [orderId]
    );
    const order = rows[0];
    if (
      order &&
      order.payment_status === "Pending" &&
      !order.stock_restored_at
    ) {
      await restoreOrderStock(connection, orderId);
      await connectionQuery(
        connection,
        `UPDATE orders
            SET payment_status = 'Failed',
                order_status = 'Cancelled',
                stock_restored_at = NOW()
          WHERE id = ?`,
        [orderId]
      );
      await connectionQuery(
        connection,
        `INSERT INTO payment_transactions
          (order_id, provider, provider_order_id, event_type, status, amount, payload_json)
         VALUES (?, 'Razorpay', ?, 'order.cancelled', 'Failed', 0, ?)`,
        [orderId, order.razorpay_order_id, JSON.stringify({ reason })]
      );
    }
    await commit(connection);
  } catch (error) {
    await rollback(connection);
    throw error;
  } finally {
    connection.release();
  }
}

export async function createRazorpayOrder(req, res) {
  if (!razorpayConfigured()) {
    return res.status(503).json({ message: "Online payments are not configured" });
  }
  const mode = cleanString(req.body?.paymentMode || req.body?.payment_mode);
  if (!["Full Online", "Partial COD"].includes(mode)) {
    return res.status(400).json({ message: "Choose a valid online payment mode" });
  }

  const body = req.body || {};
  const key = normalizeIdempotencyKey(req.get("Idempotency-Key") || body.idempotencyKey || body.idempotency_key);
  const payloadHash = checkoutPayloadHash({ ...body, paymentMode: mode });
  const started = await beginCheckoutAttempt(dbQuery, { key, payloadHash });
  if (started.mode === "stored") {
    if (started.response) return res.status(201).json(started.response);
    return res.status(409).json({ message: started.message || "This checkout was already processed." });
  }
  if (started.mode === "replay") {
    const rows = await dbQuery("SELECT * FROM orders WHERE id = ?", [started.orderId]);
    const order = rows[0];
    if (order?.razorpay_order_id) {
      return res.status(201).json({
        order: {
          id: order.order_number,
          databaseId: order.id,
          razorpayOrderId: order.razorpay_order_id,
          keyId: process.env.RAZORPAY_KEY_ID,
          currency: "INR",
          amount: Number(order.total_amount) - Number(order.cod_due || 0),
          codDue: Number(order.cod_due || 0),
          customer: body.customer || {},
        },
      });
    }
  }

  let attemptSettled = started.mode !== "execute";
  let connection;
  try {
    connection = await getConnection();
    const completed = await placeRazorpayCheckout({
      connection,
      begin: beginTransaction,
      commit,
      rollback,
      release: (active) => active.release(),
      prepare: async () => {
        const quote = await buildCheckoutQuote(body, connection);
        const option = mode === "Partial COD" ? quote.paymentOptions.partialCod : quote.paymentOptions.fullOnline;
        if (!option.enabled) {
          throw Object.assign(new Error(`${mode} is unavailable for this cart`), { statusCode: 422 });
        }
        const settings = await connectionQuery(connection, "SELECT stock_hold_minutes FROM payment_settings WHERE id = 1");
        const holdMinutes = Math.max(5, Number(settings[0]?.stock_hold_minutes || 30));
        return {
          quote,
          option,
          expiresAt: new Date(Date.now() + holdMinutes * 60 * 1000),
          replayOrderId: started.mode === "replay" ? started.orderId : null,
        };
      },
      work: async ({ quote, option, expiresAt, replayOrderId }) => {
        if (replayOrderId) {
          const rows = await connectionQuery(connection, "SELECT id, order_number FROM orders WHERE id = ? FOR UPDATE", [replayOrderId]);
          return { orderId: rows[0].id, orderNumber: rows[0].order_number, quote, option, expiresAt };
        }
        const created = await insertQuotedOrder(connection, {
          payload: body,
          quote,
          paymentMethod: mode,
          paymentStatus: "Pending",
          orderStatus: "Pending",
          amountPaid: 0,
          codDue: option.amountCod,
          paymentExpiresAt: expiresAt,
          checkoutAttemptId: started.attemptId,
        });
        await deductQuoteStock(connection, quote.items);
        await captureOrderAttribution(created.orderId, body, connection);
        return created;
      },
      onUncertainCommit: async (error) => {
        connection.destroy?.();
        connection.destroyed = true;
        const outcome = await recordCommitUncertainty(dbQuery, started.attemptId, error);
        attemptSettled = true;
        if (!outcome.committed) return outcome;
        return {
          committed: true,
          created: { orderId: outcome.order.id, orderNumber: outcome.order.order_number },
        };
      },
      callProvider: async (created, { quote, option, expiresAt }) => {
        const razorpayOrder = await callRazorpay("/orders", {
          method: "POST",
          body: JSON.stringify({
            amount: razorpayAmountPaise(option.amountOnline),
            currency: "INR",
            receipt: created.orderNumber,
            notes: {
              application_order_id: String(created.orderId),
              payment_mode: mode,
            },
          }),
        });
        await dbQuery("UPDATE orders SET razorpay_order_id = ? WHERE id = ?", [razorpayOrder.id, created.orderId]);
        await dbQuery(
          `INSERT INTO payment_transactions
            (order_id, provider, provider_order_id, event_type, status, amount, payload_json)
           VALUES (?, 'Razorpay', ?, 'order.created', 'Pending', ?, ?)`,
          [created.orderId, razorpayOrder.id, option.amountOnline, JSON.stringify(razorpayOrder)]
        );
        return { created, quote, option, expiresAt, razorpayOrder };
      },
      compensate: async (created) => {
        await cancelPendingOrder(created.orderId, "Razorpay order was not completed");
        await markCheckoutAttempt(dbQuery, started.attemptId, "compensated", {
          orderId: created.orderId,
          orderNumber: created.orderNumber,
          errorMessage: "Razorpay order was not completed",
        });
        attemptSettled = true;
      },
    });

    const response = {
      order: {
        id: completed.created.orderNumber,
        databaseId: completed.created.orderId,
        razorpayOrderId: completed.razorpayOrder.id,
        keyId: process.env.RAZORPAY_KEY_ID,
        currency: "INR",
        amount: completed.option.amountOnline,
        amountPaise: completed.razorpayOrder.amount,
        codDue: completed.option.amountCod,
        expiresAt: completed.expiresAt.toISOString(),
        customer: body.customer || {},
        quote: publicQuote(completed.quote),
      },
    };
    await markCheckoutAttempt(dbQuery, started.attemptId, "completed", {
      orderId: completed.created.orderId,
      orderNumber: completed.created.orderNumber,
      responseJson: JSON.stringify(response),
    });
    res.status(201).json(response);
  } catch (error) {
    if (!attemptSettled) {
      await markCheckoutAttempt(dbQuery, started.attemptId, error.compensationError ? "ambiguous" : "retryable", {
        errorMessage: error.message,
      }).catch((markError) => {
        console.error("Could not record checkout attempt:", markError?.message || markError);
      });
    }
    res.status(error.statusCode || 400).json({
      message: error.message || "Unable to start payment",
    });
  }
}

async function finalizePayment({
  providerOrderId,
  providerPaymentId,
  amount,
  payload,
  eventType,
}) {
  const connection = await getConnection();
  try {
    await beginTransaction(connection);
    const rows = await connectionQuery(
      connection,
      "SELECT * FROM orders WHERE razorpay_order_id = ? FOR UPDATE",
      [providerOrderId]
    );
    const order = rows[0];
    if (!order) throw new Error("Application order not found");
    if (["Paid", "Partially Paid"].includes(order.payment_status)) {
      await commit(connection);
      return order;
    }
    if (order.stock_restored_at || order.order_status === "Cancelled") {
      throw new Error("Payment arrived after the stock hold expired");
    }
    const expected = toMoney(
      order.payment_method === "Partial COD"
        ? Number(order.total_amount) - Number(order.cod_due)
        : order.total_amount
    );
    if (amount !== null && razorpayAmountPaise(amount) !== razorpayAmountPaise(expected)) {
      throw new Error("Payment amount does not match the order");
    }
    const paymentStatus =
      Number(order.cod_due || 0) > 0 ? "Partially Paid" : "Paid";
    await connectionQuery(
      connection,
      `UPDATE orders
          SET payment_status = ?,
              amount_paid = ?,
              razorpay_payment_id = ?,
              payment_completed_at = NOW(),
              payment_expires_at = NULL,
              order_status = 'Processing'
        WHERE id = ?`,
      [paymentStatus, expected, providerPaymentId, order.id]
    );
    await connectionQuery(
      connection,
      `INSERT IGNORE INTO payment_transactions
        (order_id, provider, provider_order_id, provider_payment_id, event_type, status, amount, payload_json)
       VALUES (?, 'Razorpay', ?, ?, ?, 'Paid', ?, ?)`,
      [
        order.id,
        providerOrderId,
        providerPaymentId,
        eventType,
        expected,
        JSON.stringify(payload || {}),
      ]
    );
    await calculateOrderCommission(order.id, connection);
    await commit(connection);
    const updatedRows = await dbQuery("SELECT * FROM orders WHERE id = ?", [order.id]);
    await notifyOrder(updatedRows[0]);
    if (cleanString(updatedRows[0]?.customer_email)) {
      void sendPaymentSuccessEmail(updatedRows[0]).catch((error) => {
        console.error(`Payment email failed for ${updatedRows[0].order_number}:`, error.message);
      });
    }
    return updatedRows[0];
  } catch (error) {
    await rollback(connection);
    throw error;
  } finally {
    connection.release();
  }
}

export async function verifyRazorpayPayment(req, res) {
  const providerOrderId = cleanString(req.body?.razorpay_order_id);
  const providerPaymentId = cleanString(req.body?.razorpay_payment_id);
  const signature = cleanString(req.body?.razorpay_signature);
  if (!providerOrderId || !providerPaymentId || !signature) {
    return res.status(400).json({ message: "Payment verification details are incomplete" });
  }
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
    .update(`${providerOrderId}|${providerPaymentId}`)
    .digest("hex");
  if (!safeEqual(expected, signature)) {
    return res.status(400).json({ message: "Payment signature is invalid" });
  }
  try {
    if (req.customer?.id) {
      const ownedRows = await dbQuery(
        "SELECT id FROM orders WHERE razorpay_order_id = ? AND user_id = ? LIMIT 1",
        [providerOrderId, Number(req.customer.id)]
      );
      if (!ownedRows.length) {
        return res.status(404).json({ message: "Payment order not found" });
      }
    }
    const payment = await callRazorpay(`/payments/${encodeURIComponent(providerPaymentId)}`);
    if (payment.order_id !== providerOrderId) {
      return res.status(400).json({ message: "Payment does not belong to this order" });
    }
    if (!["authorized", "captured"].includes(payment.status)) {
      return res.status(409).json({ message: "Payment is not authorized" });
    }
    const order = await finalizePayment({
      providerOrderId,
      providerPaymentId,
      amount: Number(payment.amount || 0) / 100,
      payload: payment,
      eventType: "checkout.verified",
    });
    res.json({
      order: {
        id: order.order_number,
        databaseId: order.id,
        status: order.order_status,
        paymentStatus: order.payment_status,
        total: Number(order.total_amount),
        amountPaid: Number(order.amount_paid),
        codDue: Number(order.cod_due),
      },
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Payment verification failed" });
  }
}

export async function razorpayWebhook(req, res) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
  const signature = cleanString(req.headers["x-razorpay-signature"]);
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET || "")
    .update(rawBody)
    .digest("hex");
  if (!razorpayConfigured() || !safeEqual(expected, signature)) {
    return res.status(400).json({ message: "Invalid webhook signature" });
  }
  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ message: "Invalid webhook payload" });
  }
  const eventId =
    cleanString(req.headers["x-razorpay-event-id"]) ||
    crypto.createHash("sha256").update(rawBody).digest("hex");
  try {
    const result = await dbQuery(
      `INSERT IGNORE INTO payment_webhook_events
        (provider, event_id, event_type, payload_json)
       VALUES ('Razorpay', ?, ?, ?)`,
      [eventId, cleanString(event.event), rawBody.toString("utf8")]
    );
    if (!result.affectedRows) return res.json({ received: true, duplicate: true });

    const payment = event.payload?.payment?.entity;
    if (["payment.captured", "order.paid"].includes(event.event) && payment) {
      await finalizePayment({
        providerOrderId: payment.order_id,
        providerPaymentId: payment.id,
        amount: Number(payment.amount || 0) / 100,
        payload: event,
        eventType: event.event,
      });
      await dbQuery(
        `UPDATE payment_webhook_events
            SET status = 'Processed', processed_at = NOW()
          WHERE provider = 'Razorpay' AND event_id = ?`,
        [eventId]
      );
    } else {
      await dbQuery(
        `UPDATE payment_webhook_events
            SET status = 'Ignored', processed_at = NOW()
          WHERE provider = 'Razorpay' AND event_id = ?`,
        [eventId]
      );
    }
    res.json({ received: true });
  } catch (error) {
    await dbQuery(
      `UPDATE payment_webhook_events
          SET status = 'Failed', error_message = ?, processed_at = NOW()
        WHERE provider = 'Razorpay' AND event_id = ?`,
      [error.message, eventId]
    ).catch(() => {});
    res.status(500).json({ message: "Webhook processing failed" });
  }
}

export async function getPaymentStatus(req, res) {
  const orderNumber = cleanString(req.params.orderNumber);
  const userId = Number(req.customer?.id || 0);
  const email = cleanString(req.query.email);
  const phone = cleanString(req.query.phone);
  try {
    const rows = await dbQuery(
      `SELECT order_number, order_status, payment_status, total_amount,
              amount_paid, cod_due, payment_expires_at
        FROM orders
        WHERE order_number = ?
          AND (
            (? > 0 AND user_id = ?)
            OR (
              ? = 0
              AND (? = '' OR customer_email = ? OR customer_phone = ?)
            )
          )
        LIMIT 1`,
      [orderNumber, userId, userId, userId, email || phone, email, phone]
    );
    if (!rows.length) return res.status(404).json({ message: "Order not found" });
    res.json({ payment: rows[0] });
  } catch {
    res.status(500).json({ message: "Unable to load payment status" });
  }
}

export async function markCodCollected(req, res) {
  const orderId = Number(req.params.id);
  const connection = await getConnection();
  try {
    await beginTransaction(connection);
    const rows = await connectionQuery(
      connection,
      "SELECT * FROM orders WHERE id = ? FOR UPDATE",
      [orderId]
    );
    const order = rows[0];
    if (!order) {
      await rollback(connection);
      return res.status(404).json({ message: "Order not found" });
    }
    if (Number(order.cod_due || 0) <= 0) {
      await rollback(connection);
      return res.status(409).json({ message: "This order has no COD balance" });
    }
    const collected = Number(order.cod_due);
    await connectionQuery(
      connection,
      `UPDATE orders
          SET amount_paid = total_amount,
              cod_due = 0,
              payment_status = 'Paid',
              cod_collected_at = NOW(),
              payment_completed_at = COALESCE(payment_completed_at, NOW())
        WHERE id = ?`,
      [orderId]
    );
    await connectionQuery(
      connection,
      `INSERT INTO payment_transactions
        (order_id, provider, event_type, status, amount, payload_json)
       VALUES (?, 'COD', 'cod.collected', 'Paid', ?, ?)`,
      [
        orderId,
        collected,
        JSON.stringify({ adminId: req.admin?.id || null, remarks: req.body?.remarks || "" }),
      ]
    );
    await commit(connection);
    res.json({ message: "COD balance marked as collected" });
  } catch (error) {
    await rollback(connection);
    res.status(500).json({ message: error.message || "Unable to collect COD balance" });
  } finally {
    connection.release();
  }
}

export async function previewPaymentEligibility(req, res) {
  try {
    const items = await normalizeCartItems(req.body?.items || []);
    if (!items.length) {
      return res.status(400).json({ message: "Add a product to preview payment eligibility" });
    }
    const [settings] = await dbQuery("SELECT * FROM payment_settings WHERE id = 1");
    const customer = req.body?.customer || {};
    const address = [customer.streetAddress || customer.address, customer.city, customer.state, customer.zipCode || customer.pin]
      .filter(Boolean)
      .join(", ");
    const pin = customer.zipCode || customer.pin || "";
    const mode = normalizeEligibilityMode(settings?.eligibility_mode);
    const distance = shouldMeasureRoadDistance(mode) && address
      ? await measureRoadDistance({
        street: customer.streetAddress || customer.address || "",
        city: customer.city || "",
        state: customer.state || "",
        pin,
        address,
      })
      : { verified: false, meters: null, kilometers: null, reason: "" };
    const plan = buildPaymentPlan({
      lines: items.map((item) => ({
        productId: item.productId,
        name: item.productName,
        quantity: item.quantity,
        unitPrice: effectiveUnitPrice(item.lineTotal, item.quantity, 0),
      })),
      settings: settings || {},
      distance,
      pin,
      razorpayConfigured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
      deliveryMethod: req.body?.deliveryMethod === "Porter" ? "Porter" : "Standard",
    });
    res.json({
      lines: plan.lines.map((line) => ({
        ...line,
        eligibility: describeUnitPayment(line.unitPrice, settings || {}),
        distanceNote: plan.eligibility?.message || "",
      })),
      distance: plan.distance,
      fullOnlineAvailable: true,
      eligibility: plan.eligibility,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || "Unable to preview payment eligibility" });
  }
}

export async function expirePendingPayments() {
  const rows = await dbQuery(
    `SELECT id
       FROM orders
      WHERE payment_status = 'Pending'
        AND payment_expires_at IS NOT NULL
        AND payment_expires_at <= NOW()
        AND stock_restored_at IS NULL
      LIMIT 100`
  );
  for (const row of rows) {
    await cancelPendingOrder(Number(row.id), "Payment hold expired");
  }
  return rows.length;
}
