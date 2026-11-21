import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getAdminOrderDetail,
  markOrderCodCollected,
  updateAdminShipment,
} from "../lib/adminApi";

const statusOptions = ["Pending", "Processing", "Dispatched", "In Transit", "Delivered", "Cancelled"];

function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [tracking, setTracking] = useState({ trackingUrl: "", logisticsProvider: "" });
  const [dispatchPrompt, setDispatchPrompt] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadOrder() {
      try {
        setLoading(true);
        const payload = await getAdminOrderDetail(id);

        if (!cancelled) {
          setOrder(payload.order);
          setItems(payload.items || []);
          setTracking({ trackingUrl: payload.order?.tracking_url || "", logisticsProvider: payload.order?.logistics_provider || "" });
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error.message || "Unable to load order");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadOrder();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const changeStatus = async (status, extra = {}) => {
    if (status === "Dispatched" && !extra.fulfillmentStockSource && !order?.physical_stock_deducted_at) {
      setDispatchPrompt(true);
      return;
    }

    try {
      await updateAdminShipment(id, { status, ...tracking, ...extra });
      setOrder((current) => ({
        ...current,
        order_status: status,
        fulfillment_stock_source: extra.fulfillmentStockSource || current.fulfillment_stock_source,
      }));
      setMessage(`Order moved to ${status}`);
    } catch (error) {
      setMessage(error.message || "Unable to update status");
    }
  };

  const confirmDispatch = async (source) => {
    setDispatchPrompt(false);
    await changeStatus("Dispatched", { fulfillmentStockSource: source });
  };

  const collectCod = async () => {
    if (!window.confirm(`Mark Rs. ${Number(order.cod_due || 0).toLocaleString("en-IN")} as collected?`)) return;
    try {
      await markOrderCodCollected(id);
      setOrder((current) => ({
        ...current,
        amount_paid: current.total_amount,
        cod_due: 0,
        payment_status: "Paid",
      }));
      setMessage("COD balance marked as collected.");
    } catch (error) {
      setMessage(error.message || "Unable to collect COD balance");
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading order detail...</div>;
  }

  if (!order) {
    return <div className="p-6 text-sm text-gray-500">{message || "Order not found."}</div>;
  }

  return (
    <div className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs text-gray-500">ORDER DETAIL</p>
          <h1 className="text-2xl font-semibold">{order.order_number}</h1>
          <p className="text-sm text-gray-500">
            {new Date(order.created_at).toLocaleString("en-IN")}
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate("/orders")} className="rounded-lg bg-white px-4 py-2 text-sm shadow">
            Back
          </button>
          <select
            value={order.order_status}
            onChange={(event) => changeStatus(event.target.value)}
            className="rounded-lg border bg-white px-3 py-2 text-sm shadow"
          >
            {statusOptions.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700">
          {message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <section className="rounded-xl bg-white p-5 shadow">
          <h2 className="text-lg font-semibold">Order Items</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b text-left text-gray-500">
                <tr>
                  <th className="p-3">Product</th>
                  <th>SKU</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b">
                    <td className="p-3 font-medium">
                      <p>{item.product_name}</p>
                      {item.item_type === "Bundle" && (
                        <p className="mt-1 text-xs font-normal text-[#8A541E]">
                          Bundle order{item.bundle_name ? `: ${item.bundle_name}` : ""}
                        </p>
                      )}
                    </td>
                    <td>{item.sku || "-"}</td>
                    <td>{item.quantity}</td>
                    <td>Rs. {Number(item.price || 0).toLocaleString("en-IN")}</td>
                    <td>Rs. {Number(item.line_total || 0).toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-xl bg-white p-5 shadow">
            <h2 className="text-lg font-semibold">Shipment Tracking</h2>
            <div className="mt-4 space-y-3 text-sm">
              <input value={tracking.logisticsProvider} onChange={(event) => setTracking({ ...tracking, logisticsProvider: event.target.value })} placeholder="Logistics provider" className="w-full rounded border px-3 py-2" />
              <input value={tracking.trackingUrl} onChange={(event) => setTracking({ ...tracking, trackingUrl: event.target.value })} placeholder="Tracking URL" className="w-full rounded border px-3 py-2" />
              <button onClick={() => changeStatus(order.order_status)} className="rounded bg-black px-3 py-2 text-xs text-white">Save tracking</button>
            </div>
          </section>
          <section className="rounded-xl bg-white p-5 shadow">
            <h2 className="text-lg font-semibold">Customer</h2>
            <div className="mt-4 space-y-3 text-sm">
              <Detail label="Name" value={order.customer_name || "Guest Customer"} />
              <Detail label="Email" value={order.customer_email || "-"} />
              <Detail label="Phone" value={order.customer_phone || "-"} />
              <Detail
                label="Address"
                value={[order.street_address, order.city, order.state, order.zip_code]
                  .filter(Boolean)
                  .join(", ") || "-"}
              />
            </div>
          </section>

          <section className="rounded-xl bg-white p-5 shadow">
            <h2 className="text-lg font-semibold">Payment Summary</h2>
            <div className="mt-4 space-y-2 text-sm">
              <Row label="Subtotal" value={order.subtotal} />
              <Row label="Shipping" value={order.shipping_fee} />
              <Row
                label={Number(order.tax_amount || 0) > 0 ? "Additional GST" : "GST"}
                value={Number(order.tax_amount || 0) > 0 ? order.tax_amount : "Inclusive in product prices"}
              />
              <div className="border-t pt-2">
                <Row label="Total" value={order.total_amount} strong />
              </div>
              <Row label="Online / collected" value={order.amount_paid} />
              <Row label="COD due" value={order.cod_due} strong={Number(order.cod_due) > 0} />
              <Detail label="Payment Method" value={order.payment_method || "-"} />
              <Detail label="Payment Status" value={order.payment_status || "Pending"} />
              {Number(order.cod_due || 0) > 0 && <button onClick={collectCod} className="mt-3 w-full rounded bg-[#A68B5B] px-3 py-2 text-sm text-white">Mark COD collected</button>}
            </div>
          </section>
        </aside>
      </div>
      {dispatchPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold">Select dispatch stock source</h2>
            <p className="mt-2 text-sm text-gray-600">
              Choose where physical stock should be deducted for this order.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => confirmDispatch("warehouse")} className="rounded-xl bg-[#A68B5B] px-4 py-3 text-sm font-semibold text-white">
                Warehouse
              </button>
              <button type="button" onClick={() => confirmDispatch("shop")} className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white">
                Shop
              </button>
            </div>
            <button type="button" onClick={() => setDispatchPrompt(false)} className="mt-4 w-full rounded-xl border px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
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

function Row({ label, value, strong = false }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span>Rs. {Number(value || 0).toLocaleString("en-IN")}</span>
    </div>
  );
}

export default OrderDetail;
