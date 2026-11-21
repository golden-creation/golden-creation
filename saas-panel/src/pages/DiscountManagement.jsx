import React, { useEffect, useState } from "react";
import {
  createAdminDiscount,
  deleteAdminDiscount,
  downloadAdminDiscountsCsv,
  duplicateAdminDiscount,
  getAdminDiscountAnalytics,
  getAdminDiscounts,
  updateAdminDiscount,
  updateAdminDiscountStatus,
} from "../lib/adminApi";
import RemoteLookup from "../components/RemoteLookup";

const emptyDraft = {
  id: null,
  name: "",
  description: "",
  method: "Coupon",
  code: "",
  autoGenerateCode: false,
  prefix: "",
  suffix: "",
  bulk: { enabled: false, count: 10, prefix: "", suffix: "", length: 8 },
  discountType: "Percentage",
  value: 10,
  maxDiscountAmount: "",
  minOrderValue: 0,
  maxOrderValue: 0,
  minQuantity: 0,
  usageLimit: 0,
  usageLimitPerCustomer: 0,
  firstOrderOnly: false,
  isStackable: false,
  preventCombination: true,
  status: "Active",
  startsAt: "",
  endsAt: "",
  appliesTo: { scope: "all", productIds: [], categoryIds: [], brands: [] },
  customerEligibility: { scope: "all", customerIds: [], customerEmails: [], groups: [] },
  config: {
    buyQuantity: 1,
    getQuantity: 1,
    getDiscountType: "free",
    getDiscountValue: 100,
    mode: "same_product",
    getProductIds: [],
    getCategoryIds: [],
    countries: [],
    states: [],
    paymentMethods: [],
    shippingMethods: [],
  },
};

const typeOptions = ["Percentage", "Fixed Amount", "Free Shipping", "Buy X Get Y"];
const methodOptions = ["Coupon", "Automatic"];

function asDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function normalizeDraft(discount) {
  if (!discount) return { ...emptyDraft, bulk: { ...emptyDraft.bulk }, config: { ...emptyDraft.config } };

  return {
    ...emptyDraft,
    id: discount.id,
    name: discount.name || discount.code || "",
    description: discount.description || "",
    method: discount.method || "Coupon",
    code: discount.code || "",
    discountType: discount.discount_type || "Percentage",
    value: Number(discount.value || 0),
    maxDiscountAmount: discount.max_discount_amount ?? "",
    minOrderValue: Number(discount.min_order_value || 0),
    maxOrderValue: Number(discount.max_order_value || 0),
    minQuantity: Number(discount.min_quantity || 0),
    usageLimit: Number(discount.usage_limit || 0),
    usageLimitPerCustomer: Number(discount.usage_limit_per_customer || 0),
    firstOrderOnly: Boolean(discount.first_order_only),
    isStackable: Boolean(discount.is_stackable),
    preventCombination: Boolean(discount.prevent_combination),
    status: discount.status || "Active",
    startsAt: asDateInput(discount.starts_at),
    endsAt: asDateInput(discount.ends_at),
    appliesTo: {
      ...emptyDraft.appliesTo,
      ...(discount.applies_to || {}),
    },
    customerEligibility: {
      ...emptyDraft.customerEligibility,
      ...(discount.customer_eligibility || {}),
    },
    config: {
      ...emptyDraft.config,
      ...(discount.config_json || {}),
    },
    bulk: { ...emptyDraft.bulk },
  };
}

function payloadFromDraft(draft) {
  return {
    name: draft.name,
    description: draft.description,
    method: draft.method,
    code: draft.method === "Coupon" ? draft.code : "",
    autoGenerateCode: draft.autoGenerateCode,
    prefix: draft.prefix,
    suffix: draft.suffix,
    bulk: draft.method === "Coupon" ? draft.bulk : { enabled: false },
    discountType: draft.discountType,
    value: Number(draft.value || 0),
    maxDiscountAmount: draft.maxDiscountAmount === "" ? null : Number(draft.maxDiscountAmount || 0),
    minOrderValue: Number(draft.minOrderValue || 0),
    maxOrderValue: Number(draft.maxOrderValue || 0),
    minQuantity: Number(draft.minQuantity || 0),
    usageLimit: Number(draft.usageLimit || 0),
    usageLimitPerCustomer: Number(draft.usageLimitPerCustomer || 0),
    firstOrderOnly: draft.firstOrderOnly,
    isStackable: draft.isStackable,
    preventCombination: draft.preventCombination,
    status: draft.status,
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
    appliesTo: draft.appliesTo,
    customerEligibility: draft.customerEligibility,
    config: draft.config,
  };
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString("en-IN") : "-";
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function DiscountManagement() {
  const [discounts, setDiscounts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0 });
  const [filters, setFilters] = useState({ q: "", status: "", method: "", type: "", page: 1 });
  const [analytics, setAnalytics] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2500);
  };

  const loadDiscounts = async (nextFilters = filters) => {
    setLoading(true);
    try {
      const response = await getAdminDiscounts({ ...nextFilters, limit: pagination.limit });
      setDiscounts(response.discounts || []);
      setPagination(response.pagination || pagination);
    } catch (error) {
      showToast(error.message || "Unable to load discounts");
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      setAnalytics(await getAdminDiscountAnalytics());
    } catch {
      setAnalytics(null);
    }
  };

  useEffect(() => {
    loadDiscounts();
    loadAnalytics();
  }, []);

  const updateFilter = (key, value) => {
    const next = { ...filters, [key]: value, page: 1 };
    setFilters(next);
    loadDiscounts(next);
  };

  const openCreate = () => setDraft(normalizeDraft(null));
  const openEdit = (discount) => setDraft(normalizeDraft(discount));

  const saveDiscount = async () => {
    if (!draft.name.trim()) {
      showToast("Discount name is required");
      return;
    }

    if (draft.method === "Coupon" && !draft.code.trim() && !draft.autoGenerateCode && !draft.bulk.enabled) {
      showToast("Add a coupon code or enable auto generation");
      return;
    }

    setSaving(true);
    try {
      if (draft.id) {
        await updateAdminDiscount(draft.id, payloadFromDraft(draft));
        showToast("Discount updated");
      } else {
        await createAdminDiscount(payloadFromDraft(draft));
        showToast("Discount created");
      }
      setDraft(null);
      await loadDiscounts();
      await loadAnalytics();
    } catch (error) {
      showToast(error.message || "Unable to save discount");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (discount) => {
    const nextStatus = discount.status === "Active" ? "Inactive" : "Active";
    await updateAdminDiscountStatus(discount.id, nextStatus);
    await loadDiscounts();
  };

  const duplicateDiscount = async (discount) => {
    await duplicateAdminDiscount(discount.id);
    showToast("Discount duplicated as inactive");
    await loadDiscounts();
  };

  const removeDiscount = async (discount) => {
    if (!window.confirm(`Delete ${discount.name || discount.code}?`)) return;
    await deleteAdminDiscount(discount.id);
    showToast("Discount deleted");
    await loadDiscounts();
  };

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || 15)));

  return (
    <div className="min-h-screen bg-[#F6F4EF] p-4 text-[13px] md:p-6">
      {toast && (
        <div className="fixed right-5 top-20 z-50 rounded-lg bg-black px-4 py-2 text-sm text-white shadow">
          {toast}
        </div>
      )}

      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Discount Management</h1>
          <p className="text-sm text-gray-500">
            Create coupon codes, automatic discounts, BOGO offers, eligibility rules, and usage limits.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={downloadAdminDiscountsCsv} className="rounded-lg border bg-white px-4 py-2 text-sm">
            Export CSV
          </button>
          <button onClick={openCreate} className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white">
            Create Discount
          </button>
        </div>
      </div>

      <AnalyticsPanel analytics={analytics} />

      <div className="mt-5 rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-5">
          <input
            value={filters.q}
            onChange={(event) => updateFilter("q", event.target.value)}
            placeholder="Search name or code"
            className="rounded-lg border px-3 py-2 md:col-span-2"
          />
          <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)} className="rounded-lg border px-3 py-2">
            <option value="">All Status</option>
            <option>Active</option>
            <option>Inactive</option>
          </select>
          <select value={filters.method} onChange={(event) => updateFilter("method", event.target.value)} className="rounded-lg border px-3 py-2">
            <option value="">All Methods</option>
            {methodOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
          <select value={filters.type} onChange={(event) => updateFilter("type", event.target.value)} className="rounded-lg border px-3 py-2">
            <option value="">All Types</option>
            {typeOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[980px] w-full text-left">
            <thead className="bg-[#FBF8F2] text-xs uppercase text-gray-500">
              <tr>
                <th className="p-3">Discount Name</th>
                <th className="p-3">Coupon Code</th>
                <th className="p-3">Type</th>
                <th className="p-3">Value</th>
                <th className="p-3">Usage</th>
                <th className="p-3">Start Date</th>
                <th className="p-3">Expiry Date</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="p-6 text-center text-gray-500" colSpan="9">Loading discounts...</td></tr>
              ) : discounts.length ? (
                discounts.map((discount) => (
                  <tr key={discount.id} className="border-t">
                    <td className="p-3">
                      <button onClick={() => openEdit(discount)} className="font-semibold text-left hover:text-[#A68B5B]">
                        {discount.name || "Untitled"}
                      </button>
                      <p className="text-xs text-gray-500">{discount.method}</p>
                    </td>
                    <td className="p-3">{discount.coupon_codes || discount.code || "Automatic"}</td>
                    <td className="p-3">{discount.discount_type}</td>
                    <td className="p-3">
                      {String(discount.discount_type).includes("Percent") || String(discount.discount_type).includes("Percentage")
                        ? `${Number(discount.value || 0)}%`
                        : formatCurrency(discount.value)}
                    </td>
                    <td className="p-3">{Number(discount.usage_count || 0)}</td>
                    <td className="p-3">{formatDate(discount.starts_at)}</td>
                    <td className="p-3">{formatDate(discount.ends_at)}</td>
                    <td className="p-3">
                      <button
                        onClick={() => toggleStatus(discount)}
                        className={`rounded-full px-3 py-1 text-xs ${
                          discount.status === "Active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {discount.status}
                      </button>
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEdit(discount)} className="rounded border px-3 py-1 text-xs">Edit</button>
                        <button onClick={() => duplicateDiscount(discount)} className="rounded border px-3 py-1 text-xs">Duplicate</button>
                        <button onClick={() => removeDiscount(discount)} className="rounded border border-red-200 px-3 py-1 text-xs text-red-600">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td className="p-6 text-center text-gray-500" colSpan="9">No discounts found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <span>Page {pagination.page || 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              disabled={(pagination.page || 1) <= 1}
              onClick={() => {
                const next = { ...filters, page: (pagination.page || 1) - 1 };
                setFilters(next);
                loadDiscounts(next);
              }}
              className="rounded border px-3 py-1 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={(pagination.page || 1) >= totalPages}
              onClick={() => {
                const next = { ...filters, page: (pagination.page || 1) + 1 };
                setFilters(next);
                loadDiscounts(next);
              }}
              className="rounded border px-3 py-1 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {draft && (
        <DiscountEditor
          draft={draft}
          setDraft={setDraft}
          onClose={() => setDraft(null)}
          onSave={saveDiscount}
          saving={saving}
        />
      )}
    </div>
  );
}

function AnalyticsPanel({ analytics }) {
  const topCoupons = analytics?.topCoupons || [];
  const maxAmount = Math.max(...topCoupons.map((item) => Number(item.amount || 0)), 1);

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <Metric label="Total Uses" value={analytics?.summary?.totalUses || 0} />
      <Metric label="Revenue Impacted" value={formatCurrency(analytics?.summary?.revenueImpacted || 0)} />
      <Metric label="Customers Used" value={analytics?.summary?.customers || 0} />
      <div className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-1">
        <h2 className="font-semibold">Most Used Coupons</h2>
        <div className="mt-3 space-y-2">
          {topCoupons.slice(0, 4).map((item) => (
            <div key={`${item.code}-${item.name}`}>
              <div className="flex justify-between text-xs">
                <span>{item.code}</span>
                <span>{formatCurrency(item.amount)}</span>
              </div>
              <div className="mt-1 h-2 rounded bg-gray-100">
                <div className="h-2 rounded bg-[#A68B5B]" style={{ width: `${(Number(item.amount || 0) / maxAmount) * 100}%` }} />
              </div>
            </div>
          ))}
          {!topCoupons.length && <p className="text-xs text-gray-500">Usage will appear after orders use discounts.</p>}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function DiscountEditor({ draft, setDraft, onClose, onSave, saving }) {
  const [productLookup, setProductLookup] = useState(null);
  const [categoryLookup, setCategoryLookup] = useState(null);
  const [customerLookup, setCustomerLookup] = useState(null);

  const selectedProductIds = draft.appliesTo.productIds || [];
  const selectedCategoryIds = draft.appliesTo.categoryIds || [];
  const selectedCustomerIds = draft.customerEligibility.customerIds || [];

  const patch = (changes) => setDraft((current) => ({ ...current, ...changes }));
  const patchAppliesTo = (changes) => patch({ appliesTo: { ...draft.appliesTo, ...changes } });
  const patchCustomerEligibility = (changes) => patch({ customerEligibility: { ...draft.customerEligibility, ...changes } });
  const patchConfig = (changes) => patch({ config: { ...draft.config, ...changes } });

  const toggleListValue = (list, value) => (
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3 md:p-8">
      <div className="mx-auto max-w-6xl rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-4">
          <div>
            <h2 className="text-xl font-semibold">{draft.id ? "Edit Discount" : "Create Discount"}</h2>
            <p className="text-xs text-gray-500">Shopify-style rule builder for coupons and automatic discounts.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
            <button disabled={saving} onClick={onSave} className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white disabled:opacity-60">
              {saving ? "Saving..." : "Save Discount"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <Section title="General Information">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Discount Name" value={draft.name} onChange={(value) => patch({ name: value })} />
                <Select label="Method" value={draft.method} options={methodOptions} onChange={(value) => patch({ method: value })} />
                <TextArea label="Description" value={draft.description} onChange={(value) => patch({ description: value })} className="md:col-span-2" />
              </div>
            </Section>

            {draft.method === "Coupon" && (
              <Section title="Coupon Code System">
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Manual Code" value={draft.code} onChange={(value) => patch({ code: value.toUpperCase() })} />
                  <Field label="Prefix" value={draft.prefix} onChange={(value) => patch({ prefix: value.toUpperCase() })} />
                  <Field label="Suffix" value={draft.suffix} onChange={(value) => patch({ suffix: value.toUpperCase() })} />
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  <Check label="Auto-generate one code" checked={draft.autoGenerateCode} onChange={(checked) => patch({ autoGenerateCode: checked })} />
                  <Check label="Bulk coupon generation" checked={draft.bulk.enabled} onChange={(checked) => patch({ bulk: { ...draft.bulk, enabled: checked } })} />
                </div>
                {draft.bulk.enabled && (
                  <div className="mt-3 grid gap-3 md:grid-cols-4">
                    <Field type="number" label="Code Count" value={draft.bulk.count} onChange={(value) => patch({ bulk: { ...draft.bulk, count: value } })} />
                    <Field type="number" label="Random Length" value={draft.bulk.length} onChange={(value) => patch({ bulk: { ...draft.bulk, length: value } })} />
                    <Field label="Bulk Prefix" value={draft.bulk.prefix} onChange={(value) => patch({ bulk: { ...draft.bulk, prefix: value.toUpperCase() } })} />
                    <Field label="Bulk Suffix" value={draft.bulk.suffix} onChange={(value) => patch({ bulk: { ...draft.bulk, suffix: value.toUpperCase() } })} />
                  </div>
                )}
              </Section>
            )}

            <Section title="Discount Type">
              <div className="grid gap-3 md:grid-cols-3">
                <Select label="Type" value={draft.discountType} options={typeOptions} onChange={(value) => patch({ discountType: value })} />
                {draft.discountType !== "Free Shipping" && (
                  <Field type="number" label={draft.discountType === "Percentage" ? "Percentage Value" : "Discount Value"} value={draft.value} onChange={(value) => patch({ value })} />
                )}
                {draft.discountType === "Percentage" && (
                  <Field type="number" label="Maximum Discount Cap" value={draft.maxDiscountAmount} onChange={(value) => patch({ maxDiscountAmount: value })} />
                )}
              </div>
              {draft.discountType === "Buy X Get Y" && (
                <div className="mt-3 grid gap-3 md:grid-cols-5">
                  <Field type="number" label="Buy Quantity" value={draft.config.buyQuantity} onChange={(value) => patchConfig({ buyQuantity: value })} />
                  <Field type="number" label="Get Quantity" value={draft.config.getQuantity} onChange={(value) => patchConfig({ getQuantity: value })} />
                  <Select label="BOGO Mode" value={draft.config.mode} options={["same_product", "different_product"]} onChange={(value) => patchConfig({ mode: value })} />
                  <Select label="Get Discount" value={draft.config.getDiscountType} options={["free", "percentage", "fixed"]} onChange={(value) => patchConfig({ getDiscountType: value })} />
                  <Field type="number" label="Get Value" value={draft.config.getDiscountValue} onChange={(value) => patchConfig({ getDiscountValue: value })} />
                </div>
              )}
            </Section>

            <Section title="Eligibility Rules">
              <div className="grid gap-3 md:grid-cols-4">
                <Field type="number" label="Minimum Cart Value" value={draft.minOrderValue} onChange={(value) => patch({ minOrderValue: value })} />
                <Field type="number" label="Maximum Cart Value" value={draft.maxOrderValue} onChange={(value) => patch({ maxOrderValue: value })} />
                <Field type="number" label="Minimum Quantity" value={draft.minQuantity} onChange={(value) => patch({ minQuantity: value })} />
                <Select label="Status" value={draft.status} options={["Active", "Inactive"]} onChange={(value) => patch({ status: value })} />
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <Check label="First order only" checked={draft.firstOrderOnly} onChange={(checked) => patch({ firstOrderOnly: checked })} />
                <Check label="One-time use per customer" checked={draft.usageLimitPerCustomer === 1} onChange={(checked) => patch({ usageLimitPerCustomer: checked ? 1 : 0 })} />
              </div>
            </Section>

            <Section title="Product Selection">
              <div className="grid gap-3 md:grid-cols-3">
                <Select label="Applies To" value={draft.appliesTo.scope} options={["all", "products", "categories", "brands"]} onChange={(value) => patchAppliesTo({ scope: value })} />
                <Field label="Brand Restrictions" value={(draft.appliesTo.brands || []).join(", ")} onChange={(value) => patchAppliesTo({ brands: value.split(",").map((item) => item.trim()).filter(Boolean) })} />
                <Field label="BOGO Get Product IDs" value={(draft.config.getProductIds || []).join(",")} onChange={(value) => patchConfig({ getProductIds: value.split(",").map(Number).filter(Boolean) })} />
              </div>

              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                <SelectorBox title="Products">
                  <RemoteLookup type="products" catalog="website" value={productLookup} onChange={(option) => { if (option) patchAppliesTo({ productIds: toggleListValue(selectedProductIds, Number(option.id)), scope: "products" }); setProductLookup(null); }} />
                  <SelectedIds ids={selectedProductIds} onRemove={(id) => patchAppliesTo({ productIds: toggleListValue(selectedProductIds, id) })} />
                </SelectorBox>
                <SelectorBox title="Categories">
                  <RemoteLookup type="categories" value={categoryLookup} onChange={(option) => { if (option) patchAppliesTo({ categoryIds: toggleListValue(selectedCategoryIds, Number(option.id)), scope: "categories" }); setCategoryLookup(null); }} />
                  <SelectedIds ids={selectedCategoryIds} onRemove={(id) => patchAppliesTo({ categoryIds: toggleListValue(selectedCategoryIds, id) })} />
                </SelectorBox>
              </div>
            </Section>

            <Section title="Customer Eligibility">
              <div className="grid gap-3 md:grid-cols-3">
                <Select label="Customer Scope" value={draft.customerEligibility.scope} options={["all", "logged_in", "specific_customers", "groups"]} onChange={(value) => patchCustomerEligibility({ scope: value })} />
                <Field label="Customer Groups" value={(draft.customerEligibility.groups || []).join(", ")} onChange={(value) => patchCustomerEligibility({ groups: value.split(",").map((item) => item.trim()).filter(Boolean) })} />
                <Field label="Specific Emails" value={(draft.customerEligibility.customerEmails || []).join(", ")} onChange={(value) => patchCustomerEligibility({ customerEmails: value.split(",").map((item) => item.trim()).filter(Boolean) })} />
              </div>
              <SelectorBox title="Customer Search">
                <RemoteLookup type="customers" value={customerLookup} onChange={(option) => { if (option) patchCustomerEligibility({ customerIds: toggleListValue(selectedCustomerIds, Number(option.id)), scope: "specific_customers" }); setCustomerLookup(null); }} />
                <SelectedIds ids={selectedCustomerIds} onRemove={(id) => patchCustomerEligibility({ customerIds: toggleListValue(selectedCustomerIds, id) })} />
              </SelectorBox>
            </Section>

            <Section title="Usage Limits, Active Dates, and Combination Rules">
              <div className="grid gap-3 md:grid-cols-4">
                <Field type="number" label="Usage Limit Per Coupon" value={draft.usageLimit} onChange={(value) => patch({ usageLimit: value })} />
                <Field type="number" label="Usage Limit Per Customer" value={draft.usageLimitPerCustomer} onChange={(value) => patch({ usageLimitPerCustomer: value })} />
                <Field type="datetime-local" label="Start Date/Time" value={draft.startsAt} onChange={(value) => patch({ startsAt: value })} />
                <Field type="datetime-local" label="Expiry Date/Time" value={draft.endsAt} onChange={(value) => patch({ endsAt: value })} />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <Field label="Country Restrictions" value={(draft.config.countries || []).join(", ")} onChange={(value) => patchConfig({ countries: value.split(",").map((item) => item.trim()).filter(Boolean) })} />
                <Field label="State Restrictions" value={(draft.config.states || []).join(", ")} onChange={(value) => patchConfig({ states: value.split(",").map((item) => item.trim()).filter(Boolean) })} />
                <Field label="Payment Methods" value={(draft.config.paymentMethods || []).join(", ")} onChange={(value) => patchConfig({ paymentMethods: value.split(",").map((item) => item.trim()).filter(Boolean) })} />
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <Check label="Stackable with other discounts" checked={draft.isStackable} onChange={(checked) => patch({ isStackable: checked, preventCombination: !checked })} />
                <Check label="Prevent combination with other coupons" checked={draft.preventCombination} onChange={(checked) => patch({ preventCombination: checked, isStackable: !checked ? draft.isStackable : false })} />
              </div>
            </Section>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border bg-[#FBF8F2] p-4">
              <h3 className="font-semibold">Live Validation Summary</h3>
              <ul className="mt-3 space-y-2 text-sm text-gray-600">
                <li>Method: {draft.method}</li>
                <li>Type: {draft.discountType}</li>
                <li>Code: {draft.method === "Automatic" ? "Automatic" : draft.code || "Generated"}</li>
                <li>Minimum cart: {formatCurrency(draft.minOrderValue)}</li>
                <li>Customer scope: {draft.customerEligibility.scope}</li>
                <li>Product scope: {draft.appliesTo.scope}</li>
                <li>Combination: {draft.isStackable ? "Stackable" : "Not stackable"}</li>
              </ul>
            </div>
            <div className="rounded-xl border bg-white p-4 text-xs text-gray-500">
              Discounts are revalidated on the backend during order creation. Usage counts are updated only after an order is saved.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function SelectedIds({ ids, onRemove }) {
  return <div className="mt-2 flex flex-wrap gap-1">{ids.map((id) => <button type="button" key={id} onClick={() => onRemove(id)} className="rounded bg-gray-100 px-2 py-1 text-xs">#{id} x</button>)}</div>;
}

function Field({ label, value, onChange, type = "text", className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
      />
    </label>
  );
}

function TextArea({ label, value, onChange, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-20 w-full rounded-lg border px-3 py-2 text-sm"
      />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function Check({ label, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-50">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function SelectorBox({ title, search, setSearch, children }) {
  return (
    <div className="rounded-lg border bg-[#FBF8F2] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="font-medium">{title}</h4>
        {setSearch && (
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="AJAX search"
            className="w-40 rounded border px-2 py-1 text-xs"
          />
        )}
      </div>
      <div className="max-h-48 overflow-y-auto text-sm">
        {React.Children.count(children) ? children : <p className="text-xs text-gray-500">No records found.</p>}
      </div>
    </div>
  );
}

export default DiscountManagement;
