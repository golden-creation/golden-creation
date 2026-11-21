import bcrypt from "bcrypt";

import { dbQuery } from "../services/commerce.service.js";
import {
  captureOrderAttribution,
  cleanString,
  createAffiliateAccount,
  createAffiliateSession,
  createWithdrawalRequest,
  ensureReferralCode,
  getReferralSettings,
  markWithdrawalPaid,
  ownerLedger,
  parseJson,
  payoutMethodPayload,
  publicAffiliate,
  recordReferralClick,
  rejectWithdrawal,
  resolveReferralCode,
  reverseOrderCommissions,
  toMoney,
  verifyAffiliateToken,
  walletSummary,
} from "../services/referral-affiliate.service.js";

function publicRule(row) {
  return {
    id: Number(row.id),
    programType: row.program_type,
    targetType: row.target_type,
    targetId: row.target_id ? Number(row.target_id) : null,
    targetName: row.target_name || "",
    commissionType: row.commission_type,
    commissionValue: Number(row.commission_value || 0),
    priority: Number(row.priority || 0),
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}

function publicLedger(row) {
  return {
    id: Number(row.id),
    orderId: row.order_id ? Number(row.order_id) : null,
    orderNumber: row.order_number || "",
    productName: row.product_name || "",
    referrerType: row.referrer_type,
    referrerId: Number(row.referrer_id),
    programType: row.program_type,
    baseAmount: Number(row.base_amount || 0),
    commissionAmount: Number(row.commission_amount || 0),
    commissionType: row.commission_type,
    commissionValue: Number(row.commission_value || 0),
    status: row.status,
    reason: row.reason || "",
    releaseAfter: row.release_after,
    releasedAt: row.released_at,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

function publicPayoutMethod(row) {
  return {
    id: Number(row.id),
    ownerType: row.owner_type,
    methodType: row.method_type,
    accountHolder: row.account_holder || "",
    upiId: row.upi_id || "",
    bankName: row.bank_name || "",
    accountNumber: row.account_number || "",
    ifsc: row.ifsc || "",
    status: row.status,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
  };
}

function publicWithdrawal(row) {
  return {
    id: Number(row.id),
    ownerType: row.owner_type,
    ownerId: Number(row.owner_id),
    amount: Number(row.amount || 0),
    status: row.status,
    adminRemarks: row.admin_remarks || "",
    payoutReference: row.payout_reference || "",
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    paidAt: row.paid_at,
    payoutMethod: row.method_type
      ? {
          methodType: row.method_type,
          accountHolder: row.account_holder || "",
          upiId: row.upi_id || "",
          bankName: row.bank_name || "",
          accountNumber: row.account_number || "",
          ifsc: row.ifsc || "",
        }
      : null,
  };
}

function requireAffiliate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ message: "Affiliate login required" });
  try {
    req.affiliate = verifyAffiliateToken(token);
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired affiliate session" });
  }
}

export { requireAffiliate };

export async function resolvePublicReferralCode(req, res) {
  try {
    const resolved = await resolveReferralCode(req.params.code);
    if (!resolved) return res.status(404).json({ message: "Referral code not found" });
    const settings = await getReferralSettings();
    res.json({
      referral: {
        code: resolved.code,
        ownerType: resolved.owner_type,
        ownerId: Number(resolved.owner_id),
        ownerName: resolved.owner?.name || "",
        attributionWindowDays: Number(settings.attribution_window_days || 30),
      },
    });
  } catch {
    res.status(500).json({ message: "Unable to resolve referral code" });
  }
}

export async function createReferralClick(req, res) {
  try {
    const click = await recordReferralClick(req.body || {}, req);
    res.status(201).json({ referral: click });
  } catch (error) {
    res.status(error.statusCode || 400).json({ message: error.message || "Unable to record referral" });
  }
}

export async function getCustomerReferralSummary(req, res) {
  try {
    const code = await ensureReferralCode("customer", req.customer.id);
    const summary = await walletSummary("customer", req.customer.id);
    const recent = await ownerLedger({ ownerType: "customer", ownerId: req.customer.id, limit: 20 });
    const withdrawals = await listOwnerWithdrawals("customer", req.customer.id);
    res.json({
      code: code?.code || "",
      wallet: summary,
      ledger: recent.map(publicLedger),
      withdrawals,
    });
  } catch {
    res.status(500).json({ message: "Unable to load referral wallet" });
  }
}

export async function getCustomerReferralLedger(req, res) {
  try {
    const rows = await ownerLedger({
      ownerType: "customer",
      ownerId: req.customer.id,
      limit: req.query.limit,
    });
    res.json({ ledger: rows.map(publicLedger) });
  } catch {
    res.status(500).json({ message: "Unable to load commission ledger" });
  }
}

async function listPayoutMethods(ownerType, ownerId) {
  const rows = await dbQuery(
    `SELECT *
       FROM wallet_payout_methods
      WHERE owner_type = ? AND owner_id = ? AND status = 'Active'
      ORDER BY is_default DESC, updated_at DESC`,
    [ownerType, ownerId]
  );
  return rows.map(publicPayoutMethod);
}

async function listOwnerWithdrawals(ownerType, ownerId) {
  const rows = await dbQuery(
    `SELECT wr.*, wpm.method_type, wpm.account_holder, wpm.upi_id, wpm.bank_name,
            wpm.account_number, wpm.ifsc
       FROM wallet_withdrawal_requests wr
       LEFT JOIN wallet_payout_methods wpm ON wpm.id = wr.payout_method_id
      WHERE wr.owner_type = ? AND wr.owner_id = ?
      ORDER BY wr.requested_at DESC
      LIMIT 100`,
    [ownerType, ownerId]
  );
  return rows.map(publicWithdrawal);
}

async function savePayoutMethod(ownerType, ownerId, body) {
  const payload = payoutMethodPayload(body);
  if (payload.methodType === "UPI" && !payload.upiId) {
    const error = new Error("UPI ID is required");
    error.statusCode = 400;
    throw error;
  }
  if (payload.methodType === "Bank" && (!payload.accountHolder || !payload.accountNumber || !payload.ifsc)) {
    const error = new Error("Account holder, account number, and IFSC are required");
    error.statusCode = 400;
    throw error;
  }
  await dbQuery(
    "UPDATE wallet_payout_methods SET is_default = 0 WHERE owner_type = ? AND owner_id = ?",
    [ownerType, ownerId]
  );
  const result = await dbQuery(
    `INSERT INTO wallet_payout_methods
      (owner_type, owner_id, method_type, account_holder, upi_id, bank_name,
       account_number, ifsc, status, is_default)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active', 1)`,
    [
      ownerType,
      ownerId,
      payload.methodType,
      payload.accountHolder || null,
      payload.upiId || null,
      payload.bankName || null,
      payload.accountNumber || null,
      payload.ifsc || null,
    ]
  );
  return result.insertId;
}

export async function getCustomerPayoutMethods(req, res) {
  try {
    res.json({ methods: await listPayoutMethods("customer", req.customer.id) });
  } catch {
    res.status(500).json({ message: "Unable to load payout methods" });
  }
}

export async function createCustomerPayoutMethod(req, res) {
  try {
    const id = await savePayoutMethod("customer", req.customer.id, req.body || {});
    res.status(201).json({ id, methods: await listPayoutMethods("customer", req.customer.id) });
  } catch (error) {
    res.status(error.statusCode || 400).json({ message: error.message || "Unable to save payout method" });
  }
}

export async function deleteCustomerPayoutMethod(req, res) {
  try {
    await dbQuery(
      "UPDATE wallet_payout_methods SET status = 'Inactive' WHERE id = ? AND owner_type = 'customer' AND owner_id = ?",
      [Number(req.params.id), req.customer.id]
    );
    res.json({ methods: await listPayoutMethods("customer", req.customer.id) });
  } catch {
    res.status(500).json({ message: "Unable to remove payout method" });
  }
}

export async function createCustomerWithdrawal(req, res) {
  try {
    const id = await createWithdrawalRequest({
      ownerType: "customer",
      ownerId: req.customer.id,
      amount: req.body?.amount,
      payoutMethodId: req.body?.payoutMethodId || req.body?.payout_method_id,
    });
    res.status(201).json({ id, withdrawals: await listOwnerWithdrawals("customer", req.customer.id) });
  } catch (error) {
    res.status(error.statusCode || 400).json({ message: error.message || "Unable to request cashout" });
  }
}

export async function getCustomerWithdrawals(req, res) {
  try {
    res.json({ withdrawals: await listOwnerWithdrawals("customer", req.customer.id) });
  } catch {
    res.status(500).json({ message: "Unable to load cashout requests" });
  }
}

export async function submitAffiliateApplication(req, res) {
  const name = cleanString(req.body?.name);
  const email = cleanString(req.body?.email).toLowerCase();
  if (!name || !email) {
    return res.status(400).json({ message: "Name and email are required" });
  }
  try {
    await dbQuery(
      `INSERT INTO affiliate_applications
        (name, email, phone, business_name, social_profile, city, state,
         promotion_channels, expected_monthly_reach, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [
        name,
        email,
        cleanString(req.body?.phone) || null,
        cleanString(req.body?.businessName || req.body?.business_name) || null,
        cleanString(req.body?.socialProfile || req.body?.social_profile) || null,
        cleanString(req.body?.city) || null,
        cleanString(req.body?.state) || null,
        cleanString(req.body?.promotionChannels || req.body?.promotion_channels) || null,
        cleanString(req.body?.expectedMonthlyReach || req.body?.expected_monthly_reach) || null,
        cleanString(req.body?.notes) || null,
      ]
    );
    await dbQuery(
      `INSERT INTO admin_notifications (type, title, message, link)
       VALUES ('affiliate_application', 'New affiliate application', ?, '/referrals?tab=applications')`,
      [`${name} applied for the affiliate program`]
    ).catch(() => {});
    res.status(201).json({ message: "Application submitted" });
  } catch (error) {
    res.status(500).json({ message: "Unable to submit application" });
  }
}

export async function affiliateLogin(req, res) {
  try {
    res.json(await createAffiliateSession(req.body || {}));
  } catch (error) {
    res.status(error.statusCode || 401).json({ message: error.message || "Unable to login affiliate" });
  }
}

export async function getAffiliateMe(req, res) {
  try {
    const rows = await dbQuery("SELECT * FROM affiliate_accounts WHERE id = ? LIMIT 1", [req.affiliate.id]);
    if (!rows[0]) return res.status(404).json({ message: "Affiliate not found" });
    const code = await ensureReferralCode("affiliate", req.affiliate.id);
    res.json({ affiliate: publicAffiliate(rows[0]), code: code?.code || "" });
  } catch {
    res.status(500).json({ message: "Unable to load affiliate profile" });
  }
}

export async function getAffiliateDashboard(req, res) {
  try {
    const code = await ensureReferralCode("affiliate", req.affiliate.id);
    const [summary, ledger, withdrawals, methods, clicks] = await Promise.all([
      walletSummary("affiliate", req.affiliate.id),
      ownerLedger({ ownerType: "affiliate", ownerId: req.affiliate.id, limit: 100 }),
      listOwnerWithdrawals("affiliate", req.affiliate.id),
      listPayoutMethods("affiliate", req.affiliate.id),
      dbQuery(
        `SELECT DATE(created_at) AS date, COUNT(*) AS clicks
           FROM referral_clicks
          WHERE referrer_type = 'affiliate' AND referrer_id = ?
          GROUP BY DATE(created_at)
          ORDER BY date DESC
          LIMIT 30`,
        [req.affiliate.id]
      ),
    ]);
    res.json({
      code: code?.code || "",
      wallet: summary,
      ledger: ledger.map(publicLedger),
      withdrawals,
      methods,
      clicks,
    });
  } catch {
    res.status(500).json({ message: "Unable to load affiliate dashboard" });
  }
}

export async function createAffiliateLink(req, res) {
  try {
    const code = await ensureReferralCode("affiliate", req.affiliate.id);
    const path = cleanString(req.body?.path || "/");
    const baseUrl = cleanString(req.body?.baseUrl || req.body?.base_url || process.env.FRONTEND_APP_URL || "https://goldencreation.in").replace(/\/$/, "");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const separator = normalizedPath.includes("?") ? "&" : "?";
    res.json({ url: `${baseUrl}${normalizedPath}${separator}aff=${encodeURIComponent(code.code)}` });
  } catch {
    res.status(500).json({ message: "Unable to create affiliate link" });
  }
}

export async function getAffiliatePayoutMethods(req, res) {
  try {
    res.json({ methods: await listPayoutMethods("affiliate", req.affiliate.id) });
  } catch {
    res.status(500).json({ message: "Unable to load payout methods" });
  }
}

export async function createAffiliatePayoutMethod(req, res) {
  try {
    const id = await savePayoutMethod("affiliate", req.affiliate.id, req.body || {});
    res.status(201).json({ id, methods: await listPayoutMethods("affiliate", req.affiliate.id) });
  } catch (error) {
    res.status(error.statusCode || 400).json({ message: error.message || "Unable to save payout method" });
  }
}

export async function createAffiliateWithdrawal(req, res) {
  try {
    const id = await createWithdrawalRequest({
      ownerType: "affiliate",
      ownerId: req.affiliate.id,
      amount: req.body?.amount,
      payoutMethodId: req.body?.payoutMethodId || req.body?.payout_method_id,
    });
    res.status(201).json({ id, withdrawals: await listOwnerWithdrawals("affiliate", req.affiliate.id) });
  } catch (error) {
    res.status(error.statusCode || 400).json({ message: error.message || "Unable to request cashout" });
  }
}

export async function getAffiliateWithdrawals(req, res) {
  try {
    res.json({ withdrawals: await listOwnerWithdrawals("affiliate", req.affiliate.id) });
  } catch {
    res.status(500).json({ message: "Unable to load cashout requests" });
  }
}

export async function getAdminReferralSettings(req, res) {
  try {
    res.json({ settings: await getReferralSettings() });
  } catch {
    res.status(500).json({ message: "Unable to load referral settings" });
  }
}

export async function updateAdminReferralSettings(req, res) {
  try {
    await dbQuery(
      `UPDATE referral_settings
          SET minimum_cashout = ?,
              attribution_window_days = ?,
              commission_hold_days = ?,
              default_referral_percent = ?,
              default_affiliate_percent = ?,
              self_referral_blocking = ?,
              status = ?,
              updated_by = ?
        WHERE id = 1`,
      [
        toMoney(req.body?.minimumCashout ?? req.body?.minimum_cashout ?? 500),
        Math.max(1, Number(req.body?.attributionWindowDays ?? req.body?.attribution_window_days ?? 30)),
        Math.max(0, Number(req.body?.commissionHoldDays ?? req.body?.commission_hold_days ?? 10)),
        Number(req.body?.defaultReferralPercent ?? req.body?.default_referral_percent ?? 0),
        Number(req.body?.defaultAffiliatePercent ?? req.body?.default_affiliate_percent ?? 0),
        Number(req.body?.selfReferralBlocking ?? req.body?.self_referral_blocking ?? 1) ? 1 : 0,
        cleanString(req.body?.status || "Active") === "Inactive" ? "Inactive" : "Active",
        req.admin?.id || null,
      ]
    );
    res.json({ settings: await getReferralSettings() });
  } catch {
    res.status(500).json({ message: "Unable to update referral settings" });
  }
}

export async function getAdminCommissionRules(req, res) {
  try {
    const rows = await dbQuery(
      `SELECT cr.*,
              CASE
                WHEN cr.target_type = 'Product' THEN p.name
                WHEN cr.target_type = 'Category' THEN c.name
                ELSE 'Global'
              END AS target_name
         FROM commission_rules cr
         LEFT JOIN products p ON p.id = cr.target_id AND cr.target_type = 'Product'
         LEFT JOIN categories c ON c.id = cr.target_id AND cr.target_type = 'Category'
        ORDER BY cr.program_type, cr.priority DESC, cr.id DESC`
    );
    res.json({ rules: rows.map(publicRule) });
  } catch {
    res.status(500).json({ message: "Unable to load commission rules" });
  }
}

export async function saveAdminCommissionRule(req, res) {
  const id = Number(req.params.id || req.body?.id || 0);
  const programType = cleanString(req.body?.programType || req.body?.program_type) === "affiliate" ? "affiliate" : "customer_referral";
  const targetTypeInput = cleanString(req.body?.targetType || req.body?.target_type || "Global");
  const targetType = ["Product", "Category"].includes(targetTypeInput) ? targetTypeInput : "Global";
  const commissionType = cleanString(req.body?.commissionType || req.body?.commission_type) === "fixed" ? "fixed" : "percent";
  const values = [
    programType,
    targetType,
    targetType === "Global" ? null : Number(req.body?.targetId || req.body?.target_id) || null,
    commissionType,
    toMoney(req.body?.commissionValue ?? req.body?.commission_value),
    Number(req.body?.priority || 0),
    cleanString(req.body?.status || "Active") === "Inactive" ? "Inactive" : "Active",
    cleanString(req.body?.startsAt || req.body?.starts_at) || null,
    cleanString(req.body?.endsAt || req.body?.ends_at) || null,
    req.admin?.id || null,
  ];
  try {
    if (id) {
      await dbQuery(
        `UPDATE commission_rules
            SET program_type = ?, target_type = ?, target_id = ?, commission_type = ?,
                commission_value = ?, priority = ?, status = ?, starts_at = ?, ends_at = ?,
                created_by = COALESCE(created_by, ?)
          WHERE id = ?`,
        [...values, id]
      );
    } else {
      await dbQuery(
        `INSERT INTO commission_rules
          (program_type, target_type, target_id, commission_type, commission_value,
           priority, status, starts_at, ends_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values
      );
    }
    res.json({ message: "Commission rule saved" });
  } catch {
    res.status(500).json({ message: "Unable to save commission rule" });
  }
}

export async function deleteAdminCommissionRule(req, res) {
  try {
    await dbQuery("DELETE FROM commission_rules WHERE id = ?", [Number(req.params.id)]);
    res.json({ message: "Commission rule deleted" });
  } catch {
    res.status(500).json({ message: "Unable to delete commission rule" });
  }
}

export async function getAdminReferralCustomers(req, res) {
  try {
    const rows = await dbQuery(
      `SELECT u.id, u.name, u.email, u.phone, rc.code,
              COALESCE(SUM(CASE WHEN cl.status = 'Approved' AND cl.withdrawal_id IS NULL THEN cl.commission_amount ELSE 0 END), 0) AS available,
              COALESCE(SUM(CASE WHEN cl.status = 'Pending' THEN cl.commission_amount ELSE 0 END), 0) AS pending,
              COALESCE(SUM(CASE WHEN cl.status = 'Paid' THEN cl.commission_amount ELSE 0 END), 0) AS paid
         FROM users u
         LEFT JOIN referral_codes rc ON rc.owner_type = 'customer' AND rc.owner_id = u.id
         LEFT JOIN commission_ledger cl ON cl.referrer_type = 'customer' AND cl.referrer_id = u.id
        GROUP BY u.id, rc.code
        ORDER BY pending DESC, available DESC, u.id DESC
        LIMIT 300`
    );
    res.json({ customers: rows });
  } catch {
    res.status(500).json({ message: "Unable to load referral customers" });
  }
}

export async function getAdminReferralLedger(req, res) {
  try {
    const rows = await dbQuery(
      `SELECT cl.*, o.order_number, p.name AS product_name
         FROM commission_ledger cl
         LEFT JOIN orders o ON o.id = cl.order_id
         LEFT JOIN products p ON p.id = cl.product_id
        ORDER BY cl.created_at DESC
        LIMIT 500`
    );
    res.json({ ledger: rows.map(publicLedger) });
  } catch {
    res.status(500).json({ message: "Unable to load referral ledger" });
  }
}

export async function createAdminManualAdjustment(req, res) {
  try {
    const ownerType = cleanString(req.body?.ownerType || req.body?.owner_type) === "affiliate" ? "affiliate" : "customer";
    const ownerId = Number(req.body?.ownerId || req.body?.owner_id);
    const amount = toMoney(req.body?.amount);
    if (!ownerId || amount === 0) return res.status(400).json({ message: "Owner and non-zero amount are required" });
    const status = amount > 0 ? "Approved" : "Reversed";
    await dbQuery(
      `INSERT INTO commission_ledger
        (dedupe_key, referrer_type, referrer_id, program_type, base_amount,
         commission_type, commission_value, commission_amount, status, reason, released_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, 'manual', 0, ?, ?, ?, NOW(), ?)`,
      [
        `manual:${ownerType}:${ownerId}:${Date.now()}:${Math.random()}`,
        ownerType,
        ownerId,
        ownerType === "affiliate" ? "affiliate" : "customer_referral",
        Math.abs(amount),
        Math.abs(amount),
        status,
        cleanString(req.body?.reason || "Manual wallet adjustment"),
        JSON.stringify({ adminId: req.admin?.id || null }),
      ]
    );
    res.status(201).json({ message: "Wallet adjustment recorded" });
  } catch {
    res.status(500).json({ message: "Unable to create manual adjustment" });
  }
}

export async function getAdminAffiliateApplications(req, res) {
  try {
    const rows = await dbQuery("SELECT * FROM affiliate_applications ORDER BY created_at DESC LIMIT 300");
    res.json({ applications: rows });
  } catch {
    res.status(500).json({ message: "Unable to load affiliate applications" });
  }
}

export async function updateAdminAffiliateApplication(req, res) {
  const id = Number(req.params.id);
  const status = cleanString(req.body?.status || "Pending");
  if (!["Pending", "Approved", "Rejected"].includes(status)) {
    return res.status(400).json({ message: "Valid application status is required" });
  }
  try {
    const rows = await dbQuery("SELECT * FROM affiliate_applications WHERE id = ? LIMIT 1", [id]);
    const application = rows[0];
    if (!application) return res.status(404).json({ message: "Application not found" });
    let affiliateId = application.affiliate_id;
    let temporaryPassword = "";
    if (status === "Approved" && !affiliateId) {
      const created = await createAffiliateAccount(
        {
          ...application,
          password: req.body?.password,
          status: "Approved",
        },
        req.admin?.id || null
      );
      affiliateId = created.affiliate.id;
      temporaryPassword = created.temporaryPassword;
    }
    await dbQuery(
      `UPDATE affiliate_applications
          SET status = ?, review_remarks = ?, reviewed_by = ?, reviewed_at = NOW(), affiliate_id = ?
        WHERE id = ?`,
      [status, cleanString(req.body?.remarks || req.body?.reviewRemarks) || null, req.admin?.id || null, affiliateId || null, id]
    );
    res.json({ message: "Application updated", affiliateId, temporaryPassword });
  } catch (error) {
    res.status(500).json({ message: error.message || "Unable to update application" });
  }
}

export async function getAdminAffiliates(req, res) {
  try {
    const rows = await dbQuery(
      `SELECT aa.*, rc.code,
              COALESCE(SUM(CASE WHEN cl.status = 'Approved' AND cl.withdrawal_id IS NULL THEN cl.commission_amount ELSE 0 END), 0) AS available,
              COALESCE(SUM(CASE WHEN cl.status = 'Pending' THEN cl.commission_amount ELSE 0 END), 0) AS pending,
              COALESCE(SUM(CASE WHEN cl.status = 'Paid' THEN cl.commission_amount ELSE 0 END), 0) AS paid
         FROM affiliate_accounts aa
         LEFT JOIN referral_codes rc ON rc.owner_type = 'affiliate' AND rc.owner_id = aa.id
         LEFT JOIN commission_ledger cl ON cl.referrer_type = 'affiliate' AND cl.referrer_id = aa.id
        GROUP BY aa.id, rc.code
        ORDER BY aa.created_at DESC`
    );
    res.json({ affiliates: rows.map((row) => ({ ...publicAffiliate(row), code: row.code || "", available: Number(row.available || 0), pending: Number(row.pending || 0), paid: Number(row.paid || 0) })) });
  } catch {
    res.status(500).json({ message: "Unable to load affiliates" });
  }
}

export async function createAdminAffiliate(req, res) {
  try {
    const created = await createAffiliateAccount(req.body || {}, req.admin?.id || null);
    res.status(201).json({
      affiliate: publicAffiliate(created.affiliate),
      temporaryPassword: created.temporaryPassword,
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ message: error.message || "Unable to create affiliate" });
  }
}

export async function updateAdminAffiliate(req, res) {
  const id = Number(req.params.id);
  const status = cleanString(req.body?.status || "Approved");
  try {
    if (req.body?.password) {
      const hash = await bcrypt.hash(String(req.body.password), 12);
      await dbQuery(
        `UPDATE affiliate_accounts
            SET name = ?, phone = ?, business_name = ?, social_profile = ?,
                city = ?, state = ?, promotion_channels = ?, expected_monthly_reach = ?,
                notes = ?, status = ?, password_hash = ?
          WHERE id = ?`,
        [
          cleanString(req.body?.name),
          cleanString(req.body?.phone) || null,
          cleanString(req.body?.businessName || req.body?.business_name) || null,
          cleanString(req.body?.socialProfile || req.body?.social_profile) || null,
          cleanString(req.body?.city) || null,
          cleanString(req.body?.state) || null,
          cleanString(req.body?.promotionChannels || req.body?.promotion_channels) || null,
          cleanString(req.body?.expectedMonthlyReach || req.body?.expected_monthly_reach) || null,
          cleanString(req.body?.notes) || null,
          ["Approved", "Pending", "Rejected", "Suspended"].includes(status) ? status : "Approved",
          hash,
          id,
        ]
      );
    } else {
      await dbQuery(
        `UPDATE affiliate_accounts
            SET name = ?, phone = ?, business_name = ?, social_profile = ?,
                city = ?, state = ?, promotion_channels = ?, expected_monthly_reach = ?,
                notes = ?, status = ?
          WHERE id = ?`,
        [
          cleanString(req.body?.name),
          cleanString(req.body?.phone) || null,
          cleanString(req.body?.businessName || req.body?.business_name) || null,
          cleanString(req.body?.socialProfile || req.body?.social_profile) || null,
          cleanString(req.body?.city) || null,
          cleanString(req.body?.state) || null,
          cleanString(req.body?.promotionChannels || req.body?.promotion_channels) || null,
          cleanString(req.body?.expectedMonthlyReach || req.body?.expected_monthly_reach) || null,
          cleanString(req.body?.notes) || null,
          ["Approved", "Pending", "Rejected", "Suspended"].includes(status) ? status : "Approved",
          id,
        ]
      );
    }
    res.json({ message: "Affiliate updated" });
  } catch {
    res.status(500).json({ message: "Unable to update affiliate" });
  }
}

export async function getAdminWithdrawals(req, res) {
  try {
    const rows = await dbQuery(
      `SELECT wr.*, wpm.method_type, wpm.account_holder, wpm.upi_id, wpm.bank_name,
              wpm.account_number, wpm.ifsc
         FROM wallet_withdrawal_requests wr
         LEFT JOIN wallet_payout_methods wpm ON wpm.id = wr.payout_method_id
        ORDER BY wr.requested_at DESC
        LIMIT 300`
    );
    res.json({ withdrawals: rows.map(publicWithdrawal) });
  } catch {
    res.status(500).json({ message: "Unable to load withdrawal requests" });
  }
}

export async function updateAdminWithdrawal(req, res) {
  const id = Number(req.params.id);
  const status = cleanString(req.body?.status);
  try {
    if (status === "Paid") {
      await markWithdrawalPaid(id, req.admin?.id || null, req.body?.payoutReference || req.body?.payout_reference, req.body?.remarks || "");
    } else if (status === "Rejected") {
      await rejectWithdrawal(id, req.admin?.id || null, req.body?.remarks || "");
    } else if (status === "Approved") {
      await dbQuery(
        `UPDATE wallet_withdrawal_requests
            SET status = 'Approved', admin_remarks = ?, decided_by = ?, decided_at = NOW()
          WHERE id = ?`,
        [cleanString(req.body?.remarks) || null, req.admin?.id || null, id]
      );
    } else {
      return res.status(400).json({ message: "Choose Approved, Rejected, or Paid" });
    }
    res.json({ message: "Withdrawal updated" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || "Unable to update withdrawal" });
  }
}

export async function getAdminReferralReports(req, res) {
  try {
    const [summaryRows, topReferrers, topProducts, clicks] = await Promise.all([
      dbQuery(
        `SELECT
            COALESCE(SUM(CASE WHEN status = 'Pending' THEN commission_amount ELSE 0 END), 0) AS pending,
            COALESCE(SUM(CASE WHEN status = 'Approved' THEN commission_amount ELSE 0 END), 0) AS approved,
            COALESCE(SUM(CASE WHEN status = 'Paid' THEN commission_amount ELSE 0 END), 0) AS paid,
            COUNT(*) AS entries
           FROM commission_ledger`
      ),
      dbQuery(
        `SELECT referrer_type, referrer_id, COUNT(*) AS entries, COALESCE(SUM(commission_amount), 0) AS amount
           FROM commission_ledger
          GROUP BY referrer_type, referrer_id
          ORDER BY amount DESC
          LIMIT 10`
      ),
      dbQuery(
        `SELECT p.name, COUNT(*) AS entries, COALESCE(SUM(cl.commission_amount), 0) AS amount
           FROM commission_ledger cl
           LEFT JOIN products p ON p.id = cl.product_id
          GROUP BY cl.product_id, p.name
          ORDER BY amount DESC
          LIMIT 10`
      ),
      dbQuery(
        `SELECT referrer_type, COUNT(*) AS clicks
           FROM referral_clicks
          GROUP BY referrer_type`
      ),
    ]);
    res.json({
      summary: summaryRows[0] || {},
      topReferrers,
      topProducts,
      clicks,
    });
  } catch {
    res.status(500).json({ message: "Unable to load referral reports" });
  }
}

export async function reverseAdminOrderCommissions(orderId, reason) {
  return reverseOrderCommissions(orderId, reason);
}
