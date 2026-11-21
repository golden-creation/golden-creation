import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import addIcon from "../assets/add.png";
import minusIcon from "../assets/minus.png";
import deleteIcon from "../assets/bin.png";
import arrow from "../assets/right-arrow.png";
import verify from "../assets/verify.png";
import undo from "../assets/undo.png";
import { useAppStore } from "../context/AppContext";
import { formatCurrency } from "../lib/api";

function ConnectedCart() {
  const navigate = useNavigate();
  const {
    cartItems,
    cartSubtotal,
    discountState,
    discountAmount,
    discountedSubtotal,
    cartGrandTotal,
    applyDiscountCode,
    removeDiscount,
    updateCartQuantity,
    removeFromCart,
  } = useAppStore();
  const [couponCode, setCouponCode] = useState(discountState.code || "");
  const [couponMessage, setCouponMessage] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const outOfStockItems = cartItems.filter((item) => {
    if (item.isBundle) return false;
    if (item.stock === undefined || item.stock === null || item.stock === "") return false;
    return Number(item.stock || 0) <= 0 || Number(item.stock || 0) < Number(item.quantity || 1);
  });
  const stockWarning = outOfStockItems.length
    ? `${outOfStockItems[0].name} has only ${Math.max(0, Number(outOfStockItems[0].stock || 0))} unit(s) available`
    : "";

  const handleApplyCoupon = async () => {
    setCouponLoading(true);
    setCouponMessage("");

    try {
      const result = await applyDiscountCode(couponCode);
      setCouponMessage(result.message || "Discount applied");
    } catch (error) {
      setCouponMessage(error.message || "Coupon could not be applied");
    } finally {
      setCouponLoading(false);
    }
  };

  if (!cartItems.length) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-[#f7f7f7] px-4 py-12 md:px-12">
          <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold">Your cart is empty</h2>
            <p className="mt-3 text-sm text-gray-500">
              Add a few products to continue to checkout.
            </p>
            <button
              onClick={() => navigate("/writing-essentials")}
              className="mobile-touch-target mt-6 rounded-lg bg-[#C2863F] px-6 py-3 text-white"
            >
              Browse Products
            </button>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="w-full bg-[#f7f7f7] px-4 py-6 md:px-12">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-semibold">Shopping Cart</h2>
            <p className="mb-5 text-sm text-gray-500">
              You have {cartItems.length} item{cartItems.length === 1 ? "" : "s"} in your cart
            </p>

            <div className="hidden justify-between text-xs text-gray-400 sm:flex">
              <span>PRODUCT DETAILS</span>
              <span>TOTAL</span>
            </div>
            <div className="mb-4 border-b" />

            {cartItems.map((item) => (
              <div key={item.cartKey || item.id} className="border-b py-5">
                <p className="mb-1 text-[11px] tracking-wide text-gray-400">
                  {item.categoryName || "STATIONERY"}
                </p>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-3 sm:gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-white sm:h-16 sm:w-16">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} className="h-full w-full rounded-lg object-contain" />
                      ) : (
                        <span className="text-xs text-gray-400">No image</span>
                      )}
                    </div>
                    <div>
                      <h3 className="max-w-[250px] text-sm font-semibold leading-snug">
                        {item.name}
                      </h3>
                      {item.variantTitle && (
                        <p className="mt-1 text-xs text-gray-500">{item.variantTitle}</p>
                      )}
                      {item.variantSku && (
                        <p className="mt-0.5 text-[11px] uppercase tracking-wide text-gray-400">
                          SKU: {item.variantSku}
                        </p>
                      )}
                      {item.isBundle && item.bundleItems?.length > 0 && (
                        <p className="mt-1 text-xs text-gray-500">
                          {item.bundleItems.length} products inside this bundle
                        </p>
                      )}
                      {!item.isBundle && item.stock !== undefined && item.stock !== null && item.stock !== "" && Number(item.stock || 0) <= 0 && (
                        <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                          Out of stock
                        </p>
                      )}
                      {!item.isBundle && item.stock !== undefined && item.stock !== null && item.stock !== "" && Number(item.stock || 0) > 0 && Number(item.stock || 0) < Number(item.quantity || 1) && (
                        <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                          Only {Number(item.stock || 0)} available
                        </p>
                      )}
                      <div className="mt-3 flex items-center gap-4">
                        <div className="flex items-center gap-2 rounded-md border px-2 py-1">
                          <button
                            onClick={() => updateCartQuantity(item.cartKey || item.id, item.quantity - 1)}
                            className="flex h-8 w-8 items-center justify-center"
                          >
                            <img src={minusIcon} className="w-3" />
                          </button>
                          <span className="text-sm">{item.quantity}</span>
                          <button
                            onClick={() => updateCartQuantity(item.cartKey || item.id, item.quantity + 1)}
                            className="flex h-8 w-8 items-center justify-center"
                          >
                            <img src={addIcon} className="w-3" />
                          </button>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.cartKey || item.id)}
                          className="mobile-touch-target flex items-center gap-1 text-sm text-gray-500 transition hover:text-[#C2863F]"
                        >
                          <img src={deleteIcon} className="w-4" />
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-sm font-semibold text-black">
                      {formatCurrency(item.price * item.quantity)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="h-fit rounded-xl border bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold">Order Summary</h3>
            <div className="mb-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="text-[#C2863F]">{formatCurrency(cartSubtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>
                    Discount{discountState.appliedDiscount?.code ? ` (${discountState.appliedDiscount.code})` : ""}
                  </span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Tax</span>
                <span className="text-gray-500">Calculated at checkout</span>
              </div>
              <div className="flex justify-between">
                <span>Shipping</span>
                <span className="text-gray-500">Calculated at checkout</span>
              </div>
              <div className="flex justify-between border-t pt-3 text-base font-semibold">
                <span>Estimated subtotal</span>
                <span className="text-[#C2863F]">{formatCurrency(cartGrandTotal)}</span>
              </div>
            </div>

            <div className="mb-4 rounded-lg border border-gray-200 bg-[#FBF8F2] p-3">
              <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Coupon code
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  value={couponCode}
                  onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                  placeholder="WELCOME10"
                  className="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#C2863F]"
                />
                {discountAmount > 0 && discountState.code ? (
                  <button
                    type="button"
                    onClick={() => {
                      removeDiscount();
                      setCouponMessage("Coupon removed");
                    }}
                    className="rounded-md border px-3 py-2 text-sm"
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={couponLoading}
                    onClick={handleApplyCoupon}
                    className="rounded-md bg-[#C2863F] px-3 py-2 text-sm text-white disabled:opacity-60"
                  >
                    {couponLoading ? "Checking" : "Apply"}
                  </button>
                )}
              </div>
              {(couponMessage || discountState.message) && (
                <p className="mt-2 text-xs text-gray-600">
                  {couponMessage || discountState.message}
                </p>
              )}
              {discountAmount > 0 && (
                <p className="mt-1 text-xs text-green-700">
                  Savings applied on taxable subtotal: {formatCurrency(discountedSubtotal)}
                </p>
              )}
            </div>

            {stockWarning && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {stockWarning}. Please remove it or reduce the quantity before checkout.
              </div>
            )}

            <button
              onClick={() => navigate("/checkout")}
              disabled={outOfStockItems.length > 0}
              className="mobile-touch-target flex w-full items-center justify-center gap-2 rounded-lg bg-[#C2863F] py-3 text-sm font-medium text-white hover:bg-[#a96d2f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Proceed to Checkout
              <img src={arrow} className="w-4" />
            </button>

            <div className="mt-6 flex justify-around text-xs text-gray-500">
              <div className="text-center">
                <img src={verify} className="mx-auto mb-1 w-5" />
                Secure Payment
              </div>
              <div className="text-center">
                <img src={undo} className="mx-auto mb-1 w-5" />
                30-day Returns
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}

export default ConnectedCart;
