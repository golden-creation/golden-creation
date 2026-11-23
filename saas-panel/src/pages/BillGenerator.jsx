import React, { useEffect, useMemo, useState } from "react";
import {
  createAdminInvoice,
  downloadAdminBillPdf,
  getAdminBilling,
  sendAdminBill,
  downloadAdminXlsx,
} from "../lib/adminApi";
import RemoteLookup from "../components/RemoteLookup";
import { quantityFieldValue } from "../lib/formatQuantity";

const money = (value) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;

const emptyCustomer = {
  id: "",
  name: "",
  email: "",
  phone: "",
  address: "",
};

const emptyDraft = {
  sourceType: "Manual",
  orderId: "",
  customer: emptyCustomer,
  taxAmount: 0,
  discountAmount: 0,
  paymentLink: "",
  notes: "Thank you for your business.",
  items: [{ productRef: "", productSource: "Manual", name: "", quantity: 1, price: 0 }],
};

function BillGenerator() {
  const [data, setData] = useState({
    summary: {},
    bills: [],
    manualBills: [],
    orderBills: [],
    orders: [],
    customers: [],
    websiteProducts: [],
    warehouseProducts: [],
  });
  const [draft, setDraft] = useState(emptyDraft);
  const [customerLookup, setCustomerLookup] = useState(null);
  const [orderLookup, setOrderLookup] = useState(null);
  const [sendDraft, setSendDraft] = useState({ billId: "", channel: "WhatsApp", recipient: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadBilling = async () => {
    try {
      setLoading(true);
      setMessage("");
      setData(await getAdminBilling());
    } catch (error) {
      setMessage(error.message || "Unable to load billing data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBilling();
  }, []);

  const subtotal = useMemo(
    () =>
      (draft.items || []).reduce(
        (sum, item) => sum + Number(item.quantity || 0) * Number(item.price || 0),
        0
      ),
    [draft.items]
  );
  const totalAmount = subtotal + Number(draft.taxAmount || 0) - Number(draft.discountAmount || 0);

  const updateDraft = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  const updateCustomer = (key, value) => {
    setDraft((current) => ({
      ...current,
      customer: { ...current.customer, [key]: value },
    }));
    setMessage("");
  };

  const selectCustomer = (selection) => {
    const id = selection?.id || selection;
    const customer = (data.customers || []).find((item) => Number(item.id) === Number(id)) || selection;
    if (!customer) return;

    setDraft((current) => ({
      ...current,
      customer: {
        id: customer.id,
        name: customer.name || customer.label || "",
        email: customer.email || "",
        phone: customer.phone || "",
        address: current.customer.address || "",
      },
    }));
  };

  const selectOrder = (selection) => {
    const orderId = selection?.id || selection;
    const order = (data.orders || []).find((item) => Number(item.id) === Number(orderId)) || selection;
    if (!order) {
      updateDraft("orderId", "");
      return;
    }

    setDraft((current) => ({
      ...current,
      sourceType: "Order",
      orderId: order.id,
      customer: {
        id: "",
        name: order.customer_name || "",
        email: order.customer_email || "",
        phone: order.customer_phone || "",
        address: [order.street_address, order.city, order.state, order.zip_code].filter(Boolean).join(", "),
      },
      taxAmount: Number(order.tax_amount || 0),
      discountAmount: 0,
    }));
  };

  const updateItem = (index, key, value) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        if (key === "productOption") {
          return value ? { ...item, productRef: `website:${value.id}`, productSource: "Website", name: value.label, price: Number(value.price || 0), productOption: value } : { ...item, productRef: "", name: "", productOption: null };
        }

        return { ...item, [key]: value };
      }),
    }));
  };

  const addItem = (source = "Manual") => {
    setDraft((current) => ({
      ...current,
      items: [
        ...current.items,
        { productRef: "", productSource: source, name: "", quantity: 1, price: 0 },
      ],
    }));
  };

  const removeItem = (index) => {
    setDraft((current) => ({
      ...current,
      items:
        current.items.length === 1
          ? [{ productRef: "", productSource: "Manual", name: "", quantity: 1, price: 0 }]
          : current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const createBill = async () => {
    if (!draft.customer.name.trim()) {
      setMessage("Customer name is required.");
      return;
    }

    if (draft.sourceType === "Manual" && !draft.items.some((item) => item.name.trim())) {
      setMessage("Add at least one item for a manual bill.");
      return;
    }

    try {
      setSaving(true);
      const response = await createAdminInvoice({
        ...draft,
        customerId: draft.customer.id,
        subtotal,
        totalAmount,
        items: draft.items.map((item) => ({
          ...item,
          qty: Number(item.quantity || 1),
          quantity: Number(item.quantity || 1),
          price: Number(item.price || 0),
        })),
      });
      setMessage(response.message || "Bill generated.");
      setDraft(emptyDraft);
      setCustomerLookup(null);
      setOrderLookup(null);
      await loadBilling();
    } catch (error) {
      setMessage(error.message || "Unable to generate bill");
    } finally {
      setSaving(false);
    }
  };

  const downloadBill = async (id) => {
    try {
      await downloadAdminBillPdf(id);
      setMessage("Bill PDF downloaded.");
    } catch (error) {
      setMessage(error.message || "Unable to download bill");
    }
  };

  const sendBill = async () => {
    if (!sendDraft.billId) {
      setMessage("Select a bill to send.");
      return;
    }

    try {
      const response = await sendAdminBill(sendDraft.billId, sendDraft);
      if (response.actionUrl) {
        window.open(response.actionUrl, "_blank", "noopener,noreferrer");
      }
      setMessage(response.message || "Bill message prepared.");
      await loadBilling();
    } catch (error) {
      setMessage(error.message || "Unable to prepare bill message");
    }
  };

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-[#F8F6F2]">Loading billing...</div>;
  }

  return (
    <div className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
        <h1 className="text-2xl font-semibold">Billing Management</h1>
        <p className="text-sm text-gray-500">
          Generate bills from website orders or create manual bills from unified inventory and custom items.
        </p>
        </div>
        <button onClick={() => downloadAdminXlsx("bills")} className="rounded bg-black px-4 py-2 text-sm text-white">Export XLSX</button>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-[#D6BE8C] bg-[#FFF9E6] px-3 py-2 text-sm text-[#6E4D13]">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Metric label="Total Bills" value={data.summary?.totalBills || 0} />
        <Metric label="Manual Bills" value={data.summary?.manualBills || 0} />
        <Metric label="Order Bills" value={data.summary?.orderBills || 0} />
        <Metric label="Total Value" value={money(data.summary?.totalValue || 0)} />
      </div>

      <div className="mt-6 space-y-6">
        <section className="space-y-6">
          <div className="rounded-xl bg-white p-4 shadow">
            <div className="mb-4 flex flex-wrap gap-2">
              {["Manual", "Order"].map((type) => (
                <button
                  key={type}
                  onClick={() => updateDraft("sourceType", type)}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    draft.sourceType === type ? "bg-[#A68B5B] text-white" : "border bg-white"
                  }`}
                >
                  {type === "Manual" ? "Manual Bill" : "Existing Order Bill"}
                </button>
              ))}
            </div>

            {draft.sourceType === "Order" && (
              <label className="mb-4 block text-sm">
                <span className="text-xs text-gray-500">Select Existing Order</span>
                <div className="mt-1">
                  <RemoteLookup type="orders" value={orderLookup} onChange={(option) => { setOrderLookup(option); selectOrder(option); }} placeholder="Search order number..." />
                </div>
              </label>
            )}

            <h2 className="mb-3 text-lg font-semibold">Customer Details</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-sm">
                <span className="text-xs text-gray-500">Search Customer</span>
                <div className="mt-1">
                  <RemoteLookup type="customers" value={customerLookup} onChange={(option) => { setCustomerLookup(option); selectCustomer(option); }} placeholder="Search by name, email, phone..." />
                </div>
              </label>
              <Field label="Customer Name" value={draft.customer.name} onChange={(value) => updateCustomer("name", value)} />
              <Field label="Email" value={draft.customer.email} onChange={(value) => updateCustomer("email", value)} />
              <Field label="Phone / WhatsApp" value={draft.customer.phone} onChange={(value) => updateCustomer("phone", value)} />
              <Field label="Address" value={draft.customer.address} onChange={(value) => updateCustomer("address", value)} className="md:col-span-2" />
            </div>
          </div>

          <div className="rounded-xl bg-white p-4 shadow">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="text-lg font-semibold">Bill Items</h2>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => addItem("Website")} className="rounded-lg border px-3 py-2 text-sm">Add Inventory Product</button>
                <button onClick={() => addItem("Manual")} className="rounded-lg border px-3 py-2 text-sm">Add Manual Item</button>
              </div>
            </div>
            <div className="space-y-3">
              {draft.items.map((item, index) => (
                <div key={index} className="grid grid-cols-1 gap-3 rounded-lg border p-3 md:grid-cols-[150px_1fr_90px_120px_92px]">
                  <label className="text-sm">
                    <span className="text-xs text-gray-500">Source</span>
                    <select
                      value={item.productSource}
                      onChange={(event) => updateItem(index, "productSource", event.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    >
                      <option>Manual</option>
                      <option>Website</option>
                    </select>
                  </label>
                  {item.productSource === "Manual" ? (
                    <Field label="Item Name" value={item.name} onChange={(value) => updateItem(index, "name", value)} />
                  ) : (
                    <label className="text-sm">
                      <span className="text-xs text-gray-500">Product</span>
                      <RemoteLookup type="products" catalog="website" value={item.productOption || (item.productRef ? { label: item.name } : null)} onChange={(value) => updateItem(index, "productOption", value)} placeholder="Search product..." />
                    </label>
                  )}
                  <Field label="Qty" type="number" value={quantityFieldValue(item.quantity)} onChange={(value) => updateItem(index, "quantity", value)} />
                  <Field label="Price" type="number" value={item.price} onChange={(value) => updateItem(index, "price", value)} />
                  <button onClick={() => removeItem(index)} className="self-end rounded-lg border px-3 py-2 text-sm">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-xl bg-white p-4 shadow">
            <h2 className="mb-4 text-lg font-semibold">Bill Summary</h2>
            <div className="space-y-3">
              <Row label="Subtotal" value={money(subtotal)} />
              <Field label="Tax Amount" type="number" value={draft.taxAmount} onChange={(value) => updateDraft("taxAmount", value)} />
              <Field label="Discount" type="number" value={draft.discountAmount} onChange={(value) => updateDraft("discountAmount", value)} />
              <Field label="Future Payment Link" value={draft.paymentLink} onChange={(value) => updateDraft("paymentLink", value)} />
              <label className="text-sm">
                <span className="text-xs text-gray-500">Notes</span>
                <textarea
                  value={draft.notes}
                  onChange={(event) => updateDraft("notes", event.target.value)}
                  className="mt-1 min-h-20 w-full rounded-lg border px-3 py-2"
                />
              </label>
              <div className="flex justify-between border-t pt-3 text-base font-semibold">
                <span>Total</span>
                <span>{money(totalAmount)}</span>
              </div>
              <button
                onClick={createBill}
                disabled={saving}
                className="w-full rounded-lg bg-[#A68B5B] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? "Generating..." : "Generate Bill"}
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-white p-4 shadow">
            <h2 className="mb-4 text-lg font-semibold">Send Bill</h2>
            <p className="mb-3 text-xs text-gray-500">
              WhatsApp browser links cannot attach PDFs automatically. Download the PDF first, then attach it manually in WhatsApp if needed.
            </p>
            <div className="space-y-3">
              <label className="text-sm">
                <span className="text-xs text-gray-500">Bill</span>
                <select
                  value={sendDraft.billId}
                  onChange={(event) => setSendDraft({ ...sendDraft, billId: event.target.value })}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                >
                  <option value="">Select generated bill</option>
                  {(data.bills || []).map((bill) => (
                    <option key={bill.id} value={bill.id}>
                      {bill.bill_number} - {bill.customer_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-xs text-gray-500">Channel</span>
                <select
                  value={sendDraft.channel}
                  onChange={(event) => setSendDraft({ ...sendDraft, channel: event.target.value })}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                >
                  <option>WhatsApp</option>
                  <option>Email</option>
                  <option>SMS</option>
                </select>
              </label>
              <Field label="Manual recipient number/email" value={sendDraft.recipient} onChange={(value) => setSendDraft({ ...sendDraft, recipient: value })} />
              <button onClick={sendBill} className="w-full rounded-lg border px-4 py-2 text-sm">
                Prepare Message
              </button>
              <button
                onClick={() => sendDraft.billId && downloadBill(sendDraft.billId)}
                className="w-full rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white"
              >
                Download Selected Bill PDF
              </button>
            </div>
          </div>
        </aside>
      </div>

      <BillList title="Manual Bills" bills={data.manualBills || []} onDownload={downloadBill} />
      <BillList title="Order Bills" bills={data.orderBills || []} onDownload={downloadBill} />
    </div>
  );
}

function BillList({ title, bills, onDownload }) {
  return (
    <section className="mt-6 rounded-xl bg-white p-4 shadow">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b text-left text-gray-500">
            <tr>
              <th className="p-3">Bill</th>
              <th>Customer</th>
              <th>Source</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((bill) => (
              <tr key={bill.id} className="border-b">
                <td className="p-3 font-medium">{bill.bill_number}</td>
                <td>{bill.customer_name}</td>
                <td>{bill.source_type}</td>
                <td>{money(bill.total_amount)}</td>
                <td>{bill.status}</td>
                <td>
                  <button onClick={() => onDownload(bill.id)} className="rounded-lg border px-3 py-1.5 text-xs">
                    Download PDF
                  </button>
                </td>
              </tr>
            ))}
            {!bills.length && (
              <tr>
                <td colSpan="6" className="p-8 text-center text-gray-500">
                  No bills found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Field({ label, value, onChange, type = "text", className = "" }) {
  return (
    <label className={`text-sm ${className}`}>
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

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span>{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

export default BillGenerator;
