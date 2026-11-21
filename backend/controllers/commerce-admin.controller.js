import {
  beginTransaction,
  commit,
  connectionQuery,
  dbQuery,
  getConnection,
  rollback,
} from "../services/commerce.service.js";

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
  const percentage = Math.min(
    100,
    Math.max(1, Number(req.body?.default_partial_percent ?? 20))
  );
  const holdMinutes = Math.max(
    5,
    Math.min(120, Number(req.body?.stock_hold_minutes ?? 30))
  );
  try {
    await dbQuery(
      `UPDATE payment_settings
          SET full_online_enabled=?,
              partial_cod_enabled=?,
              full_cod_enabled=?,
              default_partial_percent=?,
              stock_hold_minutes=?,
              updated_by=?
        WHERE id=1`,
      [
        req.body?.full_online_enabled ? 1 : 0,
        req.body?.partial_cod_enabled ? 1 : 0,
        req.body?.full_cod_enabled === false ? 0 : 1,
        percentage,
        holdMinutes,
        Number(req.admin?.id) || null,
      ]
    );
    await activity(req, "Updated payment settings", `Partial COD ${percentage}%`);
    res.json({ message: "Payment settings updated" });
  } catch (error) {
    res.status(400).json({ message: error.message || "Failed to update payment settings" });
  }
}

export async function savePartialCodRule(req, res) {
  const type = cleanString(req.body?.target_type || req.body?.targetType);
  const targetId = Number(req.body?.target_id || req.body?.targetId);
  if (!["Product", "Category", "Collection"].includes(type) || !targetId) {
    return res.status(400).json({ message: "Choose a valid target" });
  }
  const percentage =
    req.body?.percentage === null || req.body?.percentage === ""
      ? null
      : Math.min(100, Math.max(1, Number(req.body.percentage)));
  try {
    await dbQuery(
      `INSERT INTO partial_cod_rules
        (target_type, target_id, percentage, eligible, priority, status)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         percentage=VALUES(percentage), eligible=VALUES(eligible),
         priority=VALUES(priority), status=VALUES(status)`,
      [
        type,
        targetId,
        percentage,
        req.body?.eligible === false ? 0 : 1,
        Number(req.body?.priority) || 0,
        cleanString(req.body?.status) || "Active",
      ]
    );
    await activity(req, "Saved Partial COD rule", `${type} ${targetId}`);
    res.json({ message: "Partial COD rule saved" });
  } catch (error) {
    res.status(400).json({ message: error.message || "Failed to save Partial COD rule" });
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
