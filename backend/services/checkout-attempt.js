import crypto from "crypto";

const KEY_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;
const PROCESSING_STALE_MS = 120000;

export function normalizeIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!KEY_PATTERN.test(key)) {
    const error = new Error("A stable checkout key is required. Retry this checkout instead of starting another.");
    error.statusCode = 400;
    throw error;
  }
  return key;
}

export function checkoutPayloadHash(payload = {}) {
  const customer = payload.customer || {};
  const items = (Array.isArray(payload.items) ? payload.items : []).map((item) => ({
    productId: Number(item.productId || item.product_id || item.id) || 0,
    variantId: Number(item.variantId || item.variant_id) || 0,
    bundleId: Number(item.bundleId || item.bundle_id) || 0,
    quantity: String(item.quantity ?? "").trim(),
    itemType: String(item.itemType || item.item_type || (item.isBundle ? "bundle" : "product")).toLowerCase(),
  }));
  items.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const canonical = {
    userId: Number(payload.userId || customer.userId) || 0,
    paymentMode: String(payload.paymentMode || payload.paymentMethod || payload.payment_mode || "").trim(),
    discountCode: String(payload.discountCode || "").trim().toUpperCase(),
    phone: String(customer.phoneNumber || customer.phone || "").replace(/\D/g, ""),
    zip: String(customer.zipCode || customer.zip_code || "").trim(),
    items,
  };
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function decideCheckoutAttempt(existing, payloadHash, now = Date.now()) {
  if (!existing) return { action: "begin" };
  if (existing.payload_hash !== payloadHash) {
    return {
      action: "reject",
      statusCode: 409,
      message: "This checkout key was already used for a different order.",
    };
  }
  if (existing.status === "completed" && existing.response_json) {
    return { action: "stored", attempt: existing };
  }
  if (["completed", "committed", "compensated", "provider_failed"].includes(existing.status)) {
    return { action: "replay", attempt: existing };
  }
  if (existing.status === "ambiguous") return { action: "reconcile", attempt: existing };
  if (existing.status === "retryable") return { action: "resume", attempt: existing };
  if (existing.status === "processing") {
    const stamp = new Date(existing.updated_at || existing.created_at).getTime();
    if (Number.isFinite(stamp) && now - stamp > PROCESSING_STALE_MS) {
      return { action: "reconcile", attempt: existing };
    }
    return {
      action: "busy",
      statusCode: 409,
      message: "This checkout is already being processed.",
    };
  }
  return { action: "reconcile", attempt: existing };
}

function stop(decision) {
  const error = new Error(decision.message);
  error.statusCode = decision.statusCode || 409;
  throw error;
}

export async function beginCheckoutAttempt(query, { key, payloadHash, now = Date.now() }) {
  let existing = null;
  try {
    const inserted = await query(
      "INSERT INTO checkout_attempts (idempotency_key, payload_hash, status) VALUES (?, ?, 'processing')",
      [key, payloadHash]
    );
    return { mode: "execute", attemptId: Number(inserted.insertId) };
  } catch (error) {
    if (error?.code !== "ER_DUP_ENTRY") throw error;
    const rows = await query(
      "SELECT * FROM checkout_attempts WHERE idempotency_key = ? LIMIT 1",
      [key]
    );
    existing = rows[0];
  }

  const decision = decideCheckoutAttempt(existing, payloadHash, now);
  if (decision.action === "reject" || decision.action === "busy") stop(decision);
  if (decision.action === "stored") {
    return { mode: "stored", attemptId: existing.id, response: JSON.parse(existing.response_json) };
  }
  if (decision.action === "replay" && ["compensated", "provider_failed"].includes(existing.status)) {
    return {
      mode: "stored",
      attemptId: existing.id,
      response: existing.response_json ? JSON.parse(existing.response_json) : null,
      message: existing.error_message || "This checkout was already cancelled after payment setup failed.",
    };
  }
  if (decision.action === "replay" || decision.action === "reconcile") {
    const orders = await query(
      "SELECT id, order_number FROM orders WHERE checkout_attempt_id = ? LIMIT 1",
      [existing.id]
    );
    if (orders[0]) {
      await query(
        "UPDATE checkout_attempts SET status = 'committed', order_id = ?, order_number = ? WHERE id = ? AND status <> 'completed'",
        [orders[0].id, orders[0].order_number, existing.id]
      );
      return { mode: "replay", attemptId: existing.id, orderId: orders[0].id, orderNumber: orders[0].order_number };
    }
    if (
      existing.status === "ambiguous" ||
      (decision.action === "reconcile" && existing.status !== "processing")
    ) {
      const error = new Error("Checkout could not be confirmed. No second order was created and stock was not restored.");
      error.statusCode = 503;
      throw error;
    }
  }

  const resumed = await query(
    "UPDATE checkout_attempts SET status = 'processing', payload_hash = ? WHERE id = ? AND status IN ('retryable', 'processing')",
    [payloadHash, existing.id]
  );
  if (!resumed?.affectedRows) {
    stop({ statusCode: 409, message: "This checkout is already being processed." });
  }
  return { mode: "execute", attemptId: existing.id };
}

export async function recordCommitUncertainty(query, attemptId, error) {
  const message = String(error?.message || "Commit outcome is unknown").slice(0, 500);
  console.error("Checkout commit outcome is unresolved:", message);
  try {
    const rows = await query(
      "SELECT id, order_number FROM orders WHERE checkout_attempt_id = ? LIMIT 1",
      [attemptId]
    );
    if (rows[0]) {
      await query(
        "UPDATE checkout_attempts SET status = 'committed', order_id = ?, order_number = ?, error_message = ? WHERE id = ?",
        [rows[0].id, rows[0].order_number, message, attemptId]
      );
      return { committed: true, order: rows[0] };
    }
    await query(
      "UPDATE checkout_attempts SET status = 'retryable', error_message = ? WHERE id = ?",
      [message, attemptId]
    );
    const surfaced = new Error("Checkout was not saved. Retry this same checkout. Stock was not changed.");
    surfaced.statusCode = 503;
    return { committed: false, error: surfaced };
  } catch (lookupError) {
    console.error("Checkout reconciliation failed:", lookupError?.message || lookupError);
    await query(
      "UPDATE checkout_attempts SET status = 'ambiguous', error_message = ? WHERE id = ?",
      [`${message}; lookup failed`.slice(0, 500), attemptId]
    ).catch((updateError) => {
      console.error("Could not record ambiguous checkout:", updateError?.message || updateError);
    });
    const surfaced = new Error("Checkout could not be confirmed. No second order was created and stock was not restored.");
    surfaced.statusCode = 503;
    return { committed: false, error: surfaced };
  }
}

export async function claimCheckoutQuote({ query, attemptId, buildQuote }) {
  try {
    return await buildQuote();
  } catch (error) {
    await markCheckoutAttempt(query, attemptId, "retryable", {
      errorMessage: error?.message || "Checkout quote failed",
    }).catch((markError) => {
      console.error("Could not record retryable checkout:", markError?.message || markError);
    });
    throw error;
  }
}

export async function markCheckoutAttempt(query, attemptId, status, fields = {}) {
  await query(
    `UPDATE checkout_attempts
        SET status = ?, order_id = COALESCE(?, order_id), order_number = COALESCE(?, order_number),
            response_json = COALESCE(?, response_json), error_message = COALESCE(?, error_message)
      WHERE id = ?`,
    [
      status,
      fields.orderId || null,
      fields.orderNumber || null,
      fields.responseJson || null,
      fields.errorMessage ? String(fields.errorMessage).slice(0, 500) : null,
      attemptId,
    ]
  );
}
