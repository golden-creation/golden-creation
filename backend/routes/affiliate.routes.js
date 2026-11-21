import express from "express";

import {
  affiliateLogin,
  createAffiliateLink,
  createAffiliatePayoutMethod,
  createAffiliateWithdrawal,
  getAffiliateDashboard,
  getAffiliateMe,
  getAffiliatePayoutMethods,
  getAffiliateWithdrawals,
  requireAffiliate,
  submitAffiliateApplication,
} from "../controllers/referral-affiliate.controller.js";

const router = express.Router();

router.post("/applications", submitAffiliateApplication);
router.post("/login", affiliateLogin);

router.use(requireAffiliate);
router.get("/me", getAffiliateMe);
router.get("/dashboard", getAffiliateDashboard);
router.post("/links", createAffiliateLink);
router.get("/wallet/payout-methods", getAffiliatePayoutMethods);
router.post("/wallet/payout-methods", createAffiliatePayoutMethod);
router.get("/wallet/withdrawals", getAffiliateWithdrawals);
router.post("/wallet/withdrawals", createAffiliateWithdrawal);

export default router;
