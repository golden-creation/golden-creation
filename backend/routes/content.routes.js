import express from "express";
import { getContentPage } from "../controllers/content.controller.js";

const router = express.Router();
router.get("/pages/:slug", getContentPage);
export default router;
