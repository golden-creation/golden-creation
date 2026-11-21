import express from "express";
import {
  completeGoogleLogin,
  googleCallback,
  sendOtp,
  startGoogleLogin,
  verifyOtp,
  sendOtpMobile,
  verifyOtpMobile,
  nativeGoogleLogin,
  getAuthenticatedProfile,
  updateAuthenticatedProfile,
  removeAuthenticatedProfileImage,
} from "../controllers/auth.fallback.controller.js";
import { requireRecaptcha } from "../middleware/recaptcha.middleware.js";
import { requireCustomer } from "../middleware/customer-auth.middleware.js";

const router = express.Router();

// =======================
// ✅ EMAIL OTP ROUTES
// =======================
router.post(
  "/send-otp",
  requireRecaptcha("otp_request", { minScore: 0.6, allowMobileApp: true }),
  sendOtp
);
router.post("/verify-otp", verifyOtp);

// =======================
// ✅ MOBILE OTP ROUTES
// =======================
router.post(
  "/send-otp-mobile",
  requireRecaptcha("otp_request", { minScore: 0.6, allowMobileApp: true }),
  sendOtpMobile
);
router.post("/verify-otp-mobile", verifyOtpMobile);
router.get("/google", startGoogleLogin);
router.get("/google/callback", googleCallback);
router.post("/google/session", completeGoogleLogin);
router.post("/google/mobile", nativeGoogleLogin);
router.get("/me", requireCustomer, getAuthenticatedProfile);
router.put("/me", requireCustomer, updateAuthenticatedProfile);
router.delete("/me/image", requireCustomer, removeAuthenticatedProfileImage);

export default router;
