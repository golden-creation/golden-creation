import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PriceOffer from "../components/PriceOffer";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import locationIcon from "../assets/location.png";
import deliveryIcon from "../assets/express-delivery.png";
import walletIcon from "../assets/wallet.png";
import verifyIcon from "../assets/verify.png";
import infoIcon from "../assets/information.png";
import { useAppStore } from "../context/AppContext";
import {
  createRazorpayCheckoutOrder,
  formatCurrency,
  getCheckoutQuote,
  analyticsItem,
  pushDataLayer,
  verifyRazorpayCheckoutPayment,
} from "../lib/api";
import { presentCheckoutAmounts, acceptLatestQuote } from "../lib/checkoutTotals";
import { SkeletonBlock } from "../components/Skeleton";

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

function ConnectedCheckout() {
  const navigate = useNavigate();
  const {
    currentUser,
    cartItems,
    discountState,
    discountAmount,
    applyDiscountCode,
    removeDiscount,
    addresses,
    addAddress,
    placeOrder,
    acceptCompletedOrder,
  } = useAppStore();
  const [step, setStep] = useState("address");
  const [form, setForm] = useState({
    firstName: currentUser?.name || "",
    lastName: "",
    email: currentUser?.email || "",
    streetAddress: "",
    city: "",
    state: "",
    zipCode: "",
    phoneNumber: currentUser?.phone || "",
    paymentMethod: "Full COD",
    deliveryMethod: "Standard",
  });
  const [validationMessage, setValidationMessage] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const quoteRequest = useRef(0);
  const placingLock = useRef(false);
  const checkoutAttempt = useRef({ hash: "", key: "" });
  const [couponCode, setCouponCode] = useState(discountState.code || "");
  const [couponMessage, setCouponMessage] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);

  const subtotal = useMemo(
    () =>
      cartItems.reduce(
        (total, item) => total + (Number(item.price) || 0) * (Number(item.quantity) || 0),
        0
      ),
    [cartItems]
  );

  const outOfStockItems = useMemo(
    () =>
      cartItems.filter((item) => {
        if (item.isBundle) return false;
        if (item.stock === undefined || item.stock === null || item.stock === "") return false;
        return Number(item.stock || 0) <= 0 || Number(item.stock || 0) < Number(item.quantity || 1);
      }),
    [cartItems]
  );

  const quoteCustomer = useMemo(
    () => ({
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      streetAddress: form.streetAddress,
      city: form.city,
      state: form.state,
      zipCode: form.zipCode,
      phoneNumber: form.phoneNumber,
      paymentMethod: form.paymentMethod,
      deliveryMethod: form.deliveryMethod,
    }),
    [
      form.city,
      form.deliveryMethod,
      form.email,
      form.firstName,
      form.lastName,
      form.paymentMethod,
      form.phoneNumber,
      form.state,
      form.streetAddress,
      form.zipCode,
    ]
  );

  useEffect(() => {
    if (!cartItems.length) return;
    pushDataLayer("begin_checkout", {
      ecommerce: {
        currency: "INR",
        value: Number(quote?.totalAmount ?? subtotal) || 0,
        coupon: discountState.code || undefined,
        items: cartItems.map((item) => analyticsItem(item, item.quantity)),
      },
    });
  }, [cartItems, discountState.code, quote?.totalAmount, subtotal]);

  const stockWarning = outOfStockItems.length
    ? `${outOfStockItems[0].name} has only ${Math.max(0, Number(outOfStockItems[0].stock || 0))} unit(s) available`
    : "";
  const savedAddresses = Array.isArray(addresses) ? addresses : [];

  const applySavedAddress = (address) => {
    if (!address) return;
    setForm((previous) => ({
      ...previous,
      firstName: previous.firstName || address.name || currentUser?.name || "",
      streetAddress: address.line1 || address.address || "",
      city: address.city || "",
      state: address.state || "",
      zipCode: address.postalCode || address.zipCode || "",
      phoneNumber: address.phone || previous.phoneNumber || currentUser?.phone || "",
    }));
    setValidationMessage("");
  };

  const checkoutAddressAlreadySaved = () => {
    const line1 = String(form.streetAddress || "").trim().toLowerCase();
    const city = String(form.city || "").trim().toLowerCase();
    const state = String(form.state || "").trim().toLowerCase();
    const pinCode = String(form.zipCode || "").trim().toLowerCase();
    const phone = String(form.phoneNumber || "").replace(/\D/g, "");

    return savedAddresses.some((address) => {
      const addressLine = String(address.line1 || address.address || "").trim().toLowerCase();
      const addressCity = String(address.city || "").trim().toLowerCase();
      const addressState = String(address.state || "").trim().toLowerCase();
      const addressPin = String(address.postalCode || address.zipCode || "").trim().toLowerCase();
      const addressPhone = String(address.phone || "").replace(/\D/g, "");
      return (
        addressLine === line1 &&
        addressCity === city &&
        addressState === state &&
        addressPin === pinCode &&
        (!phone || !addressPhone || addressPhone === phone)
      );
    });
  };

  const saveCheckoutAddress = () => {
    if (checkoutAddressAlreadySaved()) return;
    addAddress({
      type: "HOME",
      name: `${form.firstName} ${form.lastName}`.trim() || currentUser?.name || "Saved Address",
      line1: form.streetAddress,
      city: form.city,
      state: form.state,
      postalCode: form.zipCode,
      phone: form.phoneNumber,
      isPrimary: savedAddresses.length === 0,
    });
  };

  useEffect(() => {
    if (!cartItems.length) return undefined;
    if (outOfStockItems.length) {
      setQuote(null);
      setQuoteLoading(false);
      setValidationMessage(stockWarning);
      return undefined;
    }

    let cancelled = false;
    const requestId = quoteRequest.current + 1;
    quoteRequest.current = requestId;
    setQuote(null);
    const timer = window.setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const nextQuote = await getCheckoutQuote({
          items: cartItems,
          customer: quoteCustomer,
          paymentMethod: quoteCustomer.paymentMethod,
          deliveryMethod: quoteCustomer.deliveryMethod,
          discountCode: discountState.appliedDiscount?.code || "",
        });
        if (!cancelled) {
          setQuote(acceptLatestQuote(requestId, quoteRequest.current, nextQuote));
          setValidationMessage("");
        }
      } catch (error) {
        if (!cancelled) {
          setQuote(null);
          setValidationMessage(error.message || "Unable to calculate delivery");
        }
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    cartItems,
    quoteCustomer,
    discountState.appliedDiscount?.code,
    outOfStockItems.length,
    stockWarning,
  ]);

  useEffect(() => {
    if (!quote?.paymentOptions) return;
    const enabledMethods = [
      quote.paymentOptions.fullCod?.enabled && "Full COD",
      quote.paymentOptions.partialCod?.enabled && "Partial COD",
      quote.paymentOptions.fullOnline?.enabled && "Full Online",
    ].filter(Boolean);
    if (enabledMethods.length && !enabledMethods.includes(form.paymentMethod)) {
      setForm((previous) => ({ ...previous, paymentMethod: enabledMethods[0] }));
    }
  }, [quote?.paymentOptions, form.paymentMethod]);

  const amounts = presentCheckoutAmounts(quote, { loading: quoteLoading, error: validationMessage });
  const checkoutSubtotal = amounts.ready ? amounts.subtotal : subtotal;
  const checkoutDiscount = amounts.ready ? amounts.discountAmount : Number(discountAmount || 0);
  const enabledPaymentMethods = quote?.paymentOptions
    ? [
        quote.paymentOptions.fullCod?.enabled && "Full COD",
        quote.paymentOptions.partialCod?.enabled && "Partial COD",
        quote.paymentOptions.fullOnline?.enabled && "Full Online",
      ].filter(Boolean)
    : [];
  const hasPaymentOptions = enabledPaymentMethods.length > 0;

  const updateField = (key, value) => {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
    setValidationMessage("");
  };

  const validateForm = () => {
    const requiredFields = [
      ["firstName", "first name"],
      ["email", "email address"],
      ["streetAddress", "street address"],
      ["city", "city"],
      ["state", "state"],
      ["zipCode", "pin code"],
      ["phoneNumber", "phone number"],
    ];

    const missingField = requiredFields.find(
      ([key]) => !String(form[key] || "").trim()
    );

    if (missingField) {
      return `Enter your ${missingField[1]} to continue.`;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return "Enter a valid email address.";
    }

    if (form.phoneNumber.replace(/\D/g, "").length < 10) {
      return "Enter a valid phone number.";
    }

    if (form.zipCode.replace(/\D/g, "").length < 5) {
      return "Enter a valid pin code.";
    }

    return "";
  };

  const handlePlaceOrder = async () => {
    if (placingLock.current) return;
    if (!cartItems.length) {
      navigate("/cart");
      return;
    }

    if (outOfStockItems.length) {
      setValidationMessage(stockWarning);
      setStep("address");
      return;
    }

    const nextValidationMessage = validateForm();

    if (nextValidationMessage) {
      setValidationMessage(nextValidationMessage);
      setStep("address");
      return;
    }

    placingLock.current = true;
    setPlacingOrder(true);

    try {
      if (!quote) throw new Error("Checkout totals are not ready");
      const attemptPayload = {
        items: cartItems.map((item) => ({
          productId: item.productId || item.id,
          variantId: item.variantId || 0,
          bundleId: item.bundleId || 0,
          quantity: item.quantity,
        })),
        paymentMethod: form.paymentMethod,
        deliveryMethod: form.deliveryMethod,
        phone: form.phoneNumber,
        zip: form.zipCode,
        discount: discountState.appliedDiscount?.code || "",
      };
      const attemptHash = JSON.stringify(attemptPayload);
      if (checkoutAttempt.current.hash !== attemptHash) {
        checkoutAttempt.current = { hash: attemptHash, key: crypto.randomUUID() };
      }
      const idempotencyKey = checkoutAttempt.current.key;
      pushDataLayer("add_shipping_info", {
        ecommerce: {
          currency: "INR",
          value: Number(quote.totalAmount ?? subtotal) || 0,
          shipping_tier: quote.shippingRule?.name || "Standard",
          coupon: discountState.code || undefined,
          items: cartItems.map((item) => analyticsItem(item, item.quantity)),
        },
      });
      pushDataLayer("add_payment_info", {
        ecommerce: {
          currency: "INR",
          value: Number(quote.totalAmount ?? subtotal) || 0,
          payment_type: form.paymentMethod,
          coupon: discountState.code || undefined,
          items: cartItems.map((item) => analyticsItem(item, item.quantity)),
        },
      });
      let order;
      if (form.paymentMethod === "Full COD") {
        order = await placeOrder({ ...form, paymentMethod: "Full COD", idempotencyKey });
      } else {
        const razorpayOrder = await createRazorpayCheckoutOrder({
          userId: currentUser?.id,
          customer: form,
          deliveryMethod: form.deliveryMethod,
          items: cartItems,
          discountCode: discountState.appliedDiscount?.code || "",
          paymentMode: form.paymentMethod,
          idempotencyKey,
        });
        const loaded = await loadRazorpayCheckout();
        if (!loaded) throw new Error("Unable to load secure payment checkout");
        order = await new Promise((resolve, reject) => {
          const gateway = new window.Razorpay({
            key: razorpayOrder.keyId,
            amount: razorpayOrder.amountPaise,
            currency: razorpayOrder.currency,
            name: "Golden Creation",
            description: form.paymentMethod,
            order_id: razorpayOrder.razorpayOrderId,
            prefill: {
              name: `${form.firstName} ${form.lastName}`.trim(),
              email: form.email,
              contact: form.phoneNumber,
            },
            handler: async (response) => {
              try {
                resolve(await verifyRazorpayCheckoutPayment(response));
              } catch (error) {
                reject(error);
              }
            },
            modal: {
              ondismiss: () => reject(new Error("Payment was cancelled")),
            },
            theme: { color: "#A06422" },
          });
          gateway.on("payment.failed", (response) => {
            reject(new Error(response.error?.description || "Payment failed"));
          });
          gateway.open();
        });
        order = {
          ...order,
          createdAt: order.createdAt || new Date().toISOString(),
          customer: order.customer || form,
          items: order.items || cartItems,
          total: Number(order.total ?? order.totalAmount ?? quote.totalAmount),
          shippingFee: Number(order.shippingFee ?? quote.shippingFee),
          taxAmount: Number(order.taxAmount ?? quote.taxAmount),
          discountAmount: Number(order.discountAmount ?? quote.discountAmount),
        };
        acceptCompletedOrder(order);
      }

      if (order) {
        pushDataLayer("purchase", {
          ecommerce: {
            transaction_id: String(order.id || order.orderNumber || ""),
            value: Number(order.total ?? order.totalAmount ?? quote.totalAmount) || 0,
            tax: Number(order.taxAmount ?? quote.taxAmount) || 0,
            shipping: Number(order.shippingFee ?? quote.shippingFee) || 0,
            currency: "INR",
            coupon: discountState.code || undefined,
            items: (order.items || cartItems).map((item) => analyticsItem(item, item.quantity)),
          },
        });
        saveCheckoutAddress();
        navigate("/order-success", { state: { order } });
      }
    } catch (error) {
      setValidationMessage(
        error.message ||
          "Unable to place order. Please check that the backend is running and try again."
      );
      setStep("address");
    } finally {
      placingLock.current = false;
      setPlacingOrder(false);
    }
  };

  const handleApplyCoupon = async () => {
    setCouponLoading(true);
    setCouponMessage("");

    try {
      const result = await applyDiscountCode(couponCode, {
        paymentMethod: form.paymentMethod,
        state: form.state,
      });
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
        <div className="min-h-screen bg-[#f7f7f7] px-4 py-12 md:px-8">
          <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold">Nothing to checkout yet</h2>
            <p className="mt-3 text-sm text-gray-500">
              Add products to your cart before placing an order.
            </p>
            <button
              onClick={() => navigate("/writing-essentials")}
              className="mt-6 rounded-lg bg-[#C2863F] px-6 py-3 text-white"
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
      <div className="mobile-safe-bottom min-h-screen bg-[#f7f7f7] p-4 md:p-8">
        <h1 className="text-2xl font-semibold">Checkout</h1>
        <p className="mb-6 text-sm text-gray-400">Complete your order details below</p>

        <div className="mb-10 flex max-w-3xl items-center justify-between">
          <Step
            active={step === "address"}
            icon={locationIcon}
            label="Address"
            onClick={() => setStep("address")}
          />
          <div className="mx-2 h-[1px] flex-1 bg-gray-300" />
          <Step
            active={step === "shipping"}
            icon={deliveryIcon}
            label="Shipping"
            onClick={() => setStep("shipping")}
          />
          <div className="mx-2 h-[1px] flex-1 bg-gray-300" />
          <Step
            active={step === "payment"}
            icon={walletIcon}
            label="Payment"
            onClick={() => setStep("payment")}
          />
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-xl bg-white p-6 shadow-sm md:col-span-2">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img src={locationIcon} className="w-5" />
                <h2 className="text-lg font-semibold">Shipping Address</h2>
              </div>
              <span className="rounded-md bg-[#C2863F] px-3 py-1 text-xs text-white">
                Step 1 of 3
              </span>
            </div>
            {savedAddresses.length > 0 && (
              <div className="mb-6 rounded-xl border border-[#E8DDBF] bg-[#FBF8F2] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Use a saved address</h3>
                    <p className="text-xs text-gray-500">Pick one to fill checkout faster.</p>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {savedAddresses.slice(0, 4).map((address) => (
                    <button
                      key={address.id || `${address.name}-${address.phone}`}
                      type="button"
                      onClick={() => applySavedAddress(address)}
                      className="rounded-lg border bg-white p-3 text-left text-xs transition hover:border-[#C2863F]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-gray-900">{address.name || "Saved Address"}</span>
                        {address.isDefault && (
                          <span className="rounded-full bg-[#FFF4CC] px-2 py-0.5 text-[10px] text-[#7a4d18]">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-gray-600">
                        {address.address || [address.line1, address.city, address.state, address.postalCode].filter(Boolean).join(", ")}
                      </p>
                      {address.phone && <p className="mt-1 text-gray-500">{address.phone}</p>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="First Name" value={form.firstName} onChange={(value) => updateField("firstName", value)} />
              <Field label="Last Name" value={form.lastName} onChange={(value) => updateField("lastName", value)} />
              <Field label="Email Address" value={form.email} onChange={(value) => updateField("email", value)} className="md:col-span-2" />
              <Field label="Street Address" value={form.streetAddress} onChange={(value) => updateField("streetAddress", value)} className="md:col-span-2" />
              <Field label="City" value={form.city} onChange={(value) => updateField("city", value)} />
              <Field label="State" value={form.state} onChange={(value) => updateField("state", value)} />
              <Field label="Pin Code" value={form.zipCode} onChange={(value) => updateField("zipCode", value)} />
              <Field label="Phone Number" value={form.phoneNumber} onChange={(value) => updateField("phoneNumber", value)} />
            </div>

            {validationMessage && (
              <div className="mt-4 rounded-lg border border-[#C2863F] bg-[#FFF4CC] px-4 py-3 text-sm text-[#7a4d18]">
                {validationMessage}
                {outOfStockItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate("/cart")}
                    className="ml-3 font-semibold underline"
                  >
                    Review cart
                  </button>
                )}
              </div>
            )}

            {quote?.delivery?.porter?.available && (
              <div className="mt-6">
                <p className="text-xs text-gray-400">Delivery</p>
                <div className="mt-2 grid gap-2">
                  <label className="flex items-start gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <input type="radio" name="deliveryMethod" checked={form.deliveryMethod !== "Porter"} onChange={() => updateField("deliveryMethod", "Standard")} />
                    <span>Standard delivery</span>
                  </label>
                  <label className="flex items-start gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <input type="radio" name="deliveryMethod" checked={form.deliveryMethod === "Porter"} onChange={() => updateField("deliveryMethod", "Porter")} />
                    <span>
                      Local Delivery via Porter — At Buyer's Cost
                      <span className="mt-1 block text-xs text-gray-500">Pickup from the Golden Creation showroom, Sector 56, Gurugram. Porter's charge is paid by you to Porter and is not added to this order.</span>
                    </span>
                  </label>
                </div>
              </div>
            )}

            <div className="mt-6">
              <label className="text-xs text-gray-400">Payment Method</label>
              <select
                value={form.paymentMethod}
                onChange={(event) => updateField("paymentMethod", event.target.value)}
                className="mobile-touch-target mt-1 w-full rounded-lg border border-gray-200 bg-[#fafafa] px-3 py-2 text-sm"
              >
                {!quote?.paymentOptions && (
                  <option value={form.paymentMethod}>
                    {quoteLoading ? "Loading payment methods..." : "Payment methods will appear after cart validation"}
                  </option>
                )}
                {quote?.paymentOptions && !hasPaymentOptions && (
                  <option value={form.paymentMethod}>No payment method is currently available</option>
                )}
                {quote?.paymentOptions?.fullCod?.enabled && <option value="Full COD">Cash on Delivery</option>}
                {quote?.paymentOptions?.partialCod?.enabled && <option value="Partial COD">Partial COD ({quote.paymentOptions.partialCod.percentage}% online)</option>}
                {quote?.paymentOptions?.fullOnline?.enabled && <option value="Full Online">Full Online Payment</option>}
              </select>
              {quote?.paymentOptions?.lines?.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-gray-500">
                  {quote.paymentOptions.lines.map((line) => (
                    <li key={`${line.productId}-${line.unitPrice}`}>
                      {line.name || "Product"}: {line.band === "full-cod" ? "Full Online or 100% COD" : line.band === "partial-cod" ? `Full Online or ${quote.paymentOptions.partialCod?.percentage || 20}% online` : "Full Online only"}
                      . Online {formatCurrency(line.amountOnline)}, COD {formatCurrency(line.amountCod)}.
                    </li>
                  ))}
                </ul>
              )}
              {quote?.paymentOptions?.eligibility?.message && (
                <p className="mt-2 text-xs text-gray-500">{quote.paymentOptions.eligibility.message}</p>
              )}
              {form.paymentMethod === "Partial COD" && quote?.paymentOptions?.partialCod && <p className="mt-2 text-xs text-gray-500">Pay {formatCurrency(quote.paymentOptions.partialCod.amountOnline)} now through Razorpay and {formatCurrency(quote.paymentOptions.partialCod.amountCod)} on delivery. You can still choose Full Online for the entire amount.</p>}
              {form.paymentMethod === "Full COD" && <p className="mt-2 text-xs text-gray-500">No advance is collected. The full amount stays unpaid until it is collected on delivery.</p>}
              {form.paymentMethod === "Full Online" && <p className="mt-2 text-xs text-gray-500">Pay 100% now. RuPay, UPI, debit cards, and credit cards stay available in Razorpay.</p>}
              {form.deliveryMethod === "Porter" && <p className="mt-2 text-xs text-gray-500">{quote?.delivery?.porter?.message}</p>}
            </div>

            <button
              onClick={handlePlaceOrder}
              disabled={placingOrder || quoteLoading || !quote || !hasPaymentOptions || outOfStockItems.length > 0}
              className="mobile-touch-target mt-6 w-full rounded-md bg-[#C2863F] px-6 py-2.5 text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {placingOrder ? "Placing Order..." : "Continue to Payment"}
            </button>

            <div className="mt-10 grid grid-cols-3 text-center text-xs text-gray-600">
              <SecurityTile icon={verifyIcon} title="Secure Checkout" subtitle="SSL Encrypted" />
              <SecurityTile icon={deliveryIcon} title="Free Returns" subtitle="30-day window" />
              <SecurityTile icon={walletIcon} title="Brand Warranty" subtitle="100% Genuine" />
            </div>
          </div>

          <div className="self-start rounded-xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex justify-between">
              <h2 className="text-lg font-semibold">Order Summary</h2>
              <span className="text-sm text-gray-500">{cartItems.length} items</span>
            </div>

            {cartItems.map((item) => (
              <div key={item.cartKey || item.id} className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-md bg-gray-50">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} className="h-full w-full rounded-md object-contain" />
                    ) : (
                      <span className="text-xs text-gray-400">No image</span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm">{item.name}</p>
                    {item.variantTitle && (
                      <p className="text-xs text-gray-500">{item.variantTitle}</p>
                    )}
                    {item.isBundle && item.bundleItems?.length > 0 && (
                      <p className="text-xs text-gray-500">{item.bundleItems.length} bundle products</p>
                    )}
                    <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
                    {!item.isBundle && item.stock !== undefined && item.stock !== null && item.stock !== "" && Number(item.stock || 0) <= 0 && (
                      <p className="mt-1 text-xs font-semibold text-red-600">Out of stock</p>
                    )}
                    {!item.isBundle && item.stock !== undefined && item.stock !== null && item.stock !== "" && Number(item.stock || 0) > 0 && Number(item.stock || 0) < Number(item.quantity || 1) && (
                      <p className="mt-1 text-xs font-semibold text-red-600">
                        Only {Number(item.stock || 0)} available
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-sm text-[#C2863F]">
                  <PriceOffer price={item.price * item.quantity} comparePrice={item.comparePrice ? item.comparePrice * item.quantity : null} mrp={item.mrp ? item.mrp * item.quantity : null} percent={item.discountPercent} />
                </span>
              </div>
            ))}

            {quoteLoading && (
              <div className="mb-4 space-y-2 border-t pt-4">
                <SkeletonBlock className="h-4 w-full" />
                <SkeletonBlock className="h-4 w-5/6" />
                <SkeletonBlock className="h-4 w-4/5" />
              </div>
            )}
            <div className="space-y-2 border-t pt-4 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatCurrency(checkoutSubtotal)}</span>
              </div>
              {checkoutDiscount > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>
                    Discount{discountState.appliedDiscount?.code ? ` (${discountState.appliedDiscount.code})` : ""}
                  </span>
                  <span>-{formatCurrency(checkoutDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>{form.deliveryMethod === "Porter" ? "Porter delivery" : "Shipping"}</span>
                <span>{form.deliveryMethod === "Porter" ? "Paid by you to Porter" : amounts.shippingConfirmed ? formatCurrency(amounts.shippingAmount) : amounts.shippingLabel}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span>GST</span>
                <span>{amounts.taxLabel || (amounts.taxAmount > 0 ? formatCurrency(amounts.taxAmount) : "Included")}</span>
              </div>
              <div className="flex justify-between pt-2 font-semibold">
                <span>Total</span>
                <span>{amounts.ready ? formatCurrency(amounts.totalAmount) : amounts.totalLabel}</span>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-gray-200 bg-[#FBF8F2] p-3">
              <label htmlFor="checkout-discount-coupon" className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Discount coupon
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="checkout-discount-coupon"
                  value={couponCode}
                  onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                  placeholder="WELCOME10"
                  className="mobile-touch-target min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm"
                />
                {discountAmount > 0 && discountState.code ? (
                  <button
                    type="button"
                    onClick={() => {
                      removeDiscount();
                      setCouponMessage("Coupon removed");
                    }}
                    className="mobile-touch-target rounded-md border px-3 py-2 text-sm"
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={couponLoading}
                    onClick={handleApplyCoupon}
                    className="mobile-touch-target rounded-md bg-[#C2863F] px-3 py-2 text-sm text-white disabled:opacity-60"
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
            </div>

            <div className="mt-4 flex items-start gap-2 rounded bg-[#404C3159] p-2 text-sm">
              <img src={verifyIcon} className="mt-0.5 w-4" />
              Safe & secure payments. Your order details stay protected.
            </div>

            <button
              onClick={handlePlaceOrder}
              disabled={placingOrder || quoteLoading || !quote || !hasPaymentOptions || outOfStockItems.length > 0}
              className="mobile-touch-target mt-3 w-full rounded-md bg-[#FFF49C] py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {placingOrder ? "Placing Order..." : "Place Order"}
            </button>

            <div className="mt-4 flex items-start gap-2 text-xs">
              <img src={infoIcon} className="mt-1 w-4" />
              <div>
                <p className="font-medium text-[#C2863F]">Golden Creation Rewards</p>
                <p className="text-gray-500">You will earn points after this order is placed.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}

function Field({ label, value, onChange, className = "" }) {
  const id = `checkout-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className={className}>
      <label htmlFor={id} className="text-xs text-gray-400">{label}</label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mobile-touch-target mt-1 w-full rounded-lg border border-gray-200 bg-[#fafafa] px-3 py-2"
      />
    </div>
  );
}

function Step({ active, icon, label, onClick }) {
  return (
    <div onClick={onClick} className="flex w-24 cursor-pointer flex-col items-center">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full ${
          active ? "bg-yellow-500" : "bg-gray-200"
        }`}
      >
        <img src={icon} className={`w-4 ${active ? "" : "opacity-40"}`} />
      </div>
      <p className={`mt-2 text-sm ${active ? "font-medium" : "text-gray-400"}`}>{label}</p>
    </div>
  );
}

function SecurityTile({ icon, title, subtitle }) {
  return (
    <div>
      <img src={icon} className="mx-auto mb-2 w-5" />
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}

export default ConnectedCheckout;
