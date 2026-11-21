import express from "express";

import {
  createReturnRequest,
  getCustomerReturns,
  getPublicBlog,
  getPublicBlogPost,
  subscribeNewsletter,
  unsubscribeNewsletter,
} from "../controllers/expansion.controller.js";
import { streamSharedCatalog } from "../controllers/sales.controller.js";

const router = express.Router();

router.post("/newsletter/subscribe", subscribeNewsletter);
router.post("/newsletter/unsubscribe", unsubscribeNewsletter);
router.get("/blog", getPublicBlog);
router.get("/blog/:slug", getPublicBlogPost);
router.get("/catalogs/share/:token", streamSharedCatalog);
router.post("/returns", createReturnRequest);
router.get("/returns", getCustomerReturns);

export default router;
