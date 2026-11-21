import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getAdminCustomerDetail } from "../lib/adminApi";

function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadCustomer() {
      try {
        setLoading(true);
        const payload = await getAdminCustomerDetail(id);

        if (!cancelled) {
          setCustomer(payload.customer);
          setOrders(payload.orders || []);
          setSummary(payload.summary || {});
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error.message || "Unable to load customer");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCustomer();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading customer detail...</div>;
  }

  if (!customer) {
    return <div className="p-6 text-sm text-gray-500">{message || "Customer not found."}</div>;
  }

  return (
    <div className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs text-gray-500">CUSTOMER DETAIL</p>
          <h1 className="text-2xl font-semibold">{customer.name || "Customer"}</h1>
          <p className="text-sm text-gray-500">USR-{customer.id}</p>
        </div>
        <button onClick={() => navigate("/customers")} className="rounded-lg bg-white px-4 py-2 text-sm shadow">
          Back to Customers
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <section className="rounded-xl bg-white p-5 shadow">
          <h2 className="text-lg font-semibold">Profile</h2>
          <div className="mt-4 space-y-3 text-sm">
            <Detail label="Name" value={customer.name || "-"} />
            <Detail label="Email" value={customer.email || "-"} />
            <Detail label="Phone" value={customer.phone || "-"} />
            <Detail label="Status" value={customer.is_verified ? "Verified" : "Pending"} />
            <Detail
              label="Created"
              value={customer.created_at ? new Date(customer.created_at).toLocaleString("en-IN") : "-"}
            />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Metric label="Orders" value={summary.totalOrders || 0} />
            <Metric
              label="Value"
              value={`Rs. ${Number(summary.lifetimeValue || 0).toLocaleString("en-IN")}`}
            />
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow">
          <h2 className="text-lg font-semibold">Order History</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b text-left text-gray-500">
                <tr>
                  <th className="p-3">Order</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b">
                    <td className="p-3 font-medium">{order.order_number}</td>
                    <td>{new Date(order.created_at).toLocaleDateString("en-IN")}</td>
                    <td>{order.order_status}</td>
                    <td>{order.payment_method || "-"}</td>
                    <td>Rs. {Number(order.total_amount || 0).toLocaleString("en-IN")}</td>
                    <td>
                      <button
                        onClick={() => navigate(`/orders/${order.id}`)}
                        className="rounded-lg bg-[#A68B5B] px-3 py-1.5 text-xs text-white"
                      >
                        View Order
                      </button>
                    </td>
                  </tr>
                ))}
                {!orders.length && (
                  <tr>
                    <td colSpan="6" className="py-10 text-center text-gray-500">
                      No orders found for this customer.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-medium text-gray-800">{value}</p>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg bg-[#FFF9E6] p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

export default CustomerDetail;
