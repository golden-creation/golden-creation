import db from "../config/db.js";
import {
  deleteFromSpaces,
  getSpacesPublicUrl,
  storageKeyFromUrl,
} from "./media-storage.service.js";

function query(sql, values = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, values, (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
}

const REFERENCE_COLUMNS = [
  ["products", "image"],
  ["product_images", "image_url"],
  ["product_variants", "image"],
  ["categories", "image"],
  ["brands", "logo"],
  ["collections", "banner"],
  ["bundle_products", "image"],
  ["menus", "image"],
  ["blog_posts", "cover_image"],
  ["blog_posts", "featured_video_url"],
  ["blog_posts", "video_poster"],
  ["blog_posts", "media_gallery"],
  ["admins", "profile_image"],
  ["users", "profile_image"],
];

async function existingReferenceColumns() {
  const rows = await query(
    `SELECT TABLE_NAME, COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND (${REFERENCE_COLUMNS.map(() => "(TABLE_NAME=? AND COLUMN_NAME=?)").join(" OR ")})`,
    REFERENCE_COLUMNS.flat()
  );
  return rows.map((row) => [row.TABLE_NAME, row.COLUMN_NAME]);
}

export async function registerMediaAsset({
  key,
  url,
  mimeType,
  size,
  folder,
  uploadedBy,
  status = "Ready",
  altText,
  titleText,
  caption,
  description,
  seoFilename,
  width,
  height,
  ownerType,
  ownerId,
}) {
  await query(
    `INSERT INTO media_assets
      (storage_key, public_url, mime_type, size_bytes, folder, status, uploaded_by,
       alt_text, title_text, caption, description, seo_filename, width, height, owner_type, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       public_url=VALUES(public_url), mime_type=VALUES(mime_type),
       size_bytes=VALUES(size_bytes), folder=VALUES(folder),
       status=VALUES(status), uploaded_by=COALESCE(VALUES(uploaded_by), uploaded_by),
       alt_text=COALESCE(VALUES(alt_text), alt_text),
       title_text=COALESCE(VALUES(title_text), title_text),
       caption=COALESCE(VALUES(caption), caption),
       description=COALESCE(VALUES(description), description),
       seo_filename=COALESCE(VALUES(seo_filename), seo_filename),
       width=COALESCE(VALUES(width), width),
       height=COALESCE(VALUES(height), height),
       owner_type=COALESCE(VALUES(owner_type), owner_type),
       owner_id=COALESCE(VALUES(owner_id), owner_id),
       deleted_at=NULL`,
    [
      key,
      url || getSpacesPublicUrl(key),
      mimeType || null,
      size || null,
      folder || null,
      status,
      uploadedBy || null,
      altText || null,
      titleText || null,
      caption || null,
      description || null,
      seoFilename || null,
      width || null,
      height || null,
      ownerType || null,
      ownerId || null,
    ]
  );
}

export async function mediaReferenceCount(key) {
  const url = getSpacesPublicUrl(key);
  let count = 0;
  for (const [table, column] of await existingReferenceColumns()) {
    const rows = await query(
      `SELECT COUNT(*) AS total
         FROM \`${table}\`
        WHERE \`${column}\` = ? OR \`${column}\` LIKE ?`,
      [url, `%${key}%`]
    );
    count += Number(rows[0]?.total || 0);
  }
  return count;
}

export async function safelyDeleteMedia(value) {
  const key = storageKeyFromUrl(value);
  if (!key) throw new Error("This media is not owned by Golden Creation storage");
  const assets = await query(
    "SELECT * FROM media_assets WHERE storage_key=? AND status <> 'Deleted' LIMIT 1",
    [key]
  );
  if (!assets.length) {
    throw new Error("This media is not registered as an application-owned asset");
  }
  const references = await mediaReferenceCount(key);
  if (references > 0) {
    const error = new Error(`Media is still referenced by ${references} record(s)`);
    error.statusCode = 409;
    throw error;
  }
  await deleteFromSpaces(key);
  await query(
    "UPDATE media_assets SET status='Deleted',deleted_at=NOW() WHERE storage_key=?",
    [key]
  );
  return { key };
}
