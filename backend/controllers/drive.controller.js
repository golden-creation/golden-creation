import multer from "multer";
import db from "../config/db.js";
import {
  deleteFromSpaces,
  getSpacesPublicUrl,
  uploadBufferToSpaces,
} from "../services/media-storage.service.js";

const MAX_DRIVE_UPLOAD_SIZE = 100 * 1024 * 1024;
const ROOT_FOLDER_ID = null;

const allowedMimePrefixes = [
  "image/",
  "video/",
  "audio/",
  "text/",
  "application/pdf",
];

const allowedMimeTypes = new Set([
  "application/json",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/octet-stream",
]);

export const driveUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_DRIVE_UPLOAD_SIZE,
  },
  fileFilter: (_req, file, callback) => {
    const mimeType = String(file?.mimetype || "").toLowerCase();
    if (
      allowedMimePrefixes.some((prefix) => mimeType.startsWith(prefix)) ||
      allowedMimeTypes.has(mimeType)
    ) {
      callback(null, true);
      return;
    }

    callback(new Error("Unsupported Drive file type"));
  },
});

function query(sql, values = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, values, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

function clean(value) {
  return String(value || "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeFolderId(value) {
  const id = number(value);
  return id > 0 ? id : ROOT_FOLDER_ID;
}

function isPrivilegedAdmin(admin) {
  const role = clean(admin?.role).toLowerCase();
  return role === "super admin" || role === "admin";
}

function publicFilePayload(row) {
  return {
    ...row,
    id: number(row.id),
    folder_id: row.folder_id === null || row.folder_id === undefined ? null : number(row.folder_id),
    size: number(row.size),
    url: row.public_url || (row.storage_key ? getSpacesPublicUrl(row.storage_key) : ""),
  };
}

async function folderExists(folderId) {
  if (!folderId) return true;
  const rows = await query(
    "SELECT id FROM drive_folders WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    [folderId]
  );
  return Boolean(rows.length);
}

async function buildBreadcrumb(folderId) {
  if (!folderId) return [];
  const rows = await query(
    `
      WITH RECURSIVE folder_path AS (
        SELECT id, parent_id, name, 0 AS depth
        FROM drive_folders
        WHERE id = ? AND deleted_at IS NULL
        UNION ALL
        SELECT parent.id, parent.parent_id, parent.name, folder_path.depth + 1
        FROM drive_folders parent
        INNER JOIN folder_path ON folder_path.parent_id = parent.id
        WHERE parent.deleted_at IS NULL
      )
      SELECT id, parent_id, name, depth
      FROM folder_path
      ORDER BY depth DESC
    `,
    [folderId]
  );

  return rows;
}

async function assertValidParent(folderId, parentId) {
  if (!parentId) return;
  if (folderId && Number(folderId) === Number(parentId)) {
    const error = new Error("A folder cannot be moved inside itself");
    error.statusCode = 400;
    throw error;
  }

  const parentRows = await query(
    "SELECT id, parent_id FROM drive_folders WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    [parentId]
  );
  if (!parentRows.length) {
    const error = new Error("Parent folder was not found");
    error.statusCode = 404;
    throw error;
  }

  let currentParentId = parentRows[0].parent_id;
  while (currentParentId) {
    if (folderId && Number(currentParentId) === Number(folderId)) {
      const error = new Error("A folder cannot be moved inside one of its child folders");
      error.statusCode = 400;
      throw error;
    }
    const rows = await query("SELECT parent_id FROM drive_folders WHERE id = ? LIMIT 1", [
      currentParentId,
    ]);
    currentParentId = rows[0]?.parent_id || null;
  }
}

export async function getDriveItems(req, res) {
  const folderId = normalizeFolderId(req.query.folderId);
  const q = clean(req.query.q);
  const type = clean(req.query.type).toLowerCase();
  const page = Math.max(1, number(req.query.page) || 1);
  const limit = Math.max(10, Math.min(100, number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  try {
    if (!(await folderExists(folderId))) {
      return res.status(404).json({ message: "Folder was not found" });
    }

    const folders = q
      ? []
      : await query(
          `
            SELECT f.*, a.name AS created_by_name
            FROM drive_folders f
            LEFT JOIN admins a ON a.id = f.created_by
            WHERE f.deleted_at IS NULL
              AND (f.parent_id <=> ?)
            ORDER BY f.name
          `,
          [folderId]
        );

    const fileWhere = ["df.deleted_at IS NULL"];
    const values = [];

    if (q) {
      fileWhere.push("(df.name LIKE ? OR df.original_name LIKE ? OR df.mime_type LIKE ?)");
      values.push(...Array(3).fill(`%${q}%`));
    } else {
      fileWhere.push("(df.folder_id <=> ?)");
      values.push(folderId);
    }

    if (type === "image") fileWhere.push("df.mime_type LIKE 'image/%'");
    if (type === "video") fileWhere.push("df.mime_type LIKE 'video/%'");
    if (type === "pdf") fileWhere.push("df.mime_type = 'application/pdf'");
    if (type === "document") {
      fileWhere.push(
        "(df.mime_type LIKE 'application/%word%' OR df.mime_type LIKE 'application/%sheet%' OR df.mime_type LIKE 'application/%presentation%' OR df.mime_type IN ('application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint'))"
      );
    }

    const files = await query(
      `
        SELECT df.*, a.name AS uploaded_by_name
        FROM drive_files df
        LEFT JOIN admins a ON a.id = df.uploaded_by
        WHERE ${fileWhere.join(" AND ")}
        ORDER BY df.created_at DESC, df.id DESC
        LIMIT ? OFFSET ?
      `,
      [...values, limit, offset]
    );
    const countRows = await query(
      `SELECT COUNT(*) AS total FROM drive_files df WHERE ${fileWhere.join(" AND ")}`,
      values
    );
    const allFolders = await query(
      `
        SELECT id, parent_id, name
        FROM drive_folders
        WHERE deleted_at IS NULL
        ORDER BY COALESCE(parent_id, 0), name
      `
    );

    res.json({
      folderId,
      folders,
      files: files.map(publicFilePayload),
      breadcrumb: await buildBreadcrumb(folderId),
      allFolders,
      canDelete: isPrivilegedAdmin(req.admin),
      pagination: {
        page,
        limit,
        total: number(countRows[0]?.total),
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message || "Unable to load Drive",
    });
  }
}

export async function createDriveFolder(req, res) {
  const name = clean(req.body?.name);
  const parentId = normalizeFolderId(req.body?.parentId ?? req.body?.parent_id);

  if (!name) return res.status(400).json({ message: "Folder name is required" });

  try {
    await assertValidParent(null, parentId);
    const result = await query(
      `
        INSERT INTO drive_folders (name, parent_id, created_by)
        VALUES (?, ?, ?)
      `,
      [name, parentId, req.admin?.id || null]
    );
    res.status(201).json({
      message: "Folder created",
      folder: {
        id: result.insertId,
        name,
        parent_id: parentId,
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message || "Unable to create folder",
    });
  }
}

export async function updateDriveFolder(req, res) {
  const id = number(req.params.id);
  const name = clean(req.body?.name);
  const parentId =
    req.body?.parentId === undefined && req.body?.parent_id === undefined
      ? undefined
      : normalizeFolderId(req.body?.parentId ?? req.body?.parent_id);

  if (!id) return res.status(400).json({ message: "Invalid folder ID" });

  try {
    const rows = await query(
      "SELECT id, parent_id FROM drive_folders WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: "Folder was not found" });
    if (parentId !== undefined) await assertValidParent(id, parentId);

    await query(
      `
        UPDATE drive_folders
        SET
          name = COALESCE(NULLIF(?, ''), name),
          parent_id = ?,
          updated_at = NOW()
        WHERE id = ?
      `,
      [name, parentId === undefined ? rows[0].parent_id : parentId, id]
    );
    res.json({ message: "Folder updated" });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message || "Unable to update folder",
    });
  }
}

export async function deleteDriveFolder(req, res) {
  if (!isPrivilegedAdmin(req.admin)) {
    return res.status(403).json({ message: "Only admin can delete Drive folders" });
  }

  const id = number(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid folder ID" });

  try {
    const childRows = await query(
      `
        SELECT
          (SELECT COUNT(*) FROM drive_folders WHERE parent_id = ? AND deleted_at IS NULL) AS folders,
          (SELECT COUNT(*) FROM drive_files WHERE folder_id = ? AND deleted_at IS NULL) AS files
      `,
      [id, id]
    );
    if (number(childRows[0]?.folders) || number(childRows[0]?.files)) {
      return res.status(409).json({ message: "Folder must be empty before deletion" });
    }
    await query("UPDATE drive_folders SET deleted_at = NOW() WHERE id = ?", [id]);
    res.json({ message: "Folder deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message || "Unable to delete folder" });
  }
}

export async function uploadDriveFile(req, res) {
  const folderId = normalizeFolderId(req.body?.folderId ?? req.body?.folder_id);

  try {
    if (!req.file) return res.status(400).json({ message: "File is required" });
    if (!(await folderExists(folderId))) {
      return res.status(404).json({ message: "Folder was not found" });
    }

    const media = await uploadBufferToSpaces({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype || "application/octet-stream",
      folder: `drive/${folderId || "root"}`,
    });

    const result = await query(
      `
        INSERT INTO drive_files
          (folder_id, name, original_name, storage_key, public_url, mime_type, size, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        folderId,
        clean(req.body?.name) || req.file.originalname,
        req.file.originalname,
        media.key,
        media.url,
        media.mimeType,
        media.size,
        req.admin?.id || null,
      ]
    );

    res.status(201).json({
      message: "File uploaded",
      file: publicFilePayload({
        id: result.insertId,
        folder_id: folderId,
        name: clean(req.body?.name) || req.file.originalname,
        original_name: req.file.originalname,
        storage_key: media.key,
        public_url: media.url,
        mime_type: media.mimeType,
        size: media.size,
        uploaded_by: req.admin?.id || null,
      }),
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({
      message: error.message || "Unable to upload Drive file",
    });
  }
}

export async function updateDriveFile(req, res) {
  const id = number(req.params.id);
  const name = clean(req.body?.name);
  const folderId =
    req.body?.folderId === undefined && req.body?.folder_id === undefined
      ? undefined
      : normalizeFolderId(req.body?.folderId ?? req.body?.folder_id);

  if (!id) return res.status(400).json({ message: "Invalid file ID" });

  try {
    const rows = await query(
      "SELECT id, folder_id FROM drive_files WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: "File was not found" });
    if (folderId !== undefined && !(await folderExists(folderId))) {
      return res.status(404).json({ message: "Target folder was not found" });
    }

    await query(
      `
        UPDATE drive_files
        SET
          name = COALESCE(NULLIF(?, ''), name),
          folder_id = ?,
          updated_at = NOW()
        WHERE id = ?
      `,
      [name, folderId === undefined ? rows[0].folder_id : folderId, id]
    );
    res.json({ message: "File updated" });
  } catch (error) {
    res.status(500).json({ message: error.message || "Unable to update file" });
  }
}

export async function deleteDriveFile(req, res) {
  if (!isPrivilegedAdmin(req.admin)) {
    return res.status(403).json({ message: "Only admin can delete Drive files" });
  }

  const id = number(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid file ID" });

  try {
    const rows = await query(
      "SELECT id, storage_key FROM drive_files WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      [id]
    );
    const file = rows[0];
    if (!file) return res.status(404).json({ message: "File was not found" });

    if (String(file.storage_key || "").startsWith("drive/")) {
      await deleteFromSpaces(file.storage_key);
    }
    await query("UPDATE drive_files SET deleted_at = NOW() WHERE id = ?", [id]);
    res.json({ message: "File deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message || "Unable to delete file" });
  }
}
