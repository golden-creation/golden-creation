import {
  cleanString,
  dbQuery,
  parseJson,
  toMoney,
  validateDiscountCart,
} from "../services/discount.service.js";

const validationAttempts = new Map();

function standardError(res, error, message) {
  console.log(`${message}:`, error);
  res.status(500).json({ message });
}

function normalizeDate(value) {
  const source = cleanString(value);
  if (!source) return null;
  const date = new Date(source);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19).replace("T", " ");
}

function jsonValue(value, fallbackValue = {}) {
  return JSON.stringify(value && typeof value === "object" ? value : fallbackValue);
}

function randomCode(prefix = "", suffix = "", length = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${prefix}${code}${suffix}`.toUpperCase();
}

function requireCouponThrottle(req, res) {
  const key = req.ip || req.headers["x-forwarded-for"] || "local";
  const now = Date.now();
  const windowMs = 60 * 1000;
  const current = validationAttempts.get(key) || [];
  const recent = current.filter((timestamp) => now - timestamp < windowMs);

  if (recent.length >= 30) {
    validationAttempts.set(key, recent);
    res.status(429).json({ message: "Too many coupon attempts. Please wait a minute." });
    return false;
  }

  recent.push(now);
  validationAttempts.set(key, recent);
  return true;
}

async function logDiscountAudit(req, discountId, action, detail = "") {
  try {
    await dbQuery(
      `
        INSERT INTO discount_audit_logs (discount_id, admin_id, actor, action, detail)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        discountId || null,
        req.admin?.id || null,
        req.admin?.name || req.admin?.email || "Admin",
        action,
        detail,
      ]
    );

    await dbQuery(
      `
        INSERT INTO admin_activity (admin_id, actor, action, module, detail)
        VALUES (?, ?, ?, 'Discount Management', ?)
      `,
      [
        req.admin?.id || null,
        req.admin?.name || req.admin?.email || "Admin",
        action,
        detail,
      ]
    );
  } catch (error) {
    console.log("Discount audit skipped:", error.message);
  }
}

function normalizeDiscountPayload(body = {}) {
  const method = cleanString(body.method || body.discountMethod) || "Coupon";
  const discountType = cleanString(body.discount_type || body.discountType) || "Percentage";
  const code = cleanString(body.code || body.couponCode).toUpperCase();
  const config = {
    ...(body.config_json || body.config || {}),
    countries: body.countries || body.config_json?.countries || body.config?.countries || [],
    states: body.states || body.config_json?.states || body.config?.states || [],
    paymentMethods: body.paymentMethods || body.config_json?.paymentMethods || body.config?.paymentMethods || [],
    shippingMethods: body.shippingMethods || body.config_json?.shippingMethods || body.config?.shippingMethods || [],
  };

  return {
    name: cleanString(body.name) || code || "Untitled Discount",
    description: cleanString(body.description),
    method,
    code: method === "Coupon" ? code : null,
    discountType,
    value: toMoney(body.value),
    maxDiscountAmount: body.max_discount_amount === "" ? null : toMoney(body.max_discount_amount ?? body.maxDiscountAmount),
    minOrderValue: toMoney(body.min_order_value ?? body.minOrderValue),
    maxOrderValue: toMoney(body.max_order_value ?? body.maxOrderValue),
    minQuantity: Number(body.min_quantity ?? body.minQuantity) || 0,
    usageLimit: Number(body.usage_limit ?? body.usageLimit) || 0,
    usageLimitPerCustomer: Number(body.usage_limit_per_customer ?? body.usageLimitPerCustomer) || 0,
    firstOrderOnly: Boolean(body.first_order_only ?? body.firstOrderOnly),
    isStackable: Boolean(body.is_stackable ?? body.isStackable),
    preventCombination: Boolean(body.prevent_combination ?? body.preventCombination),
    status: cleanString(body.status) || "Active",
    startsAt: normalizeDate(body.starts_at ?? body.startsAt),
    endsAt: normalizeDate(body.ends_at ?? body.endsAt),
    appliesTo: body.applies_to || body.appliesTo || { scope: "all" },
    customerEligibility: body.customer_eligibility || body.customerEligibility || { scope: "all" },
    config,
    conditions: Array.isArray(body.conditions) ? body.conditions : [],
  };
}

async function syncCouponCodes(discountId, payload, generatedCodes = []) {
  const codes = new Set(generatedCodes.map((code) => cleanString(code).toUpperCase()).filter(Boolean));

  if (payload.code) {
    codes.add(payload.code);
  }

  if (Array.isArray(payload.extraCodes)) {
    payload.extraCodes.forEach((code) => codes.add(cleanString(code).toUpperCase()));
  }

  for (const code of codes) {
    await dbQuery(
      `
        INSERT INTO discount_coupon_codes (discount_id, code, usage_limit, starts_at, ends_at, status)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          usage_limit = VALUES(usage_limit),
          starts_at = VALUES(starts_at),
          ends_at = VALUES(ends_at),
          status = VALUES(status)
      `,
      [discountId, code, payload.usageLimit, payload.startsAt, payload.endsAt, payload.status]
    );
  }
}

async function syncConditions(discountId, conditions = []) {
  await dbQuery("DELETE FROM discount_conditions WHERE discount_id = ?", [discountId]);

  for (const condition of conditions) {
    await dbQuery(
      `
        INSERT INTO discount_conditions (discount_id, condition_type, operator, condition_value)
        VALUES (?, ?, ?, ?)
      `,
      [
        discountId,
        cleanString(condition.type || condition.condition_type),
        cleanString(condition.operator || "equals"),
        JSON.stringify(condition.value ?? condition.condition_value ?? null),
      ]
    );
  }
}

export async function validateCoupon(req, res) {
  if (!requireCouponThrottle(req, res)) return;

  try {
    const result = await validateDiscountCart(req.body || {});
    res.status(result.valid ? 200 : 400).json(result);
  } catch (error) {
    standardError(res, error, "Failed to validate coupon");
  }
}

export async function getApplicableDiscounts(req, res) {
  try {
    const result = await validateDiscountCart({
      ...req.body,
      code: "",
    });
    res.json(result);
  } catch (error) {
    standardError(res, error, "Failed to fetch applicable discounts");
  }
}

export async function getAdminDiscounts(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 15));
  const offset = (page - 1) * limit;
  const q = `%${cleanString(req.query.q)}%`;
  const status = cleanString(req.query.status);
  const method = cleanString(req.query.method);
  const type = cleanString(req.query.type);
  const clauses = ["d.deleted_at IS NULL"];
  const values = [];

  if (cleanString(req.query.q)) {
    clauses.push("(d.name LIKE ? OR d.code LIKE ? OR c.code LIKE ?)");
    values.push(q, q, q);
  }
  if (status) {
    clauses.push("d.status = ?");
    values.push(status);
  }
  if (method) {
    clauses.push("d.method = ?");
    values.push(method);
  }
  if (type) {
    clauses.push("d.discount_type = ?");
    values.push(type);
  }

  try {
    const where = clauses.join(" AND ");
    const rows = await dbQuery(
      `
        SELECT
          d.*,
          GROUP_CONCAT(DISTINCT c.code ORDER BY c.id SEPARATOR ', ') AS coupon_codes
        FROM discounts d
        LEFT JOIN discount_coupon_codes c ON c.discount_id = d.id
        WHERE ${where}
        GROUP BY d.id
        ORDER BY d.created_at DESC, d.id DESC
        LIMIT ? OFFSET ?
      `,
      [...values, limit, offset]
    );
    const countRows = await dbQuery(
      `
        SELECT COUNT(DISTINCT d.id) AS total
        FROM discounts d
        LEFT JOIN discount_coupon_codes c ON c.discount_id = d.id
        WHERE ${where}
      `,
      values
    );

    res.json({
      discounts: rows.map((row) => ({
        ...row,
        applies_to: parseJson(row.applies_to, {}),
        customer_eligibility: parseJson(row.customer_eligibility, {}),
        config_json: parseJson(row.config_json, {}),
      })),
      pagination: {
        page,
        limit,
        total: Number(countRows[0]?.total || 0),
      },
    });
  } catch (error) {
    standardError(res, error, "Failed to load discounts");
  }
}

export async function getAdminDiscountDetail(req, res) {
  try {
    const rows = await dbQuery("SELECT * FROM discounts WHERE id = ? AND deleted_at IS NULL LIMIT 1", [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ message: "Discount not found" });
    }

    const [couponCodes, conditions, auditLogs] = await Promise.all([
      dbQuery("SELECT * FROM discount_coupon_codes WHERE discount_id = ? ORDER BY id DESC", [req.params.id]),
      dbQuery("SELECT * FROM discount_conditions WHERE discount_id = ? ORDER BY id", [req.params.id]),
      dbQuery("SELECT * FROM discount_audit_logs WHERE discount_id = ? ORDER BY created_at DESC LIMIT 25", [req.params.id]),
    ]);

    res.json({
      discount: {
        ...rows[0],
        applies_to: parseJson(rows[0].applies_to, {}),
        customer_eligibility: parseJson(rows[0].customer_eligibility, {}),
        config_json: parseJson(rows[0].config_json, {}),
      },
      couponCodes,
      conditions: conditions.map((condition) => ({
        ...condition,
        condition_value: parseJson(condition.condition_value, null),
      })),
      auditLogs,
    });
  } catch (error) {
    standardError(res, error, "Failed to load discount");
  }
}

export async function createAdminDiscount(req, res) {
  const payload = normalizeDiscountPayload(req.body);
  const bulk = req.body?.bulk || {};
  const generatedCodes = [];

  if (payload.method === "Coupon" && !payload.code && !bulk.enabled) {
    return res.status(400).json({ message: "Coupon code is required for coupon discounts" });
  }

  if (bulk.enabled) {
    const count = Math.min(500, Math.max(1, Number(bulk.count) || 1));
    const prefix = cleanString(bulk.prefix).toUpperCase();
    const suffix = cleanString(bulk.suffix).toUpperCase();
    for (let index = 0; index < count; index += 1) {
      generatedCodes.push(randomCode(prefix, suffix, Number(bulk.length) || 8));
    }
  } else if (req.body?.autoGenerateCode) {
    payload.code = randomCode(cleanString(req.body.prefix).toUpperCase(), cleanString(req.body.suffix).toUpperCase());
    generatedCodes.push(payload.code);
  }

  try {
    const result = await dbQuery(
      `
        INSERT INTO discounts (
          name, description, method, code, discount_type, value, max_discount_amount,
          min_order_value, max_order_value, min_quantity, usage_limit,
          usage_limit_per_customer, first_order_only, is_stackable, prevent_combination,
          status, starts_at, ends_at, applies_to, customer_eligibility, config_json, created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.name,
        payload.description,
        payload.method,
        payload.code || generatedCodes[0] || null,
        payload.discountType,
        payload.value,
        payload.maxDiscountAmount,
        payload.minOrderValue,
        payload.maxOrderValue,
        payload.minQuantity,
        payload.usageLimit,
        payload.usageLimitPerCustomer,
        payload.firstOrderOnly,
        payload.isStackable,
        payload.preventCombination,
        payload.status,
        payload.startsAt,
        payload.endsAt,
        jsonValue(payload.appliesTo, { scope: "all" }),
        jsonValue(payload.customerEligibility, { scope: "all" }),
        jsonValue(payload.config),
        req.admin?.name || req.admin?.email || "Admin",
      ]
    );

    await syncCouponCodes(result.insertId, payload, generatedCodes);
    await syncConditions(result.insertId, payload.conditions);
    await logDiscountAudit(req, result.insertId, "Created discount", payload.name);

    res.status(201).json({
      message: "Discount created successfully",
      discount: { id: result.insertId, ...payload, generatedCodes },
    });
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Coupon code already exists" });
    }

    standardError(res, error, "Failed to create discount");
  }
}

export async function updateAdminDiscount(req, res) {
  const payload = normalizeDiscountPayload(req.body);

  try {
    const result = await dbQuery(
      `
        UPDATE discounts
        SET
          name = ?,
          description = ?,
          method = ?,
          code = ?,
          discount_type = ?,
          value = ?,
          max_discount_amount = ?,
          min_order_value = ?,
          max_order_value = ?,
          min_quantity = ?,
          usage_limit = ?,
          usage_limit_per_customer = ?,
          first_order_only = ?,
          is_stackable = ?,
          prevent_combination = ?,
          status = ?,
          starts_at = ?,
          ends_at = ?,
          applies_to = ?,
          customer_eligibility = ?,
          config_json = ?
        WHERE id = ?
          AND deleted_at IS NULL
      `,
      [
        payload.name,
        payload.description,
        payload.method,
        payload.code,
        payload.discountType,
        payload.value,
        payload.maxDiscountAmount,
        payload.minOrderValue,
        payload.maxOrderValue,
        payload.minQuantity,
        payload.usageLimit,
        payload.usageLimitPerCustomer,
        payload.firstOrderOnly,
        payload.isStackable,
        payload.preventCombination,
        payload.status,
        payload.startsAt,
        payload.endsAt,
        jsonValue(payload.appliesTo, { scope: "all" }),
        jsonValue(payload.customerEligibility, { scope: "all" }),
        jsonValue(payload.config),
        req.params.id,
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Discount not found" });
    }

    await syncCouponCodes(req.params.id, payload);
    await syncConditions(req.params.id, payload.conditions);
    await logDiscountAudit(req, req.params.id, "Updated discount", payload.name);

    res.json({ message: "Discount updated successfully" });
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Coupon code already exists" });
    }

    standardError(res, error, "Failed to update discount");
  }
}

export async function updateAdminDiscountStatus(req, res) {
  const status = cleanString(req.body?.status) || "Inactive";

  try {
    await dbQuery("UPDATE discounts SET status = ? WHERE id = ? AND deleted_at IS NULL", [status, req.params.id]);
    await logDiscountAudit(req, req.params.id, "Changed discount status", status);
    res.json({ message: "Discount status updated" });
  } catch (error) {
    standardError(res, error, "Failed to update discount status");
  }
}

export async function duplicateAdminDiscount(req, res) {
  try {
    const rows = await dbQuery("SELECT * FROM discounts WHERE id = ? AND deleted_at IS NULL LIMIT 1", [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ message: "Discount not found" });
    }

    const original = rows[0];
    const code = original.code ? `${original.code}-COPY-${Date.now().toString().slice(-4)}` : null;
    const result = await dbQuery(
      `
        INSERT INTO discounts (
          name, description, method, code, discount_type, value, max_discount_amount,
          min_order_value, max_order_value, min_quantity, usage_limit,
          usage_limit_per_customer, first_order_only, is_stackable, prevent_combination,
          status, starts_at, ends_at, applies_to, customer_eligibility, config_json, created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Inactive', ?, ?, ?, ?, ?, ?)
      `,
      [
        `${original.name} Copy`,
        original.description,
        original.method,
        code,
        original.discount_type,
        original.value,
        original.max_discount_amount,
        original.min_order_value,
        original.max_order_value,
        original.min_quantity,
        original.usage_limit,
        original.usage_limit_per_customer,
        original.first_order_only,
        original.is_stackable,
        original.prevent_combination,
        original.starts_at,
        original.ends_at,
        original.applies_to,
        original.customer_eligibility,
        original.config_json,
        req.admin?.name || req.admin?.email || "Admin",
      ]
    );

    if (code) {
      await syncCouponCodes(result.insertId, {
        code,
        usageLimit: original.usage_limit,
        startsAt: original.starts_at,
        endsAt: original.ends_at,
        status: "Inactive",
      });
    }

    await logDiscountAudit(req, result.insertId, "Duplicated discount", original.name);
    res.status(201).json({ message: "Discount duplicated", id: result.insertId });
  } catch (error) {
    standardError(res, error, "Failed to duplicate discount");
  }
}

export async function deleteAdminDiscount(req, res) {
  try {
    await dbQuery("UPDATE discounts SET deleted_at = NOW(), status = 'Inactive' WHERE id = ?", [req.params.id]);
    await logDiscountAudit(req, req.params.id, "Deleted discount", "Soft delete");
    res.json({ message: "Discount deleted" });
  } catch (error) {
    standardError(res, error, "Failed to delete discount");
  }
}

export async function getAdminDiscountAnalytics(req, res) {
  const from = normalizeDate(req.query.from) || "1970-01-01 00:00:00";
  const to = normalizeDate(req.query.to) || new Date().toISOString().slice(0, 19).replace("T", " ");

  try {
    const [summaryRows, topCoupons, dailyUsage, customerUsage] = await Promise.all([
      dbQuery(
        `
          SELECT
            COUNT(*) AS total_uses,
            COALESCE(SUM(amount_discounted), 0) AS revenue_impacted,
            COUNT(DISTINCT customer_email) AS customers
          FROM discount_usage
          WHERE used_at BETWEEN ? AND ?
        `,
        [from, to]
      ),
      dbQuery(
        `
          SELECT d.name, COALESCE(c.code, d.code, 'Automatic') AS code, COUNT(u.id) AS uses, COALESCE(SUM(u.amount_discounted), 0) AS amount
          FROM discount_usage u
          JOIN discounts d ON d.id = u.discount_id
          LEFT JOIN discount_coupon_codes c ON c.id = u.coupon_id
          WHERE u.used_at BETWEEN ? AND ?
          GROUP BY d.id, c.code
          ORDER BY uses DESC, amount DESC
          LIMIT 10
        `,
        [from, to]
      ),
      dbQuery(
        `
          SELECT DATE(used_at) AS date, COUNT(*) AS uses, COALESCE(SUM(amount_discounted), 0) AS amount
          FROM discount_usage
          WHERE used_at BETWEEN ? AND ?
          GROUP BY DATE(used_at)
          ORDER BY date
        `,
        [from, to]
      ),
      dbQuery(
        `
          SELECT customer_email, customer_phone, COUNT(*) AS uses, COALESCE(SUM(amount_discounted), 0) AS amount
          FROM discount_usage
          WHERE used_at BETWEEN ? AND ?
          GROUP BY customer_email, customer_phone
          ORDER BY amount DESC
          LIMIT 20
        `,
        [from, to]
      ),
    ]);

    res.json({
      summary: {
        totalUses: Number(summaryRows[0]?.total_uses || 0),
        revenueImpacted: Number(summaryRows[0]?.revenue_impacted || 0),
        customers: Number(summaryRows[0]?.customers || 0),
      },
      topCoupons,
      dailyUsage,
      customerUsage,
    });
  } catch (error) {
    standardError(res, error, "Failed to load discount analytics");
  }
}

export async function exportAdminDiscounts(req, res) {
  try {
    const rows = await dbQuery(
      `
        SELECT name, code, method, discount_type, value, usage_count, starts_at, ends_at, status
        FROM discounts
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
      `
    );
    const csv = [
      ["Name", "Code", "Method", "Type", "Value", "Usage Count", "Starts At", "Ends At", "Status"].join(","),
      ...rows.map((row) =>
        [
          row.name,
          row.code || "",
          row.method,
          row.discount_type,
          row.value,
          row.usage_count,
          row.starts_at || "",
          row.ends_at || "",
          row.status,
        ]
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=discounts.csv");
    res.send(csv);
  } catch (error) {
    standardError(res, error, "Failed to export discounts");
  }
}
