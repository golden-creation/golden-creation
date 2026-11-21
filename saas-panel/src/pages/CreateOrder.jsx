import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { createAdminOrder } from "../lib/adminApi";
import RemoteLookup from "../components/RemoteLookup";

const emptyCustomer = {
  name: "",
  email: "",
  phone: "",
  streetAddress: "",
  city: "",
  state: "",
  zipCode: "",
  paymentMethod: "Cash on Delivery",
};

const emptyItem = {
  productId: "",
  productName: "",
  quantity: 1,
  price: 0,
  product: null,
};

function CreateOrder() {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(emptyCustomer);
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [status, setStatus] = useState("Processing");
  const [shippingFee, setShippingFee] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum + (Number(item.quantity) || 0) * (Number(item.price) || 0),
        0
      ),
    [items]
  );
  const totalAmount = subtotal + Number(shippingFee || 0) + Number(taxAmount || 0);

  const updateCustomer = (key, value) => {
    setCustomer((previous) => ({ ...previous, [key]: value }));
    setMessage("");
  };

  const updateItem = (index, key, value) => {
    setItems((previous) =>
      previous.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        if (key === "product") {
          return {
            ...item,
            product: value,
            productId: value?.id || "",
            productName: value?.label || "",
            price: Number(value?.price || 0),
          };
        }

        return { ...item, [key]: value };
      })
    );
    setMessage("");
  };

  const addItem = () => {
    setItems((previous) => [...previous, { ...emptyItem }]);
  };

  const removeItem = (index) => {
    setItems((previous) =>
      previous.length === 1
        ? [{ ...emptyItem }]
        : previous.filter((_, itemIndex) => itemIndex !== index)
    );
  };

  const submitOrder = async () => {
    if (!customer.name.trim()) {
      setMessage("Customer name is required.");
      return;
    }

    const validItems = items.filter(
      (item) => item.productName && Number(item.quantity) > 0
    );

    if (!validItems.length) {
      setMessage("Add at least one product to the order.");
      return;
    }

    try {
      setSaving(true);
      const response = await createAdminOrder({
        customer,
        items: validItems.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: Number(item.quantity) || 1,
          price: Number(item.price) || 0,
        })),
        subtotal,
        shippingFee: Number(shippingFee || 0),
        taxAmount: Number(taxAmount || 0),
        totalAmount,
        status,
      });

      navigate(`/orders/${response.order.id}`);
    } catch (error) {
      setMessage(error.message || "Unable to create order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Create New Order</h1>
          <p className="text-sm text-gray-500">
            Create a complete customer order from the admin panel.
          </p>
        </div>
        <button
          onClick={() => navigate("/orders")}
          className="rounded-lg bg-white px-4 py-2 text-sm shadow"
        >
          Back to Orders
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-[#D6BE8C] bg-[#FFF9E6] px-3 py-2 text-sm text-[#6E4D13]">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
        <section className="space-y-6">
          <div className="rounded-xl bg-white p-4 shadow">
            <h2 className="mb-4 text-lg font-semibold">Customer Details</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Customer Name" value={customer.name} onChange={(value) => updateCustomer("name", value)} />
              <Field label="Email" value={customer.email} onChange={(value) => updateCustomer("email", value)} />
              <Field label="Phone" value={customer.phone} onChange={(value) => updateCustomer("phone", value)} />
              <Field label="Payment Method" value={customer.paymentMethod} onChange={(value) => updateCustomer("paymentMethod", value)} />
              <Field label="Street Address" value={customer.streetAddress} onChange={(value) => updateCustomer("streetAddress", value)} className="md:col-span-2" />
              <Field label="City" value={customer.city} onChange={(value) => updateCustomer("city", value)} />
              <Field label="State" value={customer.state} onChange={(value) => updateCustomer("state", value)} />
              <Field label="ZIP Code" value={customer.zipCode} onChange={(value) => updateCustomer("zipCode", value)} />
              <label className="text-sm">
                <span className="text-xs text-gray-500">Order Status</span>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                >
                  {["Pending", "Processing", "Dispatched", "In Transit", "Delivered", "Cancelled"].map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-xl bg-white p-4 shadow">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Products</h2>
              <button onClick={addItem} className="rounded-lg bg-[#A68B5B] px-3 py-2 text-sm text-white">
                Add Product
              </button>
            </div>
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-1 gap-3 rounded-lg border p-3 md:grid-cols-[1fr_120px_140px_88px]">
                  <label className="text-sm">
                    <span className="text-xs text-gray-500">Product</span>
                    <RemoteLookup type="products" catalog="website" value={item.product} onChange={(product) => updateItem(index, "product", product)} placeholder="Search product..." />
                  </label>
                  <Field label="Quantity" type="number" value={item.quantity} onChange={(value) => updateItem(index, "quantity", value)} />
                  <Field label="Price" type="number" value={item.price} onChange={(value) => updateItem(index, "price", value)} />
                  <button onClick={() => removeItem(index)} className="self-end rounded-lg border px-3 py-2 text-sm">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="self-start rounded-xl bg-white p-4 shadow">
          <h2 className="mb-4 text-lg font-semibold">Order Total</h2>
          <div className="space-y-3 text-sm">
            <Row label="Subtotal" value={subtotal} />
            <Field label="Shipping" type="number" value={shippingFee} onChange={setShippingFee} />
            <Field label="Tax" type="number" value={taxAmount} onChange={setTaxAmount} />
            <div className="flex justify-between border-t pt-3 text-base font-semibold">
              <span>Total</span>
              <span>Rs. {totalAmount.toLocaleString("en-IN")}</span>
            </div>
          </div>
          <button
            onClick={submitOrder}
            disabled={saving}
            className="mt-5 w-full rounded-lg bg-[#A68B5B] px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Creating..." : "Create Order"}
          </button>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, className = "", type = "text" }) {
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
    <div className="flex justify-between">
      <span>{label}</span>
      <span>Rs. {Number(value || 0).toLocaleString("en-IN")}</span>
    </div>
  );
}

export default CreateOrder;
