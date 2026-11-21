import React from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import { useAppStore } from "../context/AppContext";
import { formatCurrency } from "../lib/api";

function ConnectedProfile() {
  const navigate = useNavigate();
  const { currentUser, cartCount, orders, cartGrandTotal, logout } = useAppStore();

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-[#F4F4F4] px-4 py-6 md:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-wide text-[#C2863F]">Account</p>
                <h1 className="text-2xl font-semibold">
                  {currentUser?.name || currentUser?.email || "Guest User"}
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  {currentUser?.email || currentUser?.phone || "Signed in with OTP"}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => navigate("/orders")}
                  className="rounded-lg border border-[#C2863F] px-4 py-2 text-[#C2863F]"
                >
                  View Orders
                </button>
                <button
                  onClick={() => {
                    logout();
                    navigate("/login");
                  }}
                  className="rounded-lg bg-[#C2863F] px-4 py-2 text-white"
                >
                  Log Out
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <ProfileCard
              title="Orders"
              value={String(orders.length).padStart(2, "0")}
              subtitle="Track your recent purchases"
              action="Go to Orders"
              onClick={() => navigate("/orders")}
            />
            <ProfileCard
              title="Cart Items"
              value={String(cartCount).padStart(2, "0")}
              subtitle={`Current checkout value ${formatCurrency(cartGrandTotal)}`}
              action="Open Cart"
              onClick={() => navigate("/cart")}
            />
            <ProfileCard
              title="Wishlist"
              value="--"
              subtitle="Browse saved suggestions and move them to cart"
              action="Open Wishlist"
              onClick={() => navigate("/wishlist")}
            />
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Quick Actions</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => navigate("/writing-essentials")}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Browse Catalog
              </button>
              <button
                onClick={() => navigate("/checkout")}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Continue Checkout
              </button>
              <button
                onClick={() => navigate("/track-order")}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Track Latest Order
              </button>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}

function ProfileCard({ title, value, subtitle, action, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-md"
    >
      <p className="text-xs uppercase tracking-wide text-gray-400">{title}</p>
      <p className="mt-2 text-3xl font-bold text-[#C2863F]">{value}</p>
      <p className="mt-2 text-sm text-gray-500">{subtitle}</p>
      <p className="mt-4 text-sm font-medium text-black">{action}</p>
    </button>
  );
}

export default ConnectedProfile;
