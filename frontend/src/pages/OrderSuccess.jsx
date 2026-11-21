import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import verifyIcon from "../assets/verify.png";
import { formatCurrency } from "../lib/api";
import { useAppStore } from "../context/AppContext";

function OrderSuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const { orders } = useAppStore();
  const order = location.state?.order || orders[0] || null;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#FBF8F2] px-4 py-12 md:px-8">
        <section className="mx-auto max-w-3xl rounded-3xl bg-white p-6 text-center shadow-sm md:p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
            <img src={verifyIcon} alt="" className="h-8 w-8" />
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-[#C2863F]">
            Order Confirmed
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[#242414]">
            Thank you for shopping with Golden Creation
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-gray-600">
            Your order has been placed successfully. Your checkout address is available for faster future checkouts.
          </p>

          {order && (
            <div className="mx-auto mt-7 max-w-xl rounded-2xl border border-[#E8DDBF] bg-[#FBF8F2] p-4 text-left">
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <Info label="Order ID" value={order.id || order.orderNumber || "-"} />
                <Info label="Status" value={order.status || "Processing"} />
                <Info label="Total" value={formatCurrency(order.total ?? order.totalAmount ?? 0)} />
                <Info label="COD Due" value={formatCurrency(order.codDue || 0)} />
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => navigate("/orders", { state: { highlightOrderId: order?.id } })}
              className="rounded-full bg-[#C2863F] px-6 py-3 text-sm font-semibold text-white"
            >
              View Order
            </button>
            <button
              type="button"
              onClick={() => navigate("/all-products")}
              className="rounded-full border border-[#C2863F] px-6 py-3 text-sm font-semibold text-[#8A541E]"
            >
              Continue Shopping
            </button>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 font-semibold text-gray-900">{value}</p>
    </div>
  );
}

export default OrderSuccess;
