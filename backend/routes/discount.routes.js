import express from "express";

import {
  getApplicableDiscounts,
  validateCoupon,
} from "../controllers/discount.controller.js";

const router = express.Router();

router.post("/validate", validateCoupon);
router.post("/applicable", getApplicableDiscounts);

export default router;
