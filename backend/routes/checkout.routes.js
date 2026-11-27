import express from "express";
import {
  createCheckoutQuote,
  createRazorpayOrder,
  getPaymentStatus,
  previewPaymentEligibility,
  verifyRazorpayPayment,
} from "../controllers/checkout.controller.js";

const router = express.Router();

router.post("/quote", createCheckoutQuote);
router.post("/payment-preview", previewPaymentEligibility);
router.post("/payments/razorpay/order", createRazorpayOrder);
router.post("/payments/razorpay/verify", verifyRazorpayPayment);
router.get("/payments/:orderNumber/status", getPaymentStatus);

export default router;
