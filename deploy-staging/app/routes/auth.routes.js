import express from "express";
import {
  getProfile,
  completeGoogleLogin,
  googleCallback,
  sendOtp,
  startGoogleLogin,
  verifyOtp,
  sendOtpMobile,
  updateProfile,
  verifyOtpMobile,
} from "../controllers/auth.fallback.controller.js";
import { requireRecaptcha } from "../middleware/recaptcha.middleware.js";

const router = express.Router();

// =======================
// ✅ EMAIL OTP ROUTES
// =======================
router.post("/send-otp", requireRecaptcha("otp_request", { minScore: 0.6 }), sendOtp);
router.post("/verify-otp", verifyOtp);

// =======================
// ✅ MOBILE OTP ROUTES
// =======================
router.post("/send-otp-mobile", requireRecaptcha("otp_request", { minScore: 0.6 }), sendOtpMobile);
router.post("/verify-otp-mobile", verifyOtpMobile);
router.post("/profile", getProfile);
router.put("/profile", updateProfile);
router.get("/google", startGoogleLogin);
router.get("/google/callback", googleCallback);
router.post("/google/session", completeGoogleLogin);

export default router;
