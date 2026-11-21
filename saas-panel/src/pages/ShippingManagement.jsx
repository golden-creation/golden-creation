import React, { useEffect, useState } from "react";
import {
  createShippingRule,
  deleteShippingRule,
  getAdminShipping,
  updateShippingRule,
} from "../lib/adminApi";
import useEditorScroll from "../hooks/useEditorScroll";
import RemoteLookup from "../components/RemoteLookup";

const emptyRule = {
  name: "",
  region: "All India",
  min_order_value: 0,
  charge: 0,
  delivery_days: 3,
  status: "Active",
  priority: 0,
  targets: [],
  locations: [{ type: "All India", value: "" }],
};

function ShippingManagement() {
  const [data, setData] = useState({
    summary: {},
    rules: [],
    dispatchQueue: [],
    history: [],
  });
  const [draft, setDraft] = useState(emptyRule);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [targetType, setTargetType] = useState("Product");
  const [targetLookup, setTargetLookup] = useState(null);
  const { editorRef, scrollToEditor } = useEditorScroll();

  const loadShipping = async () => {
    try {
      setLoading(true);
      const response = await getAdminShipping();
      setData(response);
    } catch (error) {
      setMessage(error.message || "Unable to load shipping data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShipping();
  }, []);

  const updateDraft = (key, value) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setMessage("");
  };

  const resetDraft = () => {
    setDraft(emptyRule);
    setEditingId(null);
  };

  const submitRule = async () => {
    if (!draft.name.trim()) {
      setMessage("Rule name is required.");
      return;
    }

    try {
      const payload = {
        ...draft,
        min_order_value: Number(draft.min_order_value || 0),
        charge: Number(draft.charge || 0),
        delivery_days: Number(draft.delivery_days || 1),
      };

      if (editingId) {
        await updateShippingRule(editingId, payload);
        setMessage("Shipping rule updated.");
      } else {
        await createShippingRule(payload);
        setMessage("Shipping rule created.");
      }

      resetDraft();
      await loadShipping();
    } catch (error) {
      setMessage(error.message || "Unable to save shipping rule");
    }
  };

  const editRule = (rule) => {
    setEditingId(rule.id);
    setDraft({
      name: rule.name || "",
      region: rule.region || "All India",
      min_order_value: Number(rule.min_order_value || 0),
      charge: Number(rule.charge || 0),
      delivery_days: Number(rule.delivery_days || 3),
      status: rule.status || "Active",
      priority: Number(rule.priority || 0),
      targets: rule.targets || [],
      locations: rule.locations?.length ? rule.locations : [{ type: "All India", value: "" }],
    });
    scrollToEditor();
  };

  const addTarget = (option) => {
    if (!option) return;
    const next = { type: targetType, id: Number(option.id), label: option.label };
    updateDraft(
      "targets",
      draft.targets.some((target) => target.type === next.type && Number(target.id) === next.id)
        ? draft.targets
        : [...draft.targets, next]
    );
    setTargetLookup(null);
  };

  const updateLocation = (index, field, value) => {
    updateDraft(
      "locations",
      draft.locations.map((location, locationIndex) =>
        locationIndex === index ? { ...location, [field]: value } : location
      )
    );
  };

  const removeRule = async (id) => {
    try {
      await deleteShippingRule(id);
      setMessage("Shipping rule deleted.");
      await loadShipping();
    } catch (error) {
      setMessage(error.message || "Unable to delete shipping rule");
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Shipping Management</h1>
          <p className="text-sm text-gray-500">
            Define shipping rules and monitor dispatch-ready orders.
          </p>
        </div>
        <button onClick={loadShipping} className="rounded-lg bg-white px-4 py-2 text-sm shadow">
          Refresh
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Metric label="Active Rules" value={data.summary?.activeRules || 0} />
        <Metric label="Free Shipping Rules" value={data.summary?.freeShippingRules || 0} />
        <Metric label="Dispatch Queue" value={data.summary?.dispatchQueue || 0} tone="warn" />
        <Metric label="History" value={data.summary?.dispatchedHistory || 0} />
      </div>

      {loading ? (
        <div className="mt-6 rounded-xl bg-white py-10 text-center text-gray-500 shadow">
          Loading shipping data...
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <section className="space-y-6">
            <div ref={editorRef} className="scroll-mt-24 rounded-xl bg-white p-4 shadow">
              <h2 className="mb-4 text-lg font-semibold">
                {editingId ? "Edit Shipping Rule" : "Add Shipping Rule"}
              </h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="Rule Name" value={draft.name} onChange={(value) => updateDraft("name", value)} />
                <Field label="Region" value={draft.region} onChange={(value) => updateDraft("region", value)} />
                <Field label="Min. Order Value" type="number" value={draft.min_order_value} onChange={(value) => updateDraft("min_order_value", value)} />
                <Field label="Charge" type="number" value={draft.charge} onChange={(value) => updateDraft("charge", value)} />
                <Field label="Delivery Days" type="number" value={draft.delivery_days} onChange={(value) => updateDraft("delivery_days", value)} />
                <Field label="Priority" type="number" value={draft.priority} onChange={(value) => updateDraft("priority", value)} />
                <label className="text-sm">
                  <span className="text-xs text-gray-500">Status</span>
                  <select
                    value={draft.status}
                    onChange={(event) => updateDraft("status", event.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  >
                    <option>Active</option>
                    <option>Inactive</option>
                  </select>
                </label>
              </div>
              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <div>
                  <p className="text-sm font-medium">Targets</p>
                  <p className="text-xs text-gray-500">Leave empty for a global rule. Category targets include descendants.</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[150px_1fr]">
                    <select value={targetType} onChange={(event) => { setTargetType(event.target.value); setTargetLookup(null); }} className="rounded-lg border bg-white px-3 py-2 text-sm">
                      <option>Product</option><option>Category</option><option>Collection</option>
                    </select>
                    <RemoteLookup type={`${targetType.toLowerCase()}s`} value={targetLookup} onChange={addTarget} placeholder={`Search ${targetType.toLowerCase()}...`} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">{draft.targets.map((target) => <button key={`${target.type}-${target.id}`} type="button" onClick={() => updateDraft("targets", draft.targets.filter((item) => item !== target))} className="rounded bg-gray-100 px-2 py-1 text-xs">{target.type}: {target.label || `#${target.id}`} x</button>)}</div>
                </div>
                <div>
                  <div className="flex items-center justify-between"><div><p className="text-sm font-medium">Delivery locations</p><p className="text-xs text-gray-500">All India, states, or exact pincodes.</p></div><button type="button" onClick={() => updateDraft("locations", [...draft.locations, { type: "State", value: "" }])} className="rounded border px-2 py-1 text-xs">Add</button></div>
                  <div className="mt-2 space-y-2">{draft.locations.map((location, index) => <div key={index} className="grid grid-cols-[130px_1fr_auto] gap-2"><select value={location.type} onChange={(event) => updateLocation(index, "type", event.target.value)} className="rounded border bg-white px-2 py-2 text-sm"><option>All India</option><option>State</option><option>Pincode</option></select><input disabled={location.type === "All India"} value={location.value} onChange={(event) => updateLocation(index, "value", event.target.value)} placeholder={location.type === "Pincode" ? "122011" : "Haryana"} className="rounded border px-3 py-2 text-sm disabled:bg-gray-100" /><button type="button" disabled={draft.locations.length === 1} onClick={() => updateDraft("locations", draft.locations.filter((_, locationIndex) => locationIndex !== index))} className="px-2 text-red-600 disabled:opacity-30">x</button></div>)}</div>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={submitRule} className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white">
                  {editingId ? "Update Rule" : "Create Rule"}
                </button>
                {editingId && (
                  <button onClick={resetDraft} className="rounded-lg border px-4 py-2 text-sm">
                    Cancel
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-white p-4 shadow">
              <h2 className="mb-4 text-lg font-semibold">Shipping Rules</h2>
              <div className="max-h-[440px] overflow-auto">
                <table className="w-full min-w-[720px] text-[13px]">
                  <thead className="border-b text-left text-gray-500">
                    <tr>
                      <th className="p-3">Rule</th>
                      <th>Min Order</th>
                      <th>Charge</th>
                      <th>Delivery Days</th>
                      <th>Priority / Scope</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.rules || []).map((rule) => (
                      <tr key={rule.id} className="border-b">
                        <td className="p-3">
                          <p className="font-medium">{rule.name}</p>
                          <p className="text-xs text-gray-500">{rule.region}</p>
                        </td>
                        <td>Rs. {Number(rule.min_order_value || 0).toLocaleString("en-IN")}</td>
                        <td>Rs. {Number(rule.charge || 0).toLocaleString("en-IN")}</td>
                        <td>{rule.delivery_days || 0}</td>
                        <td><p>{rule.priority || 0}</p><p className="text-xs text-gray-400">{rule.targets?.length ? rule.targets.map((target) => target.type).join(", ") : "Global"}</p></td>
                        <td>
                          <span className="rounded-full bg-green-50 px-2 py-1 text-xs text-green-700">
                            {rule.status}
                          </span>
                        </td>
                        <td>
                          <div className="flex gap-2">
                            <button onClick={() => editRule(rule)} className="rounded-lg border px-3 py-1.5 text-xs">
                              Edit
                            </button>
                            <button onClick={() => removeRule(rule.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600">
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <OrderList title="Dispatch Queue" orders={data.dispatchQueue || []} emptyText="No orders are waiting for dispatch." />
            <OrderList title="Dispatch History" orders={data.history || []} emptyText="No delivered or cancelled orders yet." />
          </section>
        </div>
      )}
    </div>
  );
}

function OrderList({ title, orders, emptyText }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="space-y-3">
        {orders.map((order) => (
          <div key={order.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{order.order_number}</p>
                <p className="text-sm text-gray-500">{order.customer_name || "Guest Customer"}</p>
                <p className="text-xs text-gray-400">
                  {[order.city, order.state].filter(Boolean).join(", ") || "No address"}
                </p>
              </div>
              <span className="rounded-full bg-[#FFF49C] px-2 py-1 text-xs">
                {order.order_status}
              </span>
            </div>
          </div>
        ))}
        {!orders.length && (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label className="text-sm">
      <span className="text-xs text-gray-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border px-3 py-2"
      />
    </label>
  );
}

function Metric({ label, value, tone = "normal" }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tone === "warn" ? "text-orange-700" : ""}`}>{value}</p>
    </div>
  );
}

export default ShippingManagement;
