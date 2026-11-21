import express from "express";

import {
  getCollectionBySlug,
  getCollections,
  getProductsByTag,
  getTags,
} from "../controllers/merchandising.controller.js";
import { getNavbarMenus } from "../controllers/menu.controller.js";

const router = express.Router();

router.get("/tags", getTags);
router.get("/tags/:slug/products", getProductsByTag);
router.get("/collections", getCollections);
router.get("/collections/:slug", getCollectionBySlug);
router.get("/menus/navbar", getNavbarMenus);

export default router;
