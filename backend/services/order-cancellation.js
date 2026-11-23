const CANCELLABLE = new Set(["Pending", "Processing"]);
const SHIPPED = new Set(["Dispatched", "In Transit"]);
const RESOLUTIONS = new Set(["carrier_intercepted", "return_received"]);

const STATUS_TRANSITIONS = {
  Pending: ["Processing", "Dispatched", "Cancelled"],
  Processing: ["Dispatched", "In Transit", "Cancelled"],
  Dispatched: ["In Transit", "Delivered"],
  "In Transit": ["Delivered"],
  Delivered: [],
  Cancelled: [],
};

export function statusTransitionAllowed(from, to) {
  if (from === to) return true;
  return (STATUS_TRANSITIONS[from] || []).includes(to);
}

export function nextStatusOptions(from) {
  return [from, ...(STATUS_TRANSITIONS[from] || [])].filter((status, index, all) => status && all.indexOf(status) === index);
}

function parseJson(value) {
  if (!value) return [];
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function positiveQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

export function websiteStockWasDeducted(order) {
  if (!order || order.stock_restored_at) return false;
  if (order.quote_snapshot) return true;
  if (order.razorpay_order_id) return true;
  return ["Full COD", "Partial COD"].includes(String(order.payment_method || ""));
}

export function websiteRestorationLines(items = []) {
  const lines = [];
  for (const row of items) {
    if (row.item_type === "Bundle") {
      const parentQuantity = positiveQuantity(row.quantity);
      for (const item of parseJson(row.bundle_items)) {
        const quantity = positiveQuantity(item.quantity || item.qty) * parentQuantity;
        const variantId = Number(item.variantId || item.variant_id) || null;
        const productId = Number(item.productId || item.product_id) || null;
        if (!quantity || (!variantId && !productId)) continue;
        lines.push({ productId, variantId, quantity });
      }
      continue;
    }
    const quantity = positiveQuantity(row.quantity);
    const variantId = Number(row.variant_id || row.variantId) || null;
    const productId = Number(row.product_id || row.productId) || null;
    if (!quantity || (!variantId && !productId)) continue;
    lines.push({ productId, variantId, quantity });
  }
  return lines;
}

export function physicalRestorationLines(items = []) {
  const quantities = new Map();
  for (const item of items) {
    const itemQuantity = positiveQuantity(item.quantity);
    if (!itemQuantity) continue;
    const productId = Number(item.product_id || item.productId);
    if (productId) quantities.set(productId, (quantities.get(productId) || 0) + itemQuantity);
    for (const bundleItem of parseJson(item.bundle_items)) {
      const componentId = Number(bundleItem.product_id || bundleItem.productId || bundleItem.id);
      const componentQuantity = positiveQuantity(bundleItem.quantity || bundleItem.qty);
      if (!componentId || !componentQuantity) continue;
      quantities.set(componentId, (quantities.get(componentId) || 0) + itemQuantity * componentQuantity);
    }
  }
  return [...quantities.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

function refundPlan(order) {
  const amountPaid = Number(order.amount_paid || 0);
  const captured = ["Paid", "Partially Paid"].includes(order.payment_status) || amountPaid > 0;
  if (!captured) {
    return {
      required: false,
      status: "not_required",
      paymentStatus: order.payment_status === "Pending" ? "Failed" : order.payment_status,
      note: "No captured payment needs a refund.",
    };
  }
  return {
    required: true,
    status: "pending_provider_confirmation",
    paymentStatus: order.payment_status,
    note: "Cancellation does not mark this payment refunded. No Razorpay refund was requested.",
  };
}

export function planOrderCancellation(order, { items = [], reason = "", resolution = "", physicalAlreadyRestored = false } = {}) {
  const status = String(order?.order_status || "");
  const cleanReason = String(reason || "").trim();
  const cleanResolution = String(resolution || "").trim();

  if (!order) return { ok: false, statusCode: 404, message: "Order not found" };
  if (status === "Cancelled") {
    return { ok: false, statusCode: 409, message: "Order is already cancelled" };
  }
  if (status === "Delivered") {
    return { ok: false, statusCode: 409, message: "Delivered orders cannot be cancelled. Use the return workflow." };
  }
  if (!cleanReason) {
    return { ok: false, statusCode: 400, message: "Cancellation reason is required" };
  }
  if (cleanResolution && !RESOLUTIONS.has(cleanResolution)) {
    return { ok: false, statusCode: 400, message: "Choose carrier interception or a received return before cancelling a shipped order" };
  }

  const shipped = SHIPPED.has(status);
  if (!CANCELLABLE.has(status) && !shipped) {
    return { ok: false, statusCode: 409, message: `Order status ${status || "unknown"} cannot be cancelled` };
  }
  if (shipped && !cleanResolution) {
    return {
      ok: false,
      statusCode: 409,
      message: "Dispatched and in-transit orders stay unchanged until carrier interception or a received return is recorded. Physical stock was not restored.",
    };
  }

  const bucket = ["warehouse", "shop"].includes(order.fulfillment_stock_source) ? order.fulfillment_stock_source : "";
  const physicalDeducted = Boolean(order.physical_stock_deducted_at);
  let physical = null;
  const warnings = [];
  if (physicalDeducted && physicalAlreadyRestored) {
    warnings.push("Physical stock was already restored for this order.");
  } else if (physicalDeducted && !bucket) {
    warnings.push("Physical stock was deducted, but the stock source is missing, so it was not restored.");
    if (shipped) {
      return { ok: false, statusCode: 409, message: warnings[0] };
    }
  } else if (physicalDeducted && (CANCELLABLE.has(status) || shipped)) {
    physical = { bucket, lines: physicalRestorationLines(items) };
  }

  const restoreWebsite = websiteStockWasDeducted(order);
  const refund = refundPlan(order);
  const message = [
    refund.required
      ? "Order cancelled. Captured payment remains unchanged until the provider confirms a refund."
      : "Order cancelled.",
    ...warnings,
  ].join(" ");
  return {
    ok: true,
    statusCode: 200,
    orderId: Number(order.id),
    previousStatus: status,
    reason: cleanReason,
    resolution: cleanResolution || null,
    websiteLines: restoreWebsite ? websiteRestorationLines(items) : [],
    restoreWebsite,
    physical,
    refund,
    warnings,
    message,
  };
}

export async function applyCancellationWrites(query, plan, actor = "Admin") {
  if (!plan?.ok) return plan;
  for (const line of plan.websiteLines) {
    if (line.variantId) {
      await query("UPDATE product_variants SET stock=stock+? WHERE id=?", [line.quantity, line.variantId]);
    } else {
      await query("UPDATE products SET stock_quantity=stock_quantity+? WHERE id=?", [line.quantity, line.productId]);
    }
  }
  if (plan.physical) {
    for (const line of plan.physical.lines) {
      const rows = await query(
        "SELECT stock_on_hand, reorder_level FROM product_stock_counts WHERE product_id=? AND bucket=? LIMIT 1",
        [line.productId, plan.physical.bucket]
      );
      const current = rows[0];
      if (!current) {
        plan.warnings.push(`No ${plan.physical.bucket} stock row for product ${line.productId}, so that quantity was not restored.`);
        continue;
      }
      const previous = Number(current.stock_on_hand || 0);
      const next = previous + line.quantity;
      await query(
        "UPDATE product_stock_counts SET stock_on_hand=? WHERE product_id=? AND bucket=?",
        [next, line.productId, plan.physical.bucket]
      );
      await query(
        `INSERT INTO product_stock_audit_logs
          (product_id, bucket, previous_stock, new_stock, previous_reorder_level, new_reorder_level,
           adjustment_type, quantity_delta, reason, actor)
         VALUES (?, ?, ?, ?, ?, ?, 'cancellation', ?, ?, ?)`,
        [
          line.productId,
          plan.physical.bucket,
          previous,
          next,
          Number(current.reorder_level || 0),
          Number(current.reorder_level || 0),
          line.quantity,
          `Order ${plan.orderId} cancellation restore`,
          actor,
        ]
      );
    }
  }

  const updated = await query(
    `UPDATE orders
        SET order_status='Cancelled',
            payment_status=?,
            stock_restored_at=CASE WHEN ?=1 THEN COALESCE(stock_restored_at, NOW()) ELSE stock_restored_at END
      WHERE id=? AND order_status=?`,
    [plan.refund.paymentStatus, plan.restoreWebsite ? 1 : 0, plan.orderId, plan.previousStatus]
  );
  if (!updated?.affectedRows) {
    throw new Error("Order status changed before cancellation could be saved");
  }
  await query(
    "INSERT INTO order_status_history (order_id, status, fulfillment_stock_source, changed_by) VALUES (?, 'Cancelled', ?, ?)",
    [plan.orderId, plan.physical?.bucket || null, `${actor}: ${plan.reason}`.slice(0, 160)]
  );
  return plan;
}

export async function runCancellationTransaction({ begin, query, commit, rollback, order, items, reason, resolution, physicalAlreadyRestored, actor }) {
  await begin();
  try {
    const plan = planOrderCancellation(order, { items, reason, resolution, physicalAlreadyRestored });
    if (!plan.ok) {
      await rollback();
      return plan;
    }
    await applyCancellationWrites(query, plan, actor);
    await commit();
    return plan;
  } catch (error) {
    await rollback();
    throw error;
  }
}
