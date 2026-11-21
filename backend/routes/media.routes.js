import express from "express";
import {
  handleMediaUploadError,
  uploadMiddleware,
  uploadPublicMedia,
} from "../controllers/media.controller.js";
import { requireRecaptcha } from "../middleware/recaptcha.middleware.js";

const router = express.Router();

router.post(
  "/upload",
  uploadMiddleware.single("file"),
  requireRecaptcha("media_upload", { minScore: 0.4 }),
  uploadPublicMedia
);
router.use(handleMediaUploadError);

export default router;
