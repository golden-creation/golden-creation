import db from "../config/db.js";
import { safelyDeleteMedia } from "../services/media-reference.service.js";

function query(sql, values = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, values, (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
}

const limitArg = process.argv.find((argument) => argument.startsWith("--limit="));
const limit = Math.max(1, Math.min(1000, Number(limitArg?.split("=")[1] || 250)));

try {
  const candidates = await query(
    `SELECT media_assets.public_url
       FROM media_assets
      WHERE media_assets.status <> 'Deleted'
        AND media_assets.folder = 'products/shopify-backfill'
        AND NOT EXISTS (
          SELECT 1 FROM products WHERE products.image = media_assets.public_url
        )
        AND NOT EXISTS (
          SELECT 1 FROM product_images
           WHERE product_images.image_url = media_assets.public_url
        )
        AND NOT EXISTS (
          SELECT 1 FROM product_variants
           WHERE product_variants.image = media_assets.public_url
        )
      ORDER BY media_assets.id
      LIMIT ?`,
    [limit]
  );

  const results = { deleted: 0, retained: 0, failed: 0 };
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(8, candidates.length) },
    async () => {
      while (cursor < candidates.length) {
        const candidate = candidates[cursor];
        cursor += 1;
        try {
          await safelyDeleteMedia(candidate.public_url);
          results.deleted += 1;
        } catch (error) {
          if (Number(error?.statusCode) === 409) results.retained += 1;
          else results.failed += 1;
        }
      }
    }
  );
  await Promise.all(workers);
  console.log(JSON.stringify({ candidates: candidates.length, results }, null, 2));
  db.end();
  process.exit(results.failed ? 2 : 0);
} catch (error) {
  console.error(error);
  db.end();
  process.exit(1);
}
