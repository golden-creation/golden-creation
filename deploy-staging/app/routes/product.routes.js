import express from "express";
import {
  getProducts,
  getVariantFilters,
  getProduct,
  getProductVariantDetail,
  updateProductVariantDetail,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/product.fallback.controller.js";
import {
  createProductReview,
  getProductReviews,
} from "../controllers/review.controller.js";
import { requireRecaptcha } from "../middleware/recaptcha.middleware.js";

const router = express.Router();

router.get("/", getProducts);
router.get("/variant-filters", getVariantFilters);
router.get("/:id/reviews", getProductReviews);
router.post(
  "/:id/reviews",
  requireRecaptcha("product_review", { minScore: 0.5 }),
  createProductReview
);
router.get("/:id/variants", getProductVariantDetail);
router.put("/:id/variants", updateProductVariantDetail);
router.get("/:id", getProduct);

router.post("/", createProduct);
router.put("/:id", updateProduct);
router.delete("/:id", deleteProduct);

export default router;
