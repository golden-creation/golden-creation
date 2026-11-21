import express from "express";

import {
  getBrandBySlug,
  getBrands,
  getFeaturedBrands,
  searchBrands,
} from "../controllers/brand.controller.js";

const router = express.Router();

router.get("/", getBrands);
router.get("/featured", getFeaturedBrands);
router.get("/search", searchBrands);
router.get("/:slug", getBrandBySlug);

export default router;
