import express from "express";

import { getStoreTaxRules } from "../controllers/store.controller.js";

const router = express.Router();

router.get("/tax-rules", getStoreTaxRules);

export default router;
