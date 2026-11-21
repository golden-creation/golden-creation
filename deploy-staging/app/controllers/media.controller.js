import multer from "multer";
import { uploadBufferToSpaces } from "../services/media-storage.service.js";

const ALLOWED_MIME_PREFIXES = ["image/", "application/pdf", "text/", "application/json"];
const ALLOWED_MIME_TYPES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/zip",
  "text/csv",
]);

function isAllowedMimeType(mimeType) {
  const value = String(mimeType || "").toLowerCase();
  return ALLOWED_MIME_PREFIXES.some((prefix) => value.startsWith(prefix)) || ALLOWED_MIME_TYPES.has(value);
}

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (!isAllowedMimeType(file.mimetype)) {
      callback(new Error("Unsupported file type"));
      return;
    }

    callback(null, true);
  },
});

export async function uploadAdminMedia(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "File is required" });
    }

    const media = await uploadBufferToSpaces({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      folder: req.body?.folder || req.query?.folder || "admin",
    });

    res.status(201).json({
      message: "File uploaded",
      media: {
        ...media,
        originalName: req.file.originalname,
      },
    });
  } catch (error) {
    res.status(400).json({
      message: error.message || "Unable to upload file",
    });
  }
}

export async function uploadPublicMedia(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "File is required" });
    }

    const requestedFolder = String(req.body?.folder || req.query?.folder || "customer").trim();
    const folder = requestedFolder.startsWith("reviews") ? "reviews" : "customer";
    const media = await uploadBufferToSpaces({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      folder,
    });

    res.status(201).json({
      message: "File uploaded",
      media: {
        ...media,
        originalName: req.file.originalname,
      },
    });
  } catch (error) {
    res.status(400).json({
      message: error.message || "Unable to upload file",
    });
  }
}

export function handleMediaUploadError(error, _req, res, next) {
  if (!error) {
    next();
    return;
  }

  res.status(400).json({
    message: error.message || "Unable to upload file",
  });
}
