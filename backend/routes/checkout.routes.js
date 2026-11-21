import express from "express";
import {
  createCheckoutQuote,
  createRazorpayOrder,
  getPaymentStatus,
  verifyRazorpayPayment,
} from "../controllers/checkout.controller.js";

const router = express.Router();

router.post("/quote", createCheckoutQuote);
router.post("/payments/razorpay/order", createRazorpayOrder);
router.post("/payments/razorpay/verify", verifyRazorpayPayment);
router.get("/payments/:orderNumber/status", getPaymentStatus);

export default router;
