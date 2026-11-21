import express from "express";

import { submitCorporateEnquiry } from "../controllers/corporate.controller.js";
import { requireRecaptcha } from "../middleware/recaptcha.middleware.js";

const router = express.Router();

router.post(
  "/enquiries",
  requireRecaptcha("corporate_enquiry", { minScore: 0.5 }),
  submitCorporateEnquiry
);

export default router;
