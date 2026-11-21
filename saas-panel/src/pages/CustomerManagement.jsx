import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createAdminCustomer,
  deleteAdminCustomer,
  getAdminCustomers,
  downloadAdminXlsx,
  runBulkAction,
} from "../lib/adminApi";

function CustomerManagement() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [summary, setSummary] = useState({});
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    is_verified: true,
  });
  const [selectedIds, setSelectedIds] = useState([]);
  const bulkDelete = async () => { if (!selectedIds.length) return setMessage("Select customers first."); const response = await runBulkAction("customers", "delete", selectedIds); setSelectedIds([]); setMessage(`${response.result?.deleted?.length || 0} customer(s) deleted. ${response.result?.blocked?.length || 0} blocked by order history.`); await loadCustomers(); };

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const data = await getAdminCustomers();
      setCustomers(data.customers || []);
      setSummary(data.summary || {});
    } catch (error) {
      setMessage(error.message || "Unable to load customers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    const value = query.trim().toLowerCase();

    if (!value) return customers;

    return customers.filter((customer) =>
      [
        customer.name,
        customer.email,
        customer.phone,
        customer.id,
        customer.total_orders,
      ]
        .join(" ")
        .toLowerCase()
        .includes(value)
    );
  }, [customers, query]);

  const submitCustomer = async (event) => {
    event.preventDefault();
    setMessage("");

    try {
      await createAdminCustomer(form);
      setForm({ name: "", email: "", phone: "", is_verified: true });
      setFormOpen(false);
      setMessage("Customer created");
      await loadCustomers();
    } catch (error) {
      setMessage(error.message || "Unable to create customer");
    }
  };

  const removeCustomer = async (customer) => {
    if (!window.confirm(`Delete ${customer.name || customer.email || "this customer"}?`)) {
      return;
    }

    try {
      await deleteAdminCustomer(customer.id);
      setMessage("Customer deleted");
      await loadCustomers();
    } catch (error) {
      setMessage(error.message || "Unable to delete customer");
    }
  };
  const allVisibleSelected =
    filteredCustomers.length > 0 && filteredCustomers.every((customer) => selectedIds.includes(customer.id));

  return (
    <div className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Customer Management</h1>
          <p className="text-sm text-gray-500">
            Create, review, open details, and delete registered customers.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search customers..."
            className="rounded-lg border bg-white px-3 py-2 text-sm md:w-80"
          />
          <button
            onClick={() => setFormOpen((value) => !value)}
            className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm font-medium text-white"
          >
            Add Customer
          </button>
          <button onClick={() => downloadAdminXlsx("customers", selectedIds.length ? { ids: selectedIds.join(",") } : {})} className="rounded-lg bg-black px-4 py-2 text-sm text-white">Export XLSX</button>
          <button onClick={bulkDelete} className="rounded-lg bg-red-700 px-4 py-2 text-sm text-white">Delete Selected</button>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700">
          {message}
        </div>
      )}

      {formOpen && (
        <form onSubmit={submitCustomer} className="mb-6 rounded-xl bg-white p-4 shadow">
          <div className="grid gap-3 md:grid-cols-5">
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Name"
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <input
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="Email"
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <input
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              placeholder="Phone"
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_verified}
                onChange={(event) => setForm({ ...form, is_verified: event.target.checked })}
              />
              Verified
            </label>
            <button className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white">
              Create
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Metric label="Total Customers" value={summary.totalCustomers || 0} />
        <Metric label="Verified" value={summary.verifiedCustomers || 0} />
        <Metric label="Repeat Customers" value={summary.repeatCustomers || 0} />
        <Metric
          label="Lifetime Value"
          value={`Rs. ${Number(summary.lifetimeValue || 0).toLocaleString("en-IN")}`}
        />
      </div>

      <section className="mt-6 rounded-xl bg-white p-4 shadow">
        {loading ? (
          <div className="py-10 text-center text-gray-500">Loading customers...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="border-b text-left text-gray-500">
                <tr>
                  <th className="p-3"><input type="checkbox" aria-label="Select all customers" checked={allVisibleSelected} onChange={(event) => setSelectedIds(event.target.checked ? filteredCustomers.map((customer) => customer.id) : [])} /></th>
                  <th className="p-3">Customer</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Orders</th>
                  <th>Lifetime Value</th>
                  <th>Status</th>
                  <th>Last Order</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="border-b">
                    <td className="p-3"><input type="checkbox" checked={selectedIds.includes(customer.id)} onChange={(event) => setSelectedIds(event.target.checked ? [...selectedIds, customer.id] : selectedIds.filter((id) => id !== customer.id))} /></td>
                    <td className="p-3">
                      <p className="font-medium">{customer.name || "Customer"}</p>
                      <p className="text-xs text-gray-400">USR-{customer.id}</p>
                    </td>
                    <td>{customer.email || "-"}</td>
                    <td>{customer.phone || "-"}</td>
                    <td>{customer.total_orders || 0}</td>
                    <td>Rs. {Number(customer.lifetime_value || 0).toLocaleString("en-IN")}</td>
                    <td>
                      <span className={`rounded-full px-2 py-1 text-xs ${customer.is_verified ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"}`}>
                        {customer.is_verified ? "Verified" : "Pending"}
                      </span>
                    </td>
                    <td>{customer.last_order_at ? new Date(customer.last_order_at).toLocaleDateString("en-IN") : "-"}</td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate(`/customers/${customer.id}`)}
                          className="rounded-lg bg-[#A68B5B] px-3 py-1.5 text-xs text-white"
                        >
                          View
                        </button>
                        <button
                          onClick={() => removeCustomer(customer)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredCustomers.length && (
                  <tr>
                    <td colSpan="8" className="py-10 text-center text-gray-500">
                      No customers matched your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
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

export default CustomerManagement;
