import React, { useEffect, useMemo, useState } from "react";
import {
  createAffiliate,
  createReferralManualAdjustment,
  deleteCommissionRule,
  getAffiliateApplications,
  getAffiliates,
  getCommissionRules,
  getReferralCustomers,
  getReferralLedger,
  getReferralReports,
  getReferralSettings,
  getWalletWithdrawals,
  saveCommissionRule,
  updateAffiliate,
  updateAffiliateApplication,
  updateReferralSettings,
  updateWalletWithdrawal,
} from "../lib/adminApi";

const money = (value) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;

const managementTabs = [
  ["referrals", "Referrals Management", "Customer referral codes, wallet entries, payouts, and customer commission rules."],
  ["affiliates", "Affiliates Management", "Affiliate onboarding, affiliate accounts, payouts, and affiliate commission rules."],
];

const sectionTabs = {
  referrals: [
    ["overview", "Overview"],
    ["rules", "Commission Rules"],
    ["customers", "Customer Referrals"],
    ["payouts", "Payout Requests"],
    ["ledger", "Audit Ledger"],
  ],
  affiliates: [
    ["overview", "Overview"],
    ["applications", "Applications"],
    ["affiliates", "Affiliates"],
    ["rules", "Commission Rules"],
    ["payouts", "Payout Requests"],
    ["ledger", "Audit Ledger"],
  ],
};

const blankRule = {
  programType: "customer_referral",
  targetType: "Global",
  targetId: "",
  commissionType: "percent",
  commissionValue: 0,
  priority: 0,
  status: "Active",
};

const blankAffiliate = {
  name: "",
  email: "",
  phone: "",
  businessName: "",
  socialProfile: "",
  city: "",
  state: "",
  promotionChannels: "",
  expectedMonthlyReach: "",
  notes: "",
  password: "",
  status: "Approved",
};

function StatCard({ label, value, tone = "amber" }) {
  const tones = {
    green: "bg-emerald-50 text-emerald-800 border-emerald-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    blue: "bg-sky-50 text-sky-800 border-sky-200",
    red: "bg-rose-50 text-rose-800 border-rose-200",
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone] || tones.amber}`}>
      <p className="text-xs uppercase tracking-[0.16em] opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#C2863F] ${props.className || ""}`}
    />
  );
}

function Select(props) {
  return (
    <select
      {...props}
      className={`w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#C2863F] ${props.className || ""}`}
    />
  );
}

export default function ReferralAffiliate() {
  const [activeManagement, setActiveManagement] = useState("referrals");
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [settings, setSettings] = useState({});
  const [reports, setReports] = useState({ summary: {}, topReferrers: [], topProducts: [], clicks: [] });
  const [rules, setRules] = useState([]);
  const [ruleForm, setRuleForm] = useState(blankRule);
  const [customers, setCustomers] = useState([]);
  const [applications, setApplications] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [affiliateForm, setAffiliateForm] = useState(blankAffiliate);
  const [withdrawals, setWithdrawals] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [adjustment, setAdjustment] = useState({ ownerType: "customer", ownerId: "", amount: "", reason: "" });
  const [generatedPassword, setGeneratedPassword] = useState("");

  const activeProgramType = activeManagement === "affiliates" ? "affiliate" : "customer_referral";
  const visibleTabs = sectionTabs[activeManagement] || sectionTabs.referrals;
  const filteredRules = useMemo(
    () => rules.filter((rule) => (rule.programType || rule.program_type) === activeProgramType),
    [rules, activeProgramType]
  );
  const filteredWithdrawals = useMemo(
    () =>
      withdrawals.filter((item) => {
        const ownerType = String(item.ownerType || item.owner_type || "").toLowerCase();
        return activeManagement === "affiliates" ? ownerType === "affiliate" : ownerType !== "affiliate";
      }),
    [withdrawals, activeManagement]
  );
  const filteredLedger = useMemo(
    () =>
      ledger.filter((item) => {
        const referrerType = String(item.referrerType || item.referrer_type || "").toLowerCase();
        return activeManagement === "affiliates" ? referrerType === "affiliate" : referrerType !== "affiliate";
      }),
    [ledger, activeManagement]
  );

  const refresh = async () => {
    setLoading(true);
    try {
      const [
        settingsResponse,
        reportsResponse,
        rulesResponse,
        customersResponse,
        applicationsResponse,
        affiliatesResponse,
        withdrawalsResponse,
        ledgerResponse,
      ] = await Promise.all([
        getReferralSettings(),
        getReferralReports(),
        getCommissionRules(),
        getReferralCustomers(),
        getAffiliateApplications(),
        getAffiliates(),
        getWalletWithdrawals(),
        getReferralLedger(),
      ]);
      setSettings(settingsResponse.settings || {});
      setReports(reportsResponse || { summary: {} });
      setRules(rulesResponse.rules || []);
      setCustomers(customersResponse.customers || []);
      setApplications(applicationsResponse.applications || []);
      setAffiliates(affiliatesResponse.affiliates || []);
      setWithdrawals(withdrawalsResponse.withdrawals || []);
      setLedger(ledgerResponse.ledger || []);
    } catch (error) {
      setNotice(error.message || "Unable to load referral module");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const allowedTabs = visibleTabs.map(([key]) => key);
    if (!allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0] || "overview");
    }
    setRuleForm((current) => ({ ...current, programType: activeProgramType }));
    setAdjustment((current) => ({
      ...current,
      ownerType: activeManagement === "affiliates" ? "affiliate" : "customer",
    }));
  }, [activeManagement, activeProgramType, activeTab, visibleTabs]);

  const summary = reports.summary || {};
  const clickTotal = useMemo(
    () => (reports.clicks || []).reduce((total, item) => total + Number(item.clicks || 0), 0),
    [reports.clicks]
  );
  const activeAffiliateCount = useMemo(
    () => affiliates.filter((item) => String(item.status || "").toLowerCase() === "approved").length,
    [affiliates]
  );
  const pendingApplicationCount = useMemo(
    () => applications.filter((item) => String(item.status || "").toLowerCase() === "pending").length,
    [applications]
  );

  const saveSettings = async () => {
    setNotice("");
    await updateReferralSettings({
      minimumCashout: settings.minimum_cashout,
      attributionWindowDays: settings.attribution_window_days,
      commissionHoldDays: settings.commission_hold_days,
      defaultReferralPercent: settings.default_referral_percent,
      defaultAffiliatePercent: settings.default_affiliate_percent,
      selfReferralBlocking: settings.self_referral_blocking,
      status: settings.status,
    });
    setNotice("Referral settings saved");
    refresh();
  };

  const submitRule = async (event) => {
    event.preventDefault();
    setNotice("");
    await saveCommissionRule({ ...ruleForm, programType: activeProgramType });
    setRuleForm({ ...blankRule, programType: activeProgramType });
    setNotice("Commission rule saved");
    refresh();
  };

  const approveApplication = async (application, status) => {
    const password = status === "Approved" ? window.prompt("Optional temporary password. Leave blank to generate one.", "") : "";
    const response = await updateAffiliateApplication(application.id, {
      status,
      password,
      remarks: status === "Approved" ? "Approved from Referral & Affiliate module" : "Rejected from Referral & Affiliate module",
    });
    setGeneratedPassword(response.temporaryPassword || "");
    setNotice(response.temporaryPassword ? `Affiliate approved. Temporary password: ${response.temporaryPassword}` : "Application updated");
    refresh();
  };

  const submitAffiliate = async (event) => {
    event.preventDefault();
    const response = affiliateForm.id
      ? await updateAffiliate(affiliateForm.id, affiliateForm)
      : await createAffiliate(affiliateForm);
    setGeneratedPassword(response.temporaryPassword || "");
    setAffiliateForm(blankAffiliate);
    setNotice(response.temporaryPassword ? `Affiliate saved. Temporary password: ${response.temporaryPassword}` : "Affiliate saved");
    refresh();
  };

  const submitAdjustment = async (event) => {
    event.preventDefault();
    const ownerType = activeManagement === "affiliates" ? "affiliate" : "customer";
    await createReferralManualAdjustment({ ...adjustment, ownerType });
    setAdjustment({ ownerType, ownerId: "", amount: "", reason: "" });
    setNotice("Manual wallet adjustment recorded");
    refresh();
  };

  const decideWithdrawal = async (request, status) => {
    const payoutReference =
      status === "Paid" ? window.prompt("Enter payout transaction reference", request.payoutReference || "") : "";
    const remarks = window.prompt("Remarks", "");
    await updateWalletWithdrawal(request.id, { status, payoutReference, remarks });
    setNotice(`Withdrawal marked ${status}`);
    refresh();
  };

  return (
    <div className="min-h-screen bg-[#F7F3EA] p-4 md:p-6">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#C2863F]">Website Management</p>
          <h1 className="text-2xl font-bold text-[#1f1f14]">Referral & Affiliate</h1>
          <p className="text-sm text-gray-500">Manage referral commission, affiliate onboarding, wallet balances, and manual payouts.</p>
        </div>
        <button onClick={refresh} className="rounded-xl bg-[#404C31] px-4 py-2 text-sm font-semibold text-white">
          Refresh
        </button>
      </div>

      {notice && <div className="mb-4 rounded-xl border border-[#E8DDBF] bg-white px-4 py-3 text-sm text-[#8A541E]">{notice}</div>}
      {generatedPassword && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Share this temporary password securely with the affiliate: <strong>{generatedPassword}</strong>
        </div>
      )}

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        {managementTabs.map(([key, label, description]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveManagement(key)}
            className={`rounded-2xl border p-4 text-left shadow-sm transition ${
              activeManagement === key
                ? "border-[#C2863F] bg-[#FFF7E8] text-[#1f1f14]"
                : "border-gray-100 bg-white text-gray-600 hover:border-[#E8DDBF]"
            }`}
          >
            <span className="text-base font-bold">{label}</span>
            <span className="mt-1 block text-xs leading-5 text-gray-500">{description}</span>
          </button>
        ))}
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto">
        {visibleTabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
              activeTab === key ? "bg-[#C2863F] text-white" : "bg-white text-gray-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-2xl bg-white p-8 text-sm text-gray-500">Loading referral module...</div>
      ) : (
        <>
          {activeTab === "overview" && (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-4">
                <StatCard label="Pending Commission" value={money(summary.pending)} tone="amber" />
                <StatCard label="Approved Wallet" value={money(summary.approved)} tone="green" />
                <StatCard label="Paid Payouts" value={money(summary.paid)} tone="blue" />
                <StatCard
                  label={activeManagement === "affiliates" ? "Active Affiliates" : "Referral Clicks"}
                  value={activeManagement === "affiliates" ? activeAffiliateCount : clickTotal}
                  tone={activeManagement === "affiliates" ? "green" : "red"}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Global Settings">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Minimum cashout">
                      <Input type="number" value={settings.minimum_cashout || 0} onChange={(e) => setSettings({ ...settings, minimum_cashout: e.target.value })} />
                    </Field>
                    <Field label="Attribution window days">
                      <Input type="number" value={settings.attribution_window_days || 30} onChange={(e) => setSettings({ ...settings, attribution_window_days: e.target.value })} />
                    </Field>
                    <Field label="Commission hold days">
                      <Input type="number" value={settings.commission_hold_days || 10} onChange={(e) => setSettings({ ...settings, commission_hold_days: e.target.value })} />
                    </Field>
                    <Field label="Customer default %">
                      <Input type="number" value={settings.default_referral_percent || 0} onChange={(e) => setSettings({ ...settings, default_referral_percent: e.target.value })} />
                    </Field>
                    <Field label="Affiliate default %">
                      <Input type="number" value={settings.default_affiliate_percent || 0} onChange={(e) => setSettings({ ...settings, default_affiliate_percent: e.target.value })} />
                    </Field>
                    <Field label="Self-referral blocking">
                      <Select value={Number(settings.self_referral_blocking || 0)} onChange={(e) => setSettings({ ...settings, self_referral_blocking: e.target.value })}>
                        <option value="1">Enabled</option>
                        <option value="0">Disabled</option>
                      </Select>
                    </Field>
                  </div>
                  <button onClick={saveSettings} className="mt-4 rounded-xl bg-[#C2863F] px-4 py-2 text-sm font-semibold text-white">
                    Save Settings
                  </button>
                </Panel>
                <Panel title={activeManagement === "affiliates" ? "Affiliate Queue" : "Top Products"}>
                  {activeManagement === "affiliates" ? (
                    <SimpleList rows={[
                      ["Pending applications", pendingApplicationCount, "Need review"],
                      ["Approved affiliates", activeAffiliateCount, "Can generate links"],
                      ["Commission rules", filteredRules.length, "Affiliate rules"],
                    ]} />
                  ) : (
                    <SimpleList rows={(reports.topProducts || []).map((item) => [item.name || "Product", money(item.amount), `${item.entries} entries`])} />
                  )}
                </Panel>
              </div>
            </div>
          )}

          {activeTab === "rules" && (
            <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
              <Panel title={ruleForm.id ? "Edit Commission Rule" : "Add Commission Rule"}>
                <form onSubmit={submitRule} className="space-y-3">
                  <Field label="Program">
                    <Select value={activeProgramType} disabled className="bg-gray-50 text-gray-500">
                      <option value="customer_referral">Customer Referral</option>
                      <option value="affiliate">Affiliate</option>
                    </Select>
                  </Field>
                  <Field label="Target">
                    <Select value={ruleForm.targetType} onChange={(e) => setRuleForm({ ...ruleForm, targetType: e.target.value, targetId: "" })}>
                      <option value="Global">Global</option>
                      <option value="Category">Category ID</option>
                      <option value="Product">Product ID</option>
                    </Select>
                  </Field>
                  {ruleForm.targetType !== "Global" && (
                    <Field label={`${ruleForm.targetType} ID`}>
                      <Input value={ruleForm.targetId || ""} onChange={(e) => setRuleForm({ ...ruleForm, targetId: e.target.value })} />
                    </Field>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Type">
                      <Select value={ruleForm.commissionType} onChange={(e) => setRuleForm({ ...ruleForm, commissionType: e.target.value })}>
                        <option value="percent">Percent</option>
                        <option value="fixed">Fixed</option>
                      </Select>
                    </Field>
                    <Field label="Value">
                      <Input type="number" value={ruleForm.commissionValue} onChange={(e) => setRuleForm({ ...ruleForm, commissionValue: e.target.value })} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Priority">
                      <Input type="number" value={ruleForm.priority} onChange={(e) => setRuleForm({ ...ruleForm, priority: e.target.value })} />
                    </Field>
                    <Field label="Status">
                      <Select value={ruleForm.status} onChange={(e) => setRuleForm({ ...ruleForm, status: e.target.value })}>
                        <option>Active</option>
                        <option>Inactive</option>
                      </Select>
                    </Field>
                  </div>
                  <button className="w-full rounded-xl bg-[#C2863F] px-4 py-2 text-sm font-semibold text-white">Save Rule</button>
                </form>
              </Panel>
              <Panel title="Current Rules">
                <DataTable
                  headers={["Program", "Target", "Commission", "Priority", "Status", "Actions"]}
                  rows={filteredRules.map((rule) => [
                    rule.programType,
                    `${rule.targetType}${rule.targetName ? `: ${rule.targetName}` : rule.targetId ? ` #${rule.targetId}` : ""}`,
                    `${rule.commissionValue}${rule.commissionType === "percent" ? "%" : ""}`,
                    rule.priority,
                    rule.status,
                    <div className="flex gap-2" key={rule.id}>
                      <button onClick={() => setRuleForm(rule)} className="rounded-lg border px-2 py-1 text-xs">Edit</button>
                      <button onClick={() => window.confirm("Delete this rule?") && deleteCommissionRule(rule.id).then(refresh)} className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600">Delete</button>
                    </div>,
                  ])}
                />
              </Panel>
            </div>
          )}

          {activeTab === "customers" && (
            <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
              <Panel title="Manual Adjustment">
                <form onSubmit={submitAdjustment} className="space-y-3">
                  <Field label="Owner Type">
                    <Select value="customer" disabled className="bg-gray-50 text-gray-500">
                      <option value="customer">Customer</option>
                    </Select>
                  </Field>
                  <Field label="Owner ID">
                    <Input value={adjustment.ownerId} onChange={(e) => setAdjustment({ ...adjustment, ownerId: e.target.value })} />
                  </Field>
                  <Field label="Amount">
                    <Input type="number" value={adjustment.amount} onChange={(e) => setAdjustment({ ...adjustment, amount: e.target.value })} />
                  </Field>
                  <Field label="Reason">
                    <Input value={adjustment.reason} onChange={(e) => setAdjustment({ ...adjustment, reason: e.target.value })} />
                  </Field>
                  <button className="w-full rounded-xl bg-[#404C31] px-4 py-2 text-sm font-semibold text-white">Record Adjustment</button>
                </form>
              </Panel>
              <Panel title="Customer Referral Wallets">
                <DataTable
                  headers={["Customer", "Code", "Available", "Pending", "Paid"]}
                  rows={customers.map((item) => [
                    `${item.name || "Customer"} #${item.id}`,
                    item.code || "-",
                    money(item.available),
                    money(item.pending),
                    money(item.paid),
                  ])}
                />
              </Panel>
            </div>
          )}

          {activeTab === "applications" && (
            <Panel title="Affiliate Applications">
              <DataTable
                headers={["Applicant", "Contact", "Location", "Reach", "Status", "Actions"]}
                rows={applications.map((item) => [
                  <div key={item.id}><strong>{item.name}</strong><p className="text-xs text-gray-500">{item.business_name || item.social_profile || "-"}</p></div>,
                  `${item.email}${item.phone ? ` / ${item.phone}` : ""}`,
                  [item.city, item.state].filter(Boolean).join(", ") || "-",
                  item.expected_monthly_reach || "-",
                  item.status,
                  <div className="flex gap-2" key={item.id}>
                    <button onClick={() => approveApplication(item, "Approved")} className="rounded-lg bg-emerald-600 px-2 py-1 text-xs text-white">Approve</button>
                    <button onClick={() => approveApplication(item, "Rejected")} className="rounded-lg bg-red-600 px-2 py-1 text-xs text-white">Reject</button>
                  </div>,
                ])}
              />
            </Panel>
          )}

          {activeTab === "affiliates" && (
            <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
              <Panel title={affiliateForm.id ? "Edit Affiliate" : "Create Affiliate"}>
                <form onSubmit={submitAffiliate} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Name"><Input value={affiliateForm.name} onChange={(e) => setAffiliateForm({ ...affiliateForm, name: e.target.value })} required /></Field>
                    <Field label="Email"><Input type="email" value={affiliateForm.email} onChange={(e) => setAffiliateForm({ ...affiliateForm, email: e.target.value })} required disabled={Boolean(affiliateForm.id)} /></Field>
                  </div>
                  <Field label="Phone"><Input value={affiliateForm.phone} onChange={(e) => setAffiliateForm({ ...affiliateForm, phone: e.target.value })} /></Field>
                  <Field label="Business / Profile"><Input value={affiliateForm.businessName} onChange={(e) => setAffiliateForm({ ...affiliateForm, businessName: e.target.value })} /></Field>
                  <Field label="Promotion Channels"><Input value={affiliateForm.promotionChannels} onChange={(e) => setAffiliateForm({ ...affiliateForm, promotionChannels: e.target.value })} /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Status">
                      <Select value={affiliateForm.status} onChange={(e) => setAffiliateForm({ ...affiliateForm, status: e.target.value })}>
                        <option>Approved</option>
                        <option>Pending</option>
                        <option>Suspended</option>
                        <option>Rejected</option>
                      </Select>
                    </Field>
                    <Field label="Password">
                      <Input value={affiliateForm.password} onChange={(e) => setAffiliateForm({ ...affiliateForm, password: e.target.value })} placeholder={affiliateForm.id ? "Leave blank" : "Auto if blank"} />
                    </Field>
                  </div>
                  <button className="w-full rounded-xl bg-[#C2863F] px-4 py-2 text-sm font-semibold text-white">Save Affiliate</button>
                </form>
              </Panel>
              <Panel title="Affiliates">
                <DataTable
                  headers={["Affiliate", "Code", "Available", "Pending", "Paid", "Status", "Actions"]}
                  rows={affiliates.map((item) => [
                    `${item.name} #${item.id}`,
                    item.code || "-",
                    money(item.available),
                    money(item.pending),
                    money(item.paid),
                    item.status,
                    <button key={item.id} onClick={() => setAffiliateForm({ ...blankAffiliate, ...item })} className="rounded-lg border px-2 py-1 text-xs">Edit</button>,
                  ])}
                />
              </Panel>
            </div>
          )}

          {activeTab === "payouts" && (
            <Panel title="Wallet Payout Requests">
              <DataTable
                headers={["Owner", "Amount", "Method", "Status", "Requested", "Actions"]}
                rows={filteredWithdrawals.map((item) => [
                  `${item.ownerType} #${item.ownerId}`,
                  money(item.amount),
                  item.payoutMethod?.methodType === "Bank" ? `${item.payoutMethod.bankName} / ${item.payoutMethod.ifsc}` : item.payoutMethod?.upiId || "-",
                  item.status,
                  item.requestedAt ? new Date(item.requestedAt).toLocaleString("en-IN") : "-",
                  <div className="flex gap-2" key={item.id}>
                    <button onClick={() => decideWithdrawal(item, "Approved")} className="rounded-lg border px-2 py-1 text-xs">Approve</button>
                    <button onClick={() => decideWithdrawal(item, "Paid")} className="rounded-lg bg-emerald-600 px-2 py-1 text-xs text-white">Paid</button>
                    <button onClick={() => decideWithdrawal(item, "Rejected")} className="rounded-lg bg-red-600 px-2 py-1 text-xs text-white">Reject</button>
                  </div>,
                ])}
              />
            </Panel>
          )}

          {activeTab === "ledger" && (
            <Panel title="Commission Ledger">
              <DataTable
                headers={["Date", "Referrer", "Order", "Product", "Base", "Commission", "Status"]}
                rows={filteredLedger.map((item) => [
                  item.createdAt ? new Date(item.createdAt).toLocaleDateString("en-IN") : "-",
                  `${item.referrerType} #${item.referrerId}`,
                  item.orderNumber || item.orderId || "-",
                  item.productName || "-",
                  money(item.baseAmount),
                  money(item.commissionAmount),
                  item.status,
                ])}
              />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-[#1f1f14]">{title}</h2>
      {children}
    </section>
  );
}

function DataTable({ headers, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b bg-[#FBF8F2] text-xs uppercase tracking-[0.08em] text-gray-500">
            {headers.map((header) => (
              <th key={header} className="px-3 py-3">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={index} className="border-b last:border-0">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-3 py-3 align-top">{cell}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length} className="px-3 py-8 text-center text-sm text-gray-500">No records found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SimpleList({ rows }) {
  if (!rows.length) return <p className="text-sm text-gray-500">No report data yet.</p>;
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="flex items-center justify-between rounded-xl bg-[#FBF8F2] px-3 py-2 text-sm">
          <span className="font-semibold">{row[0]}</span>
          <span>{row[1]}</span>
          <span className="text-xs text-gray-500">{row[2]}</span>
        </div>
      ))}
    </div>
  );
}
