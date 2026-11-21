import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import deliveryIcon from "../assets/express-delivery.png";
import locationIcon from "../assets/location.png";
import checkIcon from "../assets/check.png";
import searchIcon from "../assets/search.png";
import { useAppStore } from "../context/AppContext";
import { downloadOrderInvoice, formatCurrency, formatDate } from "../lib/api";

function ConnectedTrackOrder() {
  const { orders, currentUser } = useAppStore();
  const location = useLocation();
  const initialOrder = location.state?.order || orders[0] || null;
  const [orderId, setOrderId] = useState(initialOrder?.id || "");
  const [contact, setContact] = useState(currentUser?.email || currentUser?.phone || "");
  const [selectedOrder, setSelectedOrder] = useState(initialOrder);
  const [message, setMessage] = useState("");

  const findOrder = () => {
    const match = orders.find(
      (order) =>
        order.id.toLowerCase() === orderId.trim().toLowerCase() &&
        (!contact.trim() ||
          order.customer?.email === contact.trim() ||
          order.customer?.phoneNumber === contact.trim())
    );

    setSelectedOrder(match || null);
  };

  const downloadInvoice = async () => {
    if (!selectedOrder) return;

    try {
      setMessage("");
      await downloadOrderInvoice(selectedOrder.id, {
        email: selectedOrder.customer?.email || currentUser?.email,
        phone: selectedOrder.customer?.phoneNumber || currentUser?.phone,
      });
    } catch (error) {
      setMessage(error.message || "Unable to download invoice");
    }
  };

  const steps = [
    { label: "Order Placed", done: Boolean(selectedOrder) },
    { label: "Processing", done: ["Processing", "Dispatched", "In Transit", "Delivered"].includes(selectedOrder?.status) },
    { label: "Dispatched", done: ["Dispatched", "In Transit", "Delivered"].includes(selectedOrder?.status) },
    { label: "In Transit", done: ["In Transit", "Delivered"].includes(selectedOrder?.status) },
    { label: "Delivered", done: selectedOrder?.status === "Delivered" },
  ];

  return (
    <>
      <Navbar />
      <div className="mx-auto min-h-screen max-w-6xl space-y-5 p-3 md:p-5">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">Track Your Order</h1>
          <p className="text-sm text-gray-500">
            Enter your order details to see the latest status.
          </p>
          <div className="mt-3 flex flex-col gap-2 rounded-xl bg-gray-100 p-3 md:flex-row md:items-end">
            <div className="w-full">
              <p className="mb-1 text-xs text-gray-600">Order ID</p>
              <div className="flex items-center rounded-lg border bg-white px-3 py-2">
                <img src={searchIcon} className="mr-2 w-4" />
                <input
                  value={orderId}
                  onChange={(event) => setOrderId(event.target.value)}
                  className="w-full text-sm outline-none"
                />
              </div>
            </div>
            <div className="w-full">
              <p className="mb-1 text-xs text-gray-600">Phone Number / Email</p>
              <input
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={findOrder}
              className="rounded-lg bg-[#C2863F] px-5 py-2 text-sm text-white"
            >
              Track Status
            </button>
          </div>
        </div>

        {!selectedOrder ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-gray-500">
            No matching order found. Place an order first or search with a valid order ID.
          </div>
        ) : (
          <>
            {message && (
              <div className="rounded-lg border border-[#C2863F] bg-[#FFF4CC] px-4 py-3 text-sm text-[#7a4d18]">
                {message}
              </div>
            )}
            <div className="overflow-hidden rounded-2xl border shadow-sm">
              <div
                className="flex items-center justify-between p-4"
                style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FFF49C 100%)" }}
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-white p-2">
                    <img src={deliveryIcon} className="w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold">
                      {selectedOrder.status === "Delivered" ? "Delivered" : "On the way"}
                    </h2>
                    <p className="text-xs text-gray-600">
                      Latest status for Order {selectedOrder.id}
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-[#C2863F] px-3 py-1 text-xs text-white">
                  {selectedOrder.status}
                </span>
              </div>
              <div className="bg-[#FFF8C7] px-3 py-5">
                <div className="relative flex justify-between">
                  <div className="absolute left-0 right-0 top-4 h-[2px] bg-gray-300" />
                  {steps.map((step) => (
                    <div key={step.label} className="z-10 flex w-full flex-col items-center">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full ${
                          step.done ? "bg-[#404C31]" : step.active ? "border-2 border-black bg-white" : "bg-gray-300"
                        }`}
                      >
                        {step.done ? (
                          <img src={checkIcon} className="w-4 invert" />
                        ) : (
                          <img src={deliveryIcon} className="w-4 opacity-70" />
                        )}
                      </div>
                      <p className="mt-2 text-center text-[10px] md:text-xs">{step.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border bg-white p-4">
                <h3 className="mb-3 font-semibold">Shipment Details</h3>
                <div className="mb-3 rounded-lg bg-gray-100 p-3 text-sm">
                  <div className="flex gap-2">
                    <img src={locationIcon} className="mt-1 h-3 w-3" />
                    <div>
                      {selectedOrder.customer?.firstName} {selectedOrder.customer?.lastName}
                      <br />
                      {selectedOrder.customer?.streetAddress || "Address pending"}
                      <br />
                      {selectedOrder.customer?.city || ""} {selectedOrder.customer?.state || ""}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-600">Placed on {formatDate(selectedOrder.createdAt)}</p>
                {selectedOrder.logisticsProvider && <p className="mt-2 text-sm text-gray-600">Provider: {selectedOrder.logisticsProvider}</p>}
                {selectedOrder.trackingUrl && <a href={selectedOrder.trackingUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded bg-[#404C31] px-3 py-2 text-xs text-white">Open provider tracking</a>}
              </div>

              <div className="rounded-xl border bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-semibold">Order Summary</h3>
                  <button onClick={downloadInvoice} className="text-xs font-medium text-[#C2863F] hover:underline">
                    Download PDF Invoice
                  </button>
                </div>
                {selectedOrder.items.map((item) => (
                  <div key={item.id} className="mb-3 flex justify-between">
                    <div className="flex gap-2 text-xs">
                      <div className="flex h-10 w-10 items-center justify-center rounded bg-gray-50">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} className="h-full w-full rounded object-contain" />
                        ) : (
                          <span className="text-[10px] text-gray-400">No image</span>
                        )}
                      </div>
                      <div>
                        {item.name}
                        <br />
                        <span className="text-gray-500">Qty: {item.quantity}</span>
                      </div>
                    </div>
                    <span className="text-sm">{formatCurrency(item.price * item.quantity)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-3 font-semibold">
                  <p>Total Paid</p>
                  <p>{formatCurrency(selectedOrder.total)}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <Footer />
    </>
  );
}

export default ConnectedTrackOrder;
