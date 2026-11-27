import express from "express";

import {
  addWishlistItem,
  clearCart,
  createAddress,
  deleteAddress,
  deleteCartItem,
  getAddresses,
  getCart,
  getCustomerState,
  getWishlist,
  logoutSession,
  refreshSession,
  removeWishlistItem,
  setDefaultAddress,
  updateAddress,
  upsertCartItem,
} from "../controllers/customer.controller.js";
import { requireCustomer } from "../middleware/customer-auth.middleware.js";
import {
  downloadOrderInvoice,
  getCustomerOrders,
  createOrder,
} from "../controllers/order.controller.js";
import {
  createReturnRequest,
  getCustomerReturns,
} from "../controllers/expansion.controller.js";
import { createProductReview } from "../controllers/review.controller.js";
import {
  createCheckoutQuote,
  createRazorpayOrder,
  getPaymentStatus,
  previewPaymentEligibility,
  verifyRazorpayPayment,
} from "../controllers/checkout.controller.js";
import {
  handleMediaUploadError,
  uploadMiddleware,
  uploadPublicMedia,
} from "../controllers/media.controller.js";
import { submitCorporateEnquiry } from "../controllers/corporate.controller.js";
import {
  createCustomerPayoutMethod,
  createCustomerWithdrawal,
  deleteCustomerPayoutMethod,
  getCustomerPayoutMethods,
  getCustomerReferralLedger,
  getCustomerReferralSummary,
  getCustomerWithdrawals,
} from "../controllers/referral-affiliate.controller.js";

const router = express.Router();

router.post("/session/refresh", refreshSession);
router.use(requireCustomer);
router.post("/session/logout", logoutSession);
router.get("/state", getCustomerState);
router.get("/cart", getCart);
router.put("/cart/items/:cartKey", upsertCartItem);
router.delete("/cart/items/:cartKey", deleteCartItem);
router.delete("/cart", clearCart);
router.get("/wishlist", getWishlist);
router.put("/wishlist/:productId", addWishlistItem);
router.delete("/wishlist/:productId", removeWishlistItem);
router.get("/addresses", getAddresses);
router.post("/addresses", createAddress);
router.put("/addresses/:id", updateAddress);
router.delete("/addresses/:id", deleteAddress);
router.put("/addresses/:id/default", setDefaultAddress);
router.get("/referrals/summary", getCustomerReferralSummary);
router.get("/referrals/ledger", getCustomerReferralLedger);
router.get("/wallet/payout-methods", getCustomerPayoutMethods);
router.post("/wallet/payout-methods", createCustomerPayoutMethod);
router.put("/wallet/payout-methods", createCustomerPayoutMethod);
router.delete("/wallet/payout-methods/:id", deleteCustomerPayoutMethod);
router.get("/wallet/withdrawals", getCustomerWithdrawals);
router.post("/wallet/withdrawals", createCustomerWithdrawal);
router.post(
  "/media/profile",
  uploadMiddleware.single("file"),
  (req, res) => {
    req.body = { ...(req.body || {}), folder: "customer-profiles" };
    return uploadPublicMedia(req, res);
  }
);
router.post("/corporate-enquiries", (req, res) => {
  req.body = {
    ...(req.body || {}),
    contactName: req.body?.contactName || req.customer.name || "",
    email: req.body?.email || req.customer.email || "",
    phone: req.body?.phone || req.customer.phone || "",
  };
  return submitCorporateEnquiry(req, res);
});
function attachCustomerToCheckout(req) {
  req.body = {
    ...(req.body || {}),
    userId: req.customer.id,
    customer: {
      ...(req.body?.customer || {}),
      userId: req.customer.id,
      email: req.customer.email || req.body?.customer?.email || "",
      phone: req.customer.phone || req.body?.customer?.phone || "",
      phoneNumber: req.customer.phone || req.body?.customer?.phoneNumber || "",
    },
  };
}

router.post("/orders", (req, res) => {
  attachCustomerToCheckout(req);
  return createOrder(req, res);
});
router.get("/orders", (req, res) => {
  req.query.email = req.customer.email || "";
  req.query.phone = req.customer.phone || "";
  return getCustomerOrders(req, res);
});
router.get("/orders/:orderNumber/invoice", (req, res) => {
  req.query.email = req.customer.email || "";
  req.query.phone = req.customer.phone || "";
  return downloadOrderInvoice(req, res);
});
router.get("/returns", (req, res) => {
  req.query.email = req.customer.email || "";
  req.query.phone = req.customer.phone || "";
  return getCustomerReturns(req, res);
});
router.post("/returns", (req, res) => {
  req.body = {
    ...(req.body || {}),
    userId: req.customer.id,
    email: req.customer.email || "",
    phone: req.customer.phone || "",
  };
  return createReturnRequest(req, res);
});
router.post("/products/:id/reviews", (req, res) => {
  req.body = {
    ...(req.body || {}),
    email: req.customer.email || "",
    phone: req.customer.phone || "",
  };
  return createProductReview(req, res);
});
router.post("/checkout/payment-preview", (req, res) => {
  attachCustomerToCheckout(req);
  return previewPaymentEligibility(req, res);
});
router.post("/checkout/quote", (req, res) => {
  attachCustomerToCheckout(req);
  return createCheckoutQuote(req, res);
});
router.post("/checkout/payments/razorpay/order", (req, res) => {
  attachCustomerToCheckout(req);
  return createRazorpayOrder(req, res);
});
router.post("/checkout/payments/razorpay/verify", verifyRazorpayPayment);
router.get("/checkout/payments/:orderNumber/status", (req, res) => {
  req.query.email = req.customer.email || "";
  req.query.phone = req.customer.phone || "";
  return getPaymentStatus(req, res);
});
router.use(handleMediaUploadError);

export default router;
