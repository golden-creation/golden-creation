import express from "express";
import { getGoogleReviews } from "../controllers/google-reviews.controller.js";

const router = express.Router();

router.get("/", getGoogleReviews);

export default router;
