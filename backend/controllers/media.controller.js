import multer from "multer";
import {
  createPublicUploadUrl,
  getSpacesPublicUrl,
  headSpacesObject,
  uploadBufferToSpaces,
} from "../services/media-storage.service.js";
import {
  registerMediaAsset,
  safelyDeleteMedia,
} from "../services/media-reference.service.js";
import {
  backfillRemoteMedia,
  remoteMediaStats,
} from "../services/remote-media.service.js";

const ALLOWED_MIME_PREFIXES = ["image/", "application/pdf", "text/", "application/json"];
const ALLOWED_MIME_TYPES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/zip",
  "text/csv",
]);
const ALLOWED_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "heic",
  "heif",
]);

function isAllowedMimeType(mimeType) {
  const value = String(mimeType || "").toLowerCase();
  return ALLOWED_MIME_PREFIXES.some((prefix) => value.startsWith(prefix)) || ALLOWED_MIME_TYPES.has(value);
}

function hasAllowedImageExtension(originalName) {
  const extension = String(originalName || "").toLowerCase().split(".").pop();
  return ALLOWED_IMAGE_EXTENSIONS.has(extension);
}

function isAllowedUpload(file) {
  if (isAllowedMimeType(file?.mimetype)) return true;
  return (
    String(file?.mimetype || "").toLowerCase() === "application/octet-stream" &&
    hasAllowedImageExtension(file?.originalname)
  );
}

function mediaMetadataFromBody(body = {}) {
  const value = (key) => String(body?.[key] || "").trim() || null;
  const numberValue = (key) => {
    const number = Number(body?.[key]);
    return Number.isFinite(number) && number > 0 ? number : null;
  };

  return {
    altText: value("altText") || value("alt_text"),
    titleText: value("titleText") || value("title_text"),
    caption: value("caption"),
    description: value("description"),
    seoFilename: value("seoFilename") || value("seo_filename"),
    ownerType: value("ownerType") || value("owner_type"),
    ownerId: value("ownerId") || value("owner_id"),
    width: numberValue("width"),
    height: numberValue("height"),
  };
}

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (!isAllowedUpload(file)) {
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
    await registerMediaAsset({
      ...media,
      folder: req.body?.folder || req.query?.folder || "admin",
      uploadedBy: req.admin?.id,
      ...mediaMetadataFromBody(req.body),
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
    const folder = requestedFolder.startsWith("reviews")
      ? "reviews"
      : requestedFolder.startsWith("customer-profiles")
      ? "customer-profiles"
      : "customer";
    const media = await uploadBufferToSpaces({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      folder,
    });
    await registerMediaAsset({ ...media, folder, ...mediaMetadataFromBody(req.body) });

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

export async function createVideoUploadUrl(req, res) {
  const originalName = String(req.body?.fileName || req.body?.originalName || "").trim();
  const mimeType = String(req.body?.mimeType || "").toLowerCase();
  const size = Number(req.body?.size || 0);
  if (!originalName || !["video/mp4", "video/webm"].includes(mimeType)) {
    return res.status(400).json({ message: "Only MP4 and WebM videos are supported" });
  }
  if (!size || size > 100 * 1024 * 1024) {
    return res.status(400).json({ message: "Video must be 100 MB or smaller" });
  }
  try {
    const media = await createPublicUploadUrl({
      originalName,
      mimeType,
      folder: req.body?.folder || "blog-videos",
    });
    await registerMediaAsset({
      key: media.key,
      url: media.url,
      mimeType,
      size,
      folder: req.body?.folder || "blog-videos",
      uploadedBy: req.admin?.id,
      status: "Pending",
      ...mediaMetadataFromBody(req.body),
    });
    res.status(201).json({ media });
  } catch (error) {
    res.status(400).json({ message: error.message || "Unable to prepare video upload" });
  }
}

export async function completeVideoUpload(req, res) {
  const key = String(req.body?.key || "").trim();
  try {
    const object = await headSpacesObject(key);
    const size = Number(object.ContentLength || 0);
    const mimeType = String(object.ContentType || "").toLowerCase();
    if (!["video/mp4", "video/webm"].includes(mimeType) || size > 100 * 1024 * 1024) {
      return res.status(400).json({ message: "Uploaded video failed validation" });
    }
    await registerMediaAsset({
      key,
      url: getSpacesPublicUrl(key),
      mimeType,
      size,
      folder: "blog-videos",
      uploadedBy: req.admin?.id,
      status: "Ready",
      ...mediaMetadataFromBody(req.body),
    });
    res.json({
      message: "Video upload completed",
      media: { key, url: getSpacesPublicUrl(key), mimeType, size },
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Unable to verify video upload" });
  }
}

export async function deleteAdminMedia(req, res) {
  try {
    const result = await safelyDeleteMedia(req.body?.key || req.body?.url);
    res.json({ message: "Media deleted", ...result });
  } catch (error) {
    res.status(error.statusCode || 400).json({
      message: error.message || "Unable to delete media",
    });
  }
}

export async function getRemoteMediaMigration(req, res) {
  try {
    res.json({ stats: await remoteMediaStats() });
  } catch (error) {
    res.status(500).json({ message: error.message || "Unable to load media migration" });
  }
}

export async function runRemoteMediaMigration(req, res) {
  const limit = Math.max(1, Math.min(500, Number(req.body?.limit) || 100));
  try {
    const results = await backfillRemoteMedia({ limit });
    res.json({ message: "Media migration batch completed", results, stats: await remoteMediaStats() });
  } catch (error) {
    res.status(500).json({ message: error.message || "Media migration batch failed" });
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
