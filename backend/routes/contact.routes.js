import express from "express";
import { createContactEnquiry } from "../controllers/contact.controller.js";
import { requireRecaptcha } from "../middleware/recaptcha.middleware.js";

const router = express.Router();

router.post(
  "/enquiries",
  requireRecaptcha("contact_enquiry", { minScore: 0.5 }),
  createContactEnquiry
);

export default router;
