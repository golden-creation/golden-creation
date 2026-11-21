import express from "express";

import {
  createReferralClick,
  resolvePublicReferralCode,
} from "../controllers/referral-affiliate.controller.js";

const router = express.Router();

router.get("/resolve/:code", resolvePublicReferralCode);
router.post("/click", createReferralClick);

export default router;
