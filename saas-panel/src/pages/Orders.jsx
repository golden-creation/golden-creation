import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

import searchIcon from "../assets/search.png";

import {
  getAdminOrders,
  downloadAdminXlsx,
  updateAdminOrderStatus,
} from "../lib/adminApi";
import { nextStatusOptions } from "../lib/orderCancellation";
import CancelOrderDialog from "../components/CancelOrderDialog";

const Orders = () => {
  const navigate = useNavigate();
  const [orders, setOrders] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [search, setSearch] =
    useState("");

  const [metrics, setMetrics] =
    useState({
      totalRevenue: 0,
      activeOrders: 0,
      deliveredOrders: 0,
      averageValue: 0,
    });

  const [message, setMessage] =
    useState("");
  const [dispatchPrompt, setDispatchPrompt] =
    useState(null);
  const [cancelPrompt, setCancelPrompt] =
    useState(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setMessage("");

      const response =
        await getAdminOrders();

      setOrders(response.orders || []);

      setMetrics(
        response.metrics || {}
      );
    } catch (error) {
      console.log(error);
      setMessage(
        error.message ||
          "Unable to load orders"
      );
    } finally {
      setLoading(false);
    }
  };

  const changeStatus = async (
    order,
    status,
    extra = {}
  ) => {
    if (status === "Dispatched" && !extra.fulfillmentStockSource) {
      setDispatchPrompt({ order, status });
      return;
    }
    if (status === "Cancelled") {
      setCancelPrompt({ order });
      return;
    }

    try {
      const response = await updateAdminOrderStatus(
        order.id,
        status,
        extra
      );
      setOrders((current) =>
        current.map((item) =>
          item.id === order.id
            ? { ...item, status }
            : item
        )
      );
      setMessage(
        response.message ||
          `Order ${order.orderId} moved to ${status}`
      );
    } catch (error) {
      setMessage(
        error.message ||
          "Unable to update order status"
      );
    }
  };

  const confirmDispatch = async (source) => {
    const prompt = dispatchPrompt;
    setDispatchPrompt(null);
    if (!prompt?.order) return;
    await changeStatus(prompt.order, "Dispatched", {
      fulfillmentStockSource: source,
    });
  };

  const confirmCancellation = async (reason) => {
    const prompt = cancelPrompt;
    setCancelPrompt(null);
    if (!prompt?.order) return;
    try {
      const response = await updateAdminOrderStatus(prompt.order.id, "Cancelled", { reason });
      setOrders((current) =>
        current.map((item) =>
          item.id === prompt.order.id ? { ...item, status: "Cancelled" } : item
        )
      );
      setMessage(response.message || `Order ${prompt.order.orderId} cancelled`);
    } catch (error) {
      setMessage(error.message || "Unable to cancel order");
    }
  };

  const filteredOrders =
    useMemo(() => {
      return orders.filter((order) => {
        const text = `
          ${order.orderId}
          ${order.customer}
          ${order.product}
          ${order.status}
        `.toLowerCase();

        return text.includes(
          search.toLowerCase()
        );
      });
    }, [orders, search]);

  return (
    <div className="p-6">
      {/* HEADER */}

      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            Order Management
          </h1>

          <p className="text-gray-500">
            Manage and track orders
          </p>
        </div>
        <div className="flex flex-wrap gap-2"><button onClick={() => downloadAdminXlsx("orders")} className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white">Export XLSX</button><button onClick={() => navigate("/orders/new")} className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm font-medium text-white">Create New Order</button></div>
      </div>

      {/* STATS */}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
        <StatCard
          title="Total Revenue"
          value={`₹${metrics.totalRevenue || 0}`}
        />

        <StatCard
          title="Active Orders"
          value={
            metrics.activeOrders || 0
          }
        />

        <StatCard
          title="Delivered"
          value={
            metrics.deliveredOrders ||
            0
          }
        />

        <StatCard
          title="Avg. Value"
          value={`₹${
            metrics.averageValue || 0
          }`}
        />
      </div>

      {/* TABLE */}

      {message && (
        <div className="mt-4 rounded-lg border border-[#D6BE8C] bg-[#FFF9E6] px-3 py-2 text-sm text-[#6E4D13]">
          {message}
        </div>
      )}

      <div className="mt-8 rounded-3xl border bg-white p-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-bold">
            Recent Orders
          </h2>

          <div className="flex items-center rounded-xl border px-3 py-2">
            <img
              src={searchIcon}
              className="mr-2 h-4 w-4"
            />

            <input
              placeholder="Search orders..."
              value={search}
              onChange={(e) =>
                setSearch(
                  e.target.value
                )
              }
              className="outline-none"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-gray-500">
            Loading orders...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-4">
                    Order ID
                  </th>

                  <th className="pb-4">
                    Customer
                  </th>

                  <th className="pb-4">
                    Email
                  </th>

                  <th className="pb-4">
                    Phone
                  </th>

                  <th className="pb-4">
                    Product
                  </th>

                  <th className="pb-4">
                    Date
                  </th>

                  <th className="pb-4">
                    Amount
                  </th>

                  <th className="pb-4">
                    Status
                  </th>

                  <th className="pb-4">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredOrders.map(
                  (order) => (
                    <tr
                      key={order.id}
                      className="border-b"
                    >
                      <td className="py-4 font-medium">
                        {
                          order.orderId
                        }
                      </td>

                      <td className="py-4">
                        {
                          order.customer
                        }
                      </td>

                      <td className="py-4">
                        {order.email}
                      </td>

                      <td className="py-4">
                        {order.phone}
                      </td>

                      <td className="py-4 max-w-[250px]">
                        {order.product}
                      </td>

                      <td className="py-4">
                        {order.date}
                      </td>

                      <td className="py-4 font-semibold">
                        ₹{order.amount}
                      </td>

                      <td className="py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            order.status ===
                            "Delivered"
                              ? "bg-green-100 text-green-700"
                              : order.status ===
                                  "Pending" ||
                                order.status ===
                                  "Processing"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>

                      <td className="py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              navigate(
                                `/orders/${order.id}`
                              )
                            }
                            className="rounded-lg bg-[#A68B5B] px-3 py-1.5 text-sm text-white"
                          >
                            View Details
                          </button>
                          <select
                            value={order.status}
                            onChange={(event) =>
                              changeStatus(
                                order,
                                event.target.value
                              )
                            }
                            className="rounded-lg border px-2 py-1 text-sm"
                          >
                            {nextStatusOptions(order.status).map((status) => (
                              <option key={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {dispatchPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold">
              Select dispatch stock source
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Choose where physical stock should be deducted for order {dispatchPrompt.order?.orderId}.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => confirmDispatch("warehouse")}
                className="rounded-xl bg-[#A68B5B] px-4 py-3 text-sm font-semibold text-white"
              >
                Warehouse
              </button>
              <button
                type="button"
                onClick={() => confirmDispatch("shop")}
                className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
              >
                Shop
              </button>
            </div>
            <button
              type="button"
              onClick={() => setDispatchPrompt(null)}
              className="mt-4 w-full rounded-xl border px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {cancelPrompt && (
        <CancelOrderDialog
          title="Cancel order"
          detail="This restores website stock only when the order deducted it. Dispatched orders must be resolved from the order page. A captured payment is not marked refunded."
          onClose={() => setCancelPrompt(null)}
          onConfirm={confirmCancellation}
        />
      )}
    </div>
  );
};

const StatCard = ({
  title,
  value,
}) => {
  return (
    <div className="rounded-2xl bg-gradient-to-b from-[#fff7e5] to-[#dca04d] p-5">
      <p className="text-gray-600">
        {title}
      </p>

      <h2 className="mt-3 text-3xl font-bold">
        {value}
      </h2>

      <p className="mt-3 text-sm text-gray-500">
        Synced from backend
      </p>
    </div>
  );
};

export default Orders;
