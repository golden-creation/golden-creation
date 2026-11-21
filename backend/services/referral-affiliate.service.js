import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

import {
  beginTransaction,
  commit,
  connectionQuery,
  dbQuery,
  getConnection,
  rollback,
} from "./commerce.service.js";

export function cleanString(value) {
  return String(value || "").trim();
}

export function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

export function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function hashValue(value) {
  const normalized = cleanString(value);
  return normalized
    ? crypto.createHash("sha256").update(normalized).digest("hex")
    : null;
}

function randomCode(prefix) {
  return `${prefix}${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

function jwtSecret() {
  return process.env.JWT_SECRET || "local_dev_secret_change_before_deploy";
}

function affiliateToken(affiliate) {
  return jwt.sign(
    {
      id: Number(affiliate.id),
      name: affiliate.name,
      email: affiliate.email,
      role: "affiliate",
      type: "affiliate",
    },
    jwtSecret(),
    { expiresIn: "8h" }
  );
}

export function verifyAffiliateToken(token) {
  const payload = jwt.verify(token, jwtSecret());
  if (payload.type !== "affiliate" || !payload.id) {
    throw new Error("Affiliate access required");
  }
  return payload;
}

export function publicAffiliate(affiliate) {
  if (!affiliate) return null;
  return {
    id: Number(affiliate.id),
    name: affiliate.name || "",
    email: affiliate.email || "",
    phone: affiliate.phone || "",
    businessName: affiliate.business_name || "",
    socialProfile: affiliate.social_profile || "",
    city: affiliate.city || "",
    state: affiliate.state || "",
    status: affiliate.status || "Pending",
    role: "affiliate",
  };
}

export async function getReferralSettings(connection = null) {
  const rows = await dbQuery(
    "SELECT * FROM referral_settings WHERE id = 1 LIMIT 1",
    [],
    connection || undefined
  );
  return (
    rows[0] || {
      minimum_cashout: 500,
      attribution_window_days: 30,
      commission_hold_days: 10,
      default_referral_percent: 0,
      default_affiliate_percent: 0,
      self_referral_blocking: 1,
      status: "Active",
    }
  );
}

async function createUniqueCode(ownerType, ownerId, connection = null) {
  const prefix = ownerType === "affiliate" ? "AFF" : "GC";
  for (let index = 0; index < 12; index += 1) {
    const code = randomCode(prefix);
    const existing = await dbQuery(
      "SELECT id FROM referral_codes WHERE code = ? LIMIT 1",
      [code],
      connection || undefined
    );
    if (!existing.length) return code;
  }
  return `${prefix}${ownerId}${Date.now().toString(36).toUpperCase()}`;
}

export async function ensureReferralCode(ownerType, ownerId, connection = null) {
  const normalizedOwnerType = ownerType === "affiliate" ? "affiliate" : "customer";
  const id = Number(ownerId) || 0;
  if (!id) return null;

  const rows = await dbQuery(
    "SELECT * FROM referral_codes WHERE owner_type = ? AND owner_id = ? LIMIT 1",
    [normalizedOwnerType, id],
    connection || undefined
  );
  if (rows[0]) return rows[0];

  const code = await createUniqueCode(normalizedOwnerType, id, connection);
  await dbQuery(
    `INSERT INTO referral_codes (owner_type, owner_id, code, status)
     VALUES (?, ?, ?, 'Active')`,
    [normalizedOwnerType, id, code],
    connection || undefined
  );
  const nextRows = await dbQuery(
    "SELECT * FROM referral_codes WHERE owner_type = ? AND owner_id = ? LIMIT 1",
    [normalizedOwnerType, id],
    connection || undefined
  );
  return nextRows[0] || null;
}

export async function resolveReferralCode(code, connection = null) {
  const normalized = cleanString(code).toUpperCase();
  if (!normalized) return null;
  const rows = await dbQuery(
    `SELECT rc.*
       FROM referral_codes rc
      WHERE rc.code = ? AND rc.status = 'Active'
      LIMIT 1`,
    [normalized],
    connection || undefined
  );
  const row = rows[0];
  if (!row) return null;

  if (row.owner_type === "affiliate") {
    const affiliates = await dbQuery(
      "SELECT id, name, email, phone, status FROM affiliate_accounts WHERE id = ? LIMIT 1",
      [row.owner_id],
      connection || undefined
    );
    if (!affiliates[0] || affiliates[0].status !== "Approved") return null;
    return { ...row, owner: affiliates[0] };
  }

  const users = await dbQuery(
    "SELECT id, name, email, phone FROM users WHERE id = ? LIMIT 1",
    [row.owner_id],
    connection || undefined
  );
  if (!users[0]) return null;
  return { ...row, owner: users[0] };
}

export async function recordReferralClick(payload = {}, req = null) {
  const code = cleanString(payload.code || payload.ref || payload.aff || payload.utm_ref).toUpperCase();
  const resolved = await resolveReferralCode(code);
  if (!resolved) {
    const error = new Error("Referral code is invalid or inactive");
    error.statusCode = 404;
    throw error;
  }

  await dbQuery(
    `INSERT INTO referral_clicks
      (code_id, code, referrer_type, referrer_id, source, landing_url,
       product_id, category_id, visitor_key, ip_hash, user_agent_hash, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      resolved.id,
      resolved.code,
      resolved.owner_type,
      resolved.owner_id,
      cleanString(payload.source || "website") || null,
      cleanString(payload.landingUrl || payload.landing_url) || null,
      Number(payload.productId || payload.product_id) || null,
      Number(payload.categoryId || payload.category_id) || null,
      cleanString(payload.visitorKey || payload.visitor_key) || null,
      hashValue(req?.ip || req?.socket?.remoteAddress),
      hashValue(req?.headers?.["user-agent"]),
      JSON.stringify({
        referrer: req?.headers?.referer || "",
        userAgent: req?.headers?.["user-agent"] || "",
      }),
    ]
  );

  return {
    code: resolved.code,
    ownerType: resolved.owner_type,
    ownerId: Number(resolved.owner_id),
    attributionWindowDays: Number((await getReferralSettings()).attribution_window_days || 30),
  };
}

function normalizedAttribution(payload = {}) {
  const direct = payload.referralAttribution || payload.referral_attribution || {};
  const code = cleanString(
    direct.code || payload.referralCode || payload.referral_code || payload.ref || payload.aff || payload.utm_ref
  ).toUpperCase();
  if (!code) return null;
  return {
    code,
    source: cleanString(direct.source || payload.referralSource || "website") || "website",
    capturedAt: cleanString(direct.capturedAt || direct.captured_at),
    landingUrl: cleanString(direct.landingUrl || direct.landing_url),
    visitorKey: cleanString(direct.visitorKey || direct.visitor_key),
  };
}

async function isSelfReferral({ resolved, order, settings }) {
  if (!Number(settings.self_referral_blocking || 0)) return "";
  if (resolved.owner_type === "customer") {
    if (Number(order.user_id || 0) && Number(order.user_id) === Number(resolved.owner_id)) {
      return "Purchaser and referrer are the same customer";
    }
    const owner = resolved.owner || {};
    const ownerEmail = cleanString(owner.email).toLowerCase();
    const ownerPhone = cleanString(owner.phone).replace(/\D/g, "");
    const orderEmail = cleanString(order.customer_email).toLowerCase();
    const orderPhone = cleanString(order.customer_phone).replace(/\D/g, "");
    if (ownerEmail && orderEmail && ownerEmail === orderEmail) return "Purchaser email matches referrer";
    if (ownerPhone && orderPhone && ownerPhone === orderPhone) return "Purchaser phone matches referrer";
  }
  if (resolved.owner_type === "affiliate") {
    const owner = resolved.owner || {};
    const ownerEmail = cleanString(owner.email).toLowerCase();
    const ownerPhone = cleanString(owner.phone).replace(/\D/g, "");
    const orderEmail = cleanString(order.customer_email).toLowerCase();
    const orderPhone = cleanString(order.customer_phone).replace(/\D/g, "");
    if (ownerEmail && orderEmail && ownerEmail === orderEmail) return "Purchaser email matches affiliate";
    if (ownerPhone && orderPhone && ownerPhone === orderPhone) return "Purchaser phone matches affiliate";
  }
  return "";
}

export async function captureOrderAttribution(orderId, payload = {}, connection = null) {
  const attribution = normalizedAttribution(payload);
  if (!Number(orderId) || !attribution?.code) return null;

  const resolved = await resolveReferralCode(attribution.code, connection);
  if (!resolved) return null;
  const settings = await getReferralSettings(connection);
  const orders = await dbQuery(
    "SELECT id, user_id, customer_email, customer_phone FROM orders WHERE id = ? LIMIT 1",
    [orderId],
    connection || undefined
  );
  const order = orders[0];
  if (!order) return null;

  const blockedReason = await isSelfReferral({ resolved, order, settings });
  const status = blockedReason ? "Blocked" : "Locked";

  await dbQuery(
    `INSERT INTO order_referrals
      (order_id, code_id, code, referrer_type, referrer_id, purchaser_user_id,
       status, blocked_reason, attribution_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       code_id = VALUES(code_id),
       code = VALUES(code),
       referrer_type = VALUES(referrer_type),
       referrer_id = VALUES(referrer_id),
       purchaser_user_id = VALUES(purchaser_user_id),
       status = VALUES(status),
       blocked_reason = VALUES(blocked_reason),
       attribution_json = VALUES(attribution_json)`,
    [
      orderId,
      resolved.id,
      resolved.code,
      resolved.owner_type,
      resolved.owner_id,
      Number(order.user_id || 0) || null,
      status,
      blockedReason || null,
      JSON.stringify(attribution),
    ],
    connection || undefined
  );

  await dbQuery(
    `UPDATE orders
        SET referral_code = ?,
            referral_owner_type = ?,
            referral_owner_id = ?
      WHERE id = ?`,
    [resolved.code, resolved.owner_type, resolved.owner_id, orderId],
    connection || undefined
  );

  if (blockedReason) {
    await dbQuery(
      `INSERT INTO admin_notifications (type, title, message, link)
       VALUES ('referral_blocked', 'Referral blocked', ?, ?)`,
      [`Order ${orderId}: ${blockedReason}`, `/orders/${orderId}`],
      connection || undefined
    ).catch(() => {});
  }

  return {
    code: resolved.code,
    referrerType: resolved.owner_type,
    referrerId: Number(resolved.owner_id),
    status,
    blockedReason,
  };
}

async function categoryAncestors(categoryId, connection = null) {
  const ids = new Set();
  let current = Number(categoryId) || 0;
  for (let depth = 0; current && depth < 12; depth += 1) {
    ids.add(current);
    const rows = await dbQuery(
      "SELECT parent_id FROM categories WHERE id = ? LIMIT 1",
      [current],
      connection || undefined
    );
    current = Number(rows[0]?.parent_id || 0);
  }
  return ids;
}

async function selectCommissionRule({ programType, productId, categoryId, connection }) {
  const nowClause = `(starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at >= NOW())`;
  const rules = await dbQuery(
    `SELECT *
       FROM commission_rules
      WHERE program_type = ?
        AND status = 'Active'
        AND ${nowClause}
      ORDER BY priority DESC, id DESC`,
    [programType],
    connection || undefined
  );
  const ancestors = await categoryAncestors(categoryId, connection);
  const productRules = rules.filter(
    (rule) => rule.target_type === "Product" && Number(rule.target_id) === Number(productId)
  );
  if (productRules.length) return productRules[0];
  const categoryRules = rules.filter(
    (rule) => rule.target_type === "Category" && ancestors.has(Number(rule.target_id))
  );
  if (categoryRules.length) return categoryRules[0];
  return rules.find((rule) => rule.target_type === "Global") || null;
}

function commissionFromRule(rule, baseAmount, settings, programType) {
  const fallbackPercent =
    programType === "affiliate"
      ? Number(settings.default_affiliate_percent || 0)
      : Number(settings.default_referral_percent || 0);
  const type = rule?.commission_type || "percent";
  const value = Number(rule?.commission_value ?? fallbackPercent) || 0;
  const amount = type === "fixed" ? value : (baseAmount * value) / 100;
  return {
    commissionType: type,
    commissionValue: value,
    commissionAmount: toMoney(Math.max(0, amount)),
  };
}

export async function calculateOrderCommission(orderId, externalConnection = null) {
  const connection = externalConnection || (await getConnection());
  const ownsConnection = !externalConnection;
  try {
    if (ownsConnection) await beginTransaction(connection);
    const orderRows = await connectionQuery(
      connection,
      "SELECT * FROM orders WHERE id = ? FOR UPDATE",
      [orderId]
    );
    const order = orderRows[0];
    if (!order) throw new Error("Order not found");
    if (!["Processing", "Dispatched", "In Transit", "Delivered"].includes(order.order_status)) {
      if (ownsConnection) await commit(connection);
      return { created: 0, skipped: "Order is not commissionable yet" };
    }
    const referralRows = await connectionQuery(
      connection,
      "SELECT * FROM order_referrals WHERE order_id = ? LIMIT 1",
      [order.id]
    );
    const referral = referralRows[0];
    if (!referral || referral.status !== "Locked") {
      if (ownsConnection) await commit(connection);
      return { created: 0, skipped: "No locked referral" };
    }

    const settings = await getReferralSettings(connection);
    const programType = referral.referrer_type === "affiliate" ? "affiliate" : "customer_referral";
    const itemRows = await connectionQuery(
      connection,
      `SELECT oi.*, p.category_id
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = ?
        ORDER BY oi.id`,
      [order.id]
    );
    const subtotal = Math.max(0, Number(order.subtotal || 0));
    const totalDiscount = Math.max(0, Number(order.discount_amount || 0));
    const releaseAfter = new Date(Date.now() + Number(settings.commission_hold_days || 10) * 24 * 60 * 60 * 1000);
    let created = 0;

    for (const item of itemRows) {
      const lineTotal = Math.max(0, Number(item.line_total || 0));
      const discountShare = subtotal > 0 ? (lineTotal / subtotal) * totalDiscount : 0;
      const baseAmount = toMoney(Math.max(0, lineTotal - discountShare - Number(item.gst_amount || 0)));
      if (baseAmount <= 0) continue;
      const rule = await selectCommissionRule({
        programType,
        productId: item.product_id,
        categoryId: item.category_id,
        connection,
      });
      const computed = commissionFromRule(rule, baseAmount, settings, programType);
      if (computed.commissionAmount <= 0) continue;
      const dedupeKey = `${order.id}:${item.id}:${referral.referrer_type}:${referral.referrer_id}`;
      const result = await connectionQuery(
        connection,
        `INSERT IGNORE INTO commission_ledger
          (dedupe_key, order_id, order_item_id, referrer_type, referrer_id,
           program_type, product_id, category_id, base_amount, commission_type,
           commission_value, commission_amount, status, release_after, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)`,
        [
          dedupeKey,
          order.id,
          item.id,
          referral.referrer_type,
          referral.referrer_id,
          programType,
          item.product_id || null,
          item.category_id || null,
          baseAmount,
          computed.commissionType,
          computed.commissionValue,
          computed.commissionAmount,
          releaseAfter,
          JSON.stringify({ ruleId: rule?.id || null, orderNumber: order.order_number }),
        ]
      );
      created += Number(result.affectedRows || 0);
    }

    if (ownsConnection) await commit(connection);
    return { created };
  } catch (error) {
    if (ownsConnection) await rollback(connection);
    throw error;
  } finally {
    if (ownsConnection) connection.release();
  }
}

export async function releaseEligibleCommissions() {
  const result = await dbQuery(
    `UPDATE commission_ledger cl
       JOIN orders o ON o.id = cl.order_id
        SET cl.status = 'Approved',
            cl.released_at = NOW()
      WHERE cl.status = 'Pending'
        AND cl.release_after IS NOT NULL
        AND cl.release_after <= NOW()
        AND o.order_status = 'Delivered'`
  );
  return Number(result.affectedRows || 0);
}

export async function reverseOrderCommissions(orderId, reason = "Order reversed") {
  const result = await dbQuery(
    `UPDATE commission_ledger
        SET status = 'Reversed',
            reason = ?,
            updated_at = NOW()
      WHERE order_id = ?
        AND status IN ('Pending','Approved')`,
    [cleanString(reason) || "Order reversed", orderId]
  );
  await dbQuery(
    "UPDATE order_referrals SET status = 'Reversed' WHERE order_id = ? AND status = 'Locked'",
    [orderId]
  ).catch(() => {});
  return Number(result.affectedRows || 0);
}

export async function walletSummary(ownerType, ownerId) {
  const rows = await dbQuery(
    `SELECT
        COALESCE(SUM(CASE WHEN status = 'Approved' AND withdrawal_id IS NULL THEN commission_amount ELSE 0 END), 0) AS available,
        COALESCE(SUM(CASE WHEN status = 'Pending' THEN commission_amount ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN status = 'Paid' THEN commission_amount ELSE 0 END), 0) AS paid,
        COALESCE(SUM(CASE WHEN status IN ('Rejected','Reversed') THEN commission_amount ELSE 0 END), 0) AS rejected
       FROM commission_ledger
      WHERE referrer_type = ? AND referrer_id = ?`,
    [ownerType, ownerId]
  );
  const withdrawalRows = await dbQuery(
    `SELECT COALESCE(SUM(amount), 0) AS requested
       FROM wallet_withdrawal_requests
      WHERE owner_type = ? AND owner_id = ? AND status IN ('Requested','Approved')`,
    [ownerType, ownerId]
  );
  const settings = await getReferralSettings();
  return {
    available: toMoney(rows[0]?.available),
    pending: toMoney(rows[0]?.pending),
    paid: toMoney(rows[0]?.paid),
    rejected: toMoney(rows[0]?.rejected),
    requested: toMoney(withdrawalRows[0]?.requested),
    minimumCashout: toMoney(settings.minimum_cashout),
    holdDays: Number(settings.commission_hold_days || 10),
  };
}

export async function createWithdrawalRequest({ ownerType, ownerId, amount, payoutMethodId }) {
  const normalizedAmount = toMoney(amount);
  const summary = await walletSummary(ownerType, ownerId);
  if (normalizedAmount < summary.minimumCashout) {
    const error = new Error(`Minimum cashout amount is Rs. ${summary.minimumCashout}`);
    error.statusCode = 400;
    throw error;
  }
  if (normalizedAmount > summary.available) {
    const error = new Error("Cashout amount exceeds available balance");
    error.statusCode = 400;
    throw error;
  }
  const methods = await dbQuery(
    "SELECT id FROM wallet_payout_methods WHERE id = ? AND owner_type = ? AND owner_id = ? AND status = 'Active' LIMIT 1",
    [payoutMethodId, ownerType, ownerId]
  );
  if (!methods.length) {
    const error = new Error("Add a valid payout method before requesting cashout");
    error.statusCode = 400;
    throw error;
  }

  const connection = await getConnection();
  try {
    await beginTransaction(connection);
    const result = await connectionQuery(
      connection,
      `INSERT INTO wallet_withdrawal_requests
        (owner_type, owner_id, amount, payout_method_id, status)
       VALUES (?, ?, ?, ?, 'Requested')`,
      [ownerType, ownerId, normalizedAmount, payoutMethodId]
    );
    let remaining = normalizedAmount;
    const ledgerRows = await connectionQuery(
      connection,
      `SELECT id, commission_amount
         FROM commission_ledger
        WHERE referrer_type = ? AND referrer_id = ?
          AND status = 'Approved' AND withdrawal_id IS NULL
        ORDER BY released_at, id
        FOR UPDATE`,
      [ownerType, ownerId]
    );
    for (const row of ledgerRows) {
      if (remaining <= 0) break;
      await connectionQuery(
        connection,
        "UPDATE commission_ledger SET withdrawal_id = ? WHERE id = ?",
        [result.insertId, row.id]
      );
      remaining = toMoney(remaining - Number(row.commission_amount || 0));
    }
    await commit(connection);
    await dbQuery(
      `INSERT INTO admin_notifications (type, title, message, link)
       VALUES ('wallet_withdrawal', 'Wallet cashout requested', ?, '/referrals?tab=payouts')`,
      [`${ownerType} ${ownerId} requested Rs. ${normalizedAmount}`]
    ).catch(() => {});
    return result.insertId;
  } catch (error) {
    await rollback(connection);
    throw error;
  } finally {
    connection.release();
  }
}

export async function markWithdrawalPaid(requestId, adminId, reference, remarks = "") {
  const connection = await getConnection();
  try {
    await beginTransaction(connection);
    const rows = await connectionQuery(
      connection,
      "SELECT * FROM wallet_withdrawal_requests WHERE id = ? FOR UPDATE",
      [requestId]
    );
    const request = rows[0];
    if (!request) {
      const error = new Error("Withdrawal request not found");
      error.statusCode = 404;
      throw error;
    }
    await connectionQuery(
      connection,
      `UPDATE wallet_withdrawal_requests
          SET status = 'Paid',
              payout_reference = ?,
              admin_remarks = ?,
              decided_by = ?,
              decided_at = COALESCE(decided_at, NOW()),
              paid_at = NOW()
        WHERE id = ?`,
      [cleanString(reference) || null, cleanString(remarks) || null, adminId || null, requestId]
    );
    await connectionQuery(
      connection,
      "UPDATE commission_ledger SET status = 'Paid', paid_at = NOW() WHERE withdrawal_id = ?",
      [requestId]
    );
    await commit(connection);
    return true;
  } catch (error) {
    await rollback(connection);
    throw error;
  } finally {
    connection.release();
  }
}

export async function rejectWithdrawal(requestId, adminId, remarks = "") {
  const connection = await getConnection();
  try {
    await beginTransaction(connection);
    await connectionQuery(
      connection,
      `UPDATE wallet_withdrawal_requests
          SET status = 'Rejected',
              admin_remarks = ?,
              decided_by = ?,
              decided_at = NOW()
        WHERE id = ?`,
      [cleanString(remarks) || null, adminId || null, requestId]
    );
    await connectionQuery(
      connection,
      "UPDATE commission_ledger SET withdrawal_id = NULL WHERE withdrawal_id = ? AND status = 'Approved'",
      [requestId]
    );
    await commit(connection);
    return true;
  } catch (error) {
    await rollback(connection);
    throw error;
  } finally {
    connection.release();
  }
}

export async function createAffiliateSession({ email, password }) {
  const normalizedEmail = cleanString(email).toLowerCase();
  const rows = await dbQuery(
    "SELECT * FROM affiliate_accounts WHERE email = ? LIMIT 1",
    [normalizedEmail]
  );
  const affiliate = rows[0];
  if (!affiliate || affiliate.status !== "Approved") {
    const error = new Error("Invalid affiliate credentials");
    error.statusCode = 401;
    throw error;
  }
  const matches = await bcrypt.compare(String(password || ""), affiliate.password_hash);
  if (!matches) {
    const error = new Error("Invalid affiliate credentials");
    error.statusCode = 401;
    throw error;
  }
  await dbQuery("UPDATE affiliate_accounts SET last_login_at = NOW() WHERE id = ?", [affiliate.id]);
  await ensureReferralCode("affiliate", affiliate.id);
  return {
    token: affiliateToken(affiliate),
    affiliate: publicAffiliate(affiliate),
  };
}

export async function ownerLedger({ ownerType, ownerId, limit = 100 }) {
  return dbQuery(
    `SELECT cl.*, o.order_number, o.created_at AS order_created_at, p.name AS product_name
       FROM commission_ledger cl
       LEFT JOIN orders o ON o.id = cl.order_id
       LEFT JOIN products p ON p.id = cl.product_id
      WHERE cl.referrer_type = ? AND cl.referrer_id = ?
      ORDER BY cl.created_at DESC
      LIMIT ?`,
    [ownerType, ownerId, Math.min(200, Math.max(1, Number(limit) || 100))]
  );
}

export function payoutMethodPayload(body = {}) {
  const methodType = cleanString(body.methodType || body.method_type || "UPI").toUpperCase() === "BANK" ? "Bank" : "UPI";
  return {
    methodType,
    accountHolder: cleanString(body.accountHolder || body.account_holder),
    upiId: cleanString(body.upiId || body.upi_id),
    bankName: cleanString(body.bankName || body.bank_name),
    accountNumber: cleanString(body.accountNumber || body.account_number),
    ifsc: cleanString(body.ifsc).toUpperCase(),
  };
}

export async function createAffiliateAccount(payload = {}, adminId = null) {
  const email = cleanString(payload.email).toLowerCase();
  const name = cleanString(payload.name);
  const password = cleanString(payload.password) || crypto.randomBytes(6).toString("base64url");
  if (!name || !email) {
    const error = new Error("Affiliate name and email are required");
    error.statusCode = 400;
    throw error;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await dbQuery(
    `INSERT INTO affiliate_accounts
      (name, email, phone, password_hash, business_name, social_profile,
       city, state, promotion_channels, expected_monthly_reach, notes, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       phone = VALUES(phone),
       business_name = VALUES(business_name),
       social_profile = VALUES(social_profile),
       city = VALUES(city),
       state = VALUES(state),
       promotion_channels = VALUES(promotion_channels),
       expected_monthly_reach = VALUES(expected_monthly_reach),
       notes = VALUES(notes),
       status = VALUES(status)`,
    [
      name,
      email,
      cleanString(payload.phone) || null,
      passwordHash,
      cleanString(payload.businessName || payload.business_name) || null,
      cleanString(payload.socialProfile || payload.social_profile) || null,
      cleanString(payload.city) || null,
      cleanString(payload.state) || null,
      cleanString(payload.promotionChannels || payload.promotion_channels) || null,
      cleanString(payload.expectedMonthlyReach || payload.expected_monthly_reach) || null,
      cleanString(payload.notes) || null,
      cleanString(payload.status) || "Approved",
      adminId,
    ]
  );
  const rows = await dbQuery("SELECT * FROM affiliate_accounts WHERE email = ? LIMIT 1", [email]);
  await ensureReferralCode("affiliate", rows[0].id);
  return { affiliate: rows[0], temporaryPassword: result.insertId ? password : "" };
}
