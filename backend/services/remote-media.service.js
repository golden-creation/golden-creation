import crypto from "crypto";
import db from "../config/db.js";
import {
  storageKeyFromUrl,
  uploadBufferToSpaces,
} from "./media-storage.service.js";
import { registerMediaAsset } from "./media-reference.service.js";

function query(sql, values = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, values, (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
}

function cleanString(value) {
  return String(value || "").trim();
}

export function isShopifyRemoteImageUrl(value) {
  const input = cleanString(value);
  if (!/^https?:\/\//i.test(input)) return false;
  try {
    const hostname = new URL(input).hostname.toLowerCase();
    return hostname === "cdn.shopify.com" || hostname.endsWith(".myshopify.com");
  } catch {
    return false;
  }
}

function extension(contentType) {
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  return ".jpg";
}

const waiters = [];
let active = 0;
const MAX_CONCURRENCY = 4;

async function acquire() {
  if (active < MAX_CONCURRENCY) {
    active += 1;
    return;
  }
  await new Promise((resolve) => waiters.push(resolve));
  active += 1;
}

function release() {
  active = Math.max(0, active - 1);
  waiters.shift()?.();
}

async function fetchWithRetry(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
        headers: { "User-Agent": "GoldenCreationMediaImporter/2.0" },
      });
      if (!response.ok) throw new Error(`Image request failed with ${response.status}`);
      const contentType = cleanString(
        response.headers.get("content-type") || "image/jpeg"
      ).toLowerCase();
      if (!contentType.startsWith("image/")) {
        throw new Error(`Unsupported image content type ${contentType}`);
      }
      return {
        buffer: Buffer.from(await response.arrayBuffer()),
        contentType,
      };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 750));
      }
    }
  }
  throw lastError;
}

export async function copyRemoteImageToSpaces(
  url,
  { folder = "products/imports", nameHint = "product" } = {}
) {
  const sourceUrl = cleanString(url);
  if (!/^https?:\/\//i.test(sourceUrl)) return sourceUrl;
  if (storageKeyFromUrl(sourceUrl)) return sourceUrl;
  const sourceHash = crypto.createHash("sha256").update(sourceUrl).digest("hex");
  const existing = await query(
    "SELECT * FROM remote_media_imports WHERE source_hash=? LIMIT 1",
    [sourceHash]
  );
  if (existing[0]?.status === "Copied" && existing[0]?.storage_url) {
    return existing[0].storage_url;
  }
  await query(
    `INSERT INTO remote_media_imports (source_url, source_hash, status)
     VALUES (?, ?, 'Pending')
     ON DUPLICATE KEY UPDATE source_url=VALUES(source_url)`,
    [sourceUrl, sourceHash]
  );

  await acquire();
  try {
    await query(
      `UPDATE remote_media_imports
          SET status='Copying', attempts=attempts+1, last_error=NULL
        WHERE source_hash=?`,
      [sourceHash]
    );
    const fetched = await fetchWithRetry(sourceUrl);
    const sourceName = decodeURIComponent(new URL(sourceUrl).pathname.split("/").pop() || "");
    const originalName =
      sourceName && sourceName.includes(".")
        ? sourceName
        : `${nameHint}${extension(fetched.contentType)}`;
    const media = await uploadBufferToSpaces({
      buffer: fetched.buffer,
      originalName,
      mimeType: fetched.contentType,
      folder,
    });
    await registerMediaAsset({ ...media, folder });
    await query(
      `UPDATE remote_media_imports
          SET status='Copied',storage_key=?,storage_url=?,last_error=NULL
        WHERE source_hash=?`,
      [media.key, media.url, sourceHash]
    );
    return media.url;
  } catch (error) {
    await query(
      `UPDATE remote_media_imports
          SET status='Failed',last_error=?
        WHERE source_hash=?`,
      [String(error.message || error).slice(0, 2000), sourceHash]
    ).catch(() => {});
    throw error;
  } finally {
    release();
  }
}

export async function seedRemoteMediaJobs() {
  const staleOwnedJobs = await query(
    `SELECT id,source_url
       FROM remote_media_imports
      WHERE status IN ('Pending','Failed','Copying')`
  );
  const ownedJobs = staleOwnedJobs
    .map((job) => ({ ...job, storageKey: storageKeyFromUrl(job.source_url) }))
    .filter((job) => job.storageKey);
  for (let offset = 0; offset < ownedJobs.length; offset += 500) {
    const batch = ownedJobs.slice(offset, offset + 500);
    await query(
      `UPDATE remote_media_imports
          SET status='Copied',
              storage_key=CASE id ${batch.map(() => "WHEN ? THEN ?").join(" ")} END,
              storage_url=source_url,
              last_error=NULL
        WHERE id IN (${batch.map(() => "?").join(",")})`,
      [
        ...batch.flatMap((job) => [job.id, job.storageKey]),
        ...batch.map((job) => job.id),
      ]
    );
  }
  await query(`
    INSERT IGNORE INTO remote_media_imports (source_url, source_hash, status)
    SELECT image, SHA2(image, 256), 'Pending'
      FROM products
     WHERE image REGEXP '^https?://cdn[.]shopify[.]com/'
        OR image REGEXP '^https?://[^/]+[.]myshopify[.]com/'
  `);
  await query(`
    INSERT IGNORE INTO remote_media_imports (source_url, source_hash, status)
    SELECT image_url, SHA2(image_url, 256), 'Pending'
      FROM product_images
     WHERE image_url REGEXP '^https?://cdn[.]shopify[.]com/'
        OR image_url REGEXP '^https?://[^/]+[.]myshopify[.]com/'
  `);
}

export async function backfillRemoteMedia({ limit = 100 } = {}) {
  await seedRemoteMediaJobs();
  const jobs = await query(
    `SELECT source_url
       FROM remote_media_imports
      WHERE status IN ('Pending','Failed')
        AND attempts < 5
      ORDER BY CASE status WHEN 'Pending' THEN 0 ELSE 1 END, updated_at, id
      LIMIT ?`,
    [Math.max(1, Math.min(1000, Number(limit) || 100))]
  );
  const results = { copied: 0, failed: 0 };
  await Promise.all(
    jobs.map(async (job) => {
      try {
        const replacement = await copyRemoteImageToSpaces(job.source_url, {
          folder: "products/shopify-backfill",
          nameHint: "shopify-product",
        });
        await query("UPDATE products SET image=? WHERE image=?", [replacement, job.source_url]);
        await query("UPDATE product_images SET image_url=? WHERE image_url=?", [
          replacement,
          job.source_url,
        ]);
        await query("UPDATE product_variants SET image=? WHERE image=?", [
          replacement,
          job.source_url,
        ]);
        results.copied += 1;
      } catch {
        results.failed += 1;
      }
    })
  );
  return results;
}

export async function remoteMediaStats() {
  await seedRemoteMediaJobs();
  const rows = await query(
    "SELECT status,COUNT(*) AS total FROM remote_media_imports GROUP BY status"
  );
  return rows.reduce(
    (stats, row) => ({ ...stats, [String(row.status).toLowerCase()]: Number(row.total) }),
    { pending: 0, copying: 0, copied: 0, failed: 0 }
  );
}
