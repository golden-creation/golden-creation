import {
  beginTransaction,
  commit,
  connectionQuery,
  dbQuery,
  getConnection,
  rollback,
} from "../services/commerce.service.js";
import { PORTER_STATUSES, porterDispatchAllowed } from "../services/payment-policy.js";
import { changedAuditFields, joinedAuditDb, sanitizeAuditValue, writeAuditEvent } from "../services/admin-audit.js";

function cleanString(value) {
  return String(value || "").trim();
}

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function normalizeTargets(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((target) => ({
      type: cleanString(target.type || target.target_type),
      id: Number(target.id || target.target_id),
    }))
    .filter(
      (target) =>
        ["Product", "Category", "Collection"].includes(target.type) && target.id
    );
}

function normalizeLocations(value, fallbackRegion = "All India") {
  const input = Array.isArray(value) && value.length
    ? value
    : [{ type: fallbackRegion === "All India" ? "All India" : "State", value: fallbackRegion }];
  return input
    .map((location) => ({
      type: cleanString(location.type || location.location_type) || "All India",
      value: cleanString(location.value || location.location_value),
    }))
    .filter((location) =>
      ["All India", "State", "Pincode"].includes(location.type)
    )
    .map((location) =>
      location.type === "All India" ? { ...location, value: "" } : location
    );
}

async function activity(req, action, detail) {
  await dbQuery(
    `INSERT INTO admin_activity (admin_id, actor, action, module, detail)
     VALUES (?, ?, ?, 'Shipping & Payments', ?)`,
    [
      Number(req.admin?.id) || null,
      req.admin?.name || req.admin?.email || "Admin",
      action,
      detail,
    ]
  ).catch(() => {});
}

export async function getCommerceShipping(req, res) {
  try {
    const rules = await dbQuery(`
      SELECT id, name, region, min_order_value, charge, delivery_days, eta, status, priority
        FROM shipping_rules
       ORDER BY priority DESC, min_order_value DESC, id
    `);
    if (rules.length) {
      const ids = rules.map((rule) => Number(rule.id));
      const [targets, locations] = await Promise.all([
        dbQuery(
          `SELECT rule_id, target_type, target_id
             FROM shipping_rule_targets
            WHERE rule_id IN (${ids.map(() => "?").join(",")})`,
          ids
        ),
        dbQuery(
          `SELECT rule_id, location_type, location_value
             FROM shipping_rule_locations
            WHERE rule_id IN (${ids.map(() => "?").join(",")})`,
          ids
        ),
      ]);
      rules.forEach((rule) => {
        rule.targets = targets
          .filter((target) => Number(target.rule_id) === Number(rule.id))
          .map((target) => ({
            type: target.target_type,
            id: Number(target.target_id),
          }));
        rule.locations = locations
          .filter((location) => Number(location.rule_id) === Number(rule.id))
          .map((location) => ({
            type: location.location_type,
            value: location.location_value,
          }));
      });
    }
    const orders = await dbQuery(`
      SELECT id, order_number, customer_name, city, state, shipping_fee, order_status, created_at
        FROM orders
       ORDER BY created_at DESC
       LIMIT 80
    `);
    const activeOrders = orders.filter((order) =>
      ["Pending", "Processing", "Dispatched", "In Transit"].includes(order.order_status)
    );
    const history = orders.filter((order) =>
      ["Delivered", "Cancelled"].includes(order.order_status)
    );
    res.json({
      summary: {
        activeRules: rules.filter((rule) => rule.status === "Active").length,
        freeShippingRules: rules.filter((rule) => Number(rule.charge) === 0).length,
        dispatchQueue: activeOrders.length,
        dispatchedHistory: history.length,
      },
      rules,
      dispatchQueue: activeOrders,
      history,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Failed to load shipping data" });
  }
}

async function saveShippingRule(req, res, id = null) {
  const name = cleanString(req.body?.name) || "Shipping Rule";
  const minOrderValue = toMoney(req.body?.min_order_value ?? req.body?.minOrderValue);
  const charge = toMoney(req.body?.charge);
  const deliveryDays = Math.max(
    1,
    Number(req.body?.delivery_days ?? req.body?.deliveryDays ?? 3) || 3
  );
  const status = cleanString(req.body?.status) || "Active";
  const priority = Number(req.body?.priority) || 0;
  const targets = normalizeTargets(req.body?.targets);
  const locations = normalizeLocations(req.body?.locations, req.body?.region);
  const region =
    locations.length === 1
      ? locations[0].type === "All India"
        ? "All India"
        : locations[0].value
      : "Multiple";
  const connection = await getConnection();
  try {
    await beginTransaction(connection);
    let ruleId = Number(id);
    if (ruleId) {
      const result = await connectionQuery(
        connection,
        `UPDATE shipping_rules
            SET name=?, region=?, min_order_value=?, charge=?, delivery_days=?,
                eta=?, status=?, priority=?
          WHERE id=?`,
        [
          name,
          region,
          minOrderValue,
          charge,
          deliveryDays,
          `${deliveryDays} days`,
          status,
          priority,
          ruleId,
        ]
      );
      if (!result.affectedRows) {
        await rollback(connection);
        return res.status(404).json({ message: "Shipping rule not found" });
      }
      await connectionQuery(connection, "DELETE FROM shipping_rule_targets WHERE rule_id=?", [ruleId]);
      await connectionQuery(connection, "DELETE FROM shipping_rule_locations WHERE rule_id=?", [ruleId]);
    } else {
      const result = await connectionQuery(
        connection,
        `INSERT INTO shipping_rules
          (name, region, min_order_value, charge, delivery_days, eta, status, priority)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          region,
          minOrderValue,
          charge,
          deliveryDays,
          `${deliveryDays} days`,
          status,
          priority,
        ]
      );
      ruleId = Number(result.insertId);
    }
    for (const target of targets) {
      await connectionQuery(
        connection,
        `INSERT INTO shipping_rule_targets (rule_id, target_type, target_id)
         VALUES (?, ?, ?)`,
        [ruleId, target.type, target.id]
      );
    }
    for (const location of locations) {
      await connectionQuery(
        connection,
        `INSERT INTO shipping_rule_locations (rule_id, location_type, location_value)
         VALUES (?, ?, ?)`,
        [ruleId, location.type, location.value]
      );
    }
    await commit(connection);
    await activity(req, id ? "Updated shipping rule" : "Created shipping rule", name);
    res.status(id ? 200 : 201).json({
      message: id ? "Shipping rule updated" : "Shipping rule created",
      id: ruleId,
    });
  } catch (error) {
    await rollback(connection);
    res.status(400).json({ message: error.message || "Failed to save shipping rule" });
  } finally {
    connection.release();
  }
}

export function createCommerceShippingRule(req, res) {
  return saveShippingRule(req, res);
}

export function updateCommerceShippingRule(req, res) {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid shipping rule ID" });
  return saveShippingRule(req, res, id);
}

export async function getPaymentSettings(_req, res) {
  try {
    const [settings] = await dbQuery("SELECT * FROM payment_settings WHERE id=1");
    const rules = await dbQuery(
      "SELECT * FROM partial_cod_rules ORDER BY priority DESC, id DESC"
    );
    const configured = Boolean(
      cleanString(process.env.RAZORPAY_KEY_ID) &&
        cleanString(process.env.RAZORPAY_KEY_SECRET) &&
        cleanString(process.env.RAZORPAY_WEBHOOK_SECRET)
    );
    res.json({
      settings: {
        ...settings,
        razorpayConfigured: configured,
        webhookUrl: "https://goldencreation.in/api/payments/razorpay/webhook",
      },
      rules,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Failed to load payment settings" });
  }
}

export async function updatePaymentSettings(req, res) {
  const percentage = 20;
  const holdMinutes = Math.max(
    5,
    Math.min(120, Number(req.body?.stock_hold_minutes ?? 30))
  );
  try {
    const minAmount = 1000;
    const maxAmount = 3000;
    const partialAbove = 3000;
    const codDistance = 40;
    const porterDistance = 40;
    const connection = await getConnection();
    try {
      await beginTransaction(connection);
      const beforeRows = await connectionQuery(connection, "SELECT * FROM payment_settings WHERE id = 1 FOR UPDATE");
      await connectionQuery(
        connection,
        `UPDATE payment_settings
          SET full_online_enabled=?,
              partial_cod_enabled=?,
              full_cod_enabled=?,
              default_partial_percent=?,
              stock_hold_minutes=?,
              cod_min_amount=?,
              cod_max_amount=?,
              cod_pin_restricted=?,
              cod_pins=?,
              porter_enabled=?,
              porter_pins=?,
              porter_collects_cod=?,
              cod_max_distance_km=?,
              partial_cod_above=?,
              porter_max_distance_km=?,
              porter_requires_full_payment=?,
              porter_customer_pays_delivery=?,
              updated_by=?
        WHERE id=1`,
        [
          1,
          req.body?.partial_cod_enabled ? 1 : 0,
          req.body?.full_cod_enabled ? 1 : 0,
          percentage,
          holdMinutes,
          minAmount,
          maxAmount,
          req.body?.cod_pin_restricted ? 1 : 0,
          cleanString(req.body?.cod_pins).slice(0, 4000),
          req.body?.porter_enabled ? 1 : 0,
          cleanString(req.body?.porter_pins).slice(0, 4000),
          0,
          codDistance,
          partialAbove,
          porterDistance,
          1,
          1,
          Number(req.admin?.id) || null,
        ]
      );
      const afterRows = await connectionQuery(connection, "SELECT * FROM payment_settings WHERE id = 1");
      await writeAuditEvent({
        adminId: req.admin?.id,
        actorName: req.admin?.name,
        actorEmail: req.admin?.email,
        actorRole: req.admin?.role,
        source: "backend",
        layer: "confirmed",
        module: "Payments",
        page: "/payment-settings",
        action: "Update",
        outcome: "success",
        method: "PUT",
        path: "/payment-settings",
        recordId: "1",
        previousValue: sanitizeAuditValue(beforeRows[0] || {}),
        updatedValue: sanitizeAuditValue(afterRows[0] || {}),
        changedFields: changedAuditFields(beforeRows[0], afterRows[0]),
        detail: { persistence: "same-transaction", confirmed: true },
      }, joinedAuditDb((sql, params) => connectionQuery(connection, sql, params)));
      await commit(connection);
      req.auditPersisted = true;
    } catch (error) {
      await rollback(connection);
      throw error;
    } finally {
      connection.release();
    }
    await activity(req, "Updated payment settings", `Partial COD ${percentage}%`);
    res.json({ message: "Payment settings updated" });
  } catch (error) {
    res.status(400).json({ message: error.message || "Failed to update payment settings" });
  }
}

export async function savePartialCodRule(req, res) {
  return res.status(422).json({
    message: "Partial COD overrides cannot change the approved 20% advance or the product price bands",
  });
}

export async function savePorterBooking(req, res) {
  const id = Number(req.params.id);
  const reference = cleanString(req.body?.porter_booking_reference || req.body?.reference).slice(0, 120);
  const status = cleanString(req.body?.porter_status || req.body?.status) || "Booked";
  if (!id) return res.status(400).json({ message: "Invalid order" });
  if (!PORTER_STATUSES.includes(status)) {
    return res.status(400).json({ message: "Choose a Porter delivery status" });
  }
  try {
    const rows = await dbQuery(
      "SELECT id, delivery_method, payment_status, total_amount, amount_paid, cod_due FROM orders WHERE id = ? LIMIT 1",
      [id]
    );
    const order = rows[0];
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.delivery_method !== "Porter") {
      return res.status(422).json({ message: "This order does not use Porter delivery" });
    }
    const dispatch = porterDispatchAllowed(order, status);
    if (!dispatch.allowed) {
      return res.status(422).json({ message: dispatch.reason });
    }
    await dbQuery(
      `UPDATE orders
          SET porter_booking_reference = ?,
              porter_status = ?,
              logistics_provider = 'Porter'
        WHERE id = ?`,
      [reference || null, status, id]
    );
    await activity(req, "Saved Porter booking", `Order ${id}: ${reference || status}`);
    res.json({
      message: "Porter booking saved",
      porter_booking_reference: reference,
      porter_status: status,
      total_amount: order.total_amount,
      amount_paid: order.amount_paid,
      cod_due: order.cod_due,
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Failed to save Porter booking" });
  }
}

export async function deletePartialCodRule(req, res) {
  try {
    await dbQuery("DELETE FROM partial_cod_rules WHERE id=?", [Number(req.params.id)]);
    await activity(req, "Deleted Partial COD rule", `Rule ${req.params.id}`);
    res.json({ message: "Partial COD rule deleted" });
  } catch (error) {
    res.status(400).json({ message: error.message || "Failed to delete Partial COD rule" });
  }
}
