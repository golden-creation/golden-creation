import "dotenv/config";
import mysql from "mysql2/promise";
import { fileURLToPath } from "url";
import { dataSeedAuthorized } from "./setup-safety.js";

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 170);
}

async function localColumnExists(db, table, column) {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?
      LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function addColumn(db, table, column, definition) {
  if (!(await localColumnExists(db, table, column))) {
    await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

async function localIndexExists(db, table, indexName) {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?
      LIMIT 1`,
    [table, indexName]
  );
  return rows.length > 0;
}

async function addIndex(db, table, indexName, definition) {
  if (!(await localIndexExists(db, table, indexName))) {
    await db.query(`ALTER TABLE \`${table}\` ADD ${definition}`);
  }
}

async function tableExists(db, table) {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME=?
      LIMIT 1`,
    [table]
  );
  return rows.length > 0;
}

async function backfillProductSlugs(db) {
  if (!(await tableExists(db, "products"))) return;
  const [products] = await db.query("SELECT id, name, slug FROM products ORDER BY id");
  const seen = new Set();
  for (const product of products) {
    let slug = slugify(product.slug || product.name || `product-${product.id}`);
    if (!slug || seen.has(slug)) slug = `${slugify(product.name || "product")}-${product.id}`;
    while (seen.has(slug)) slug = `${slugify(product.name || "product")}-${product.id}-${seen.size}`;
    seen.add(slug);
    if (slug !== product.slug) {
      await db.query("UPDATE products SET slug=? WHERE id=?", [slug, product.id]);
    }
  }
}

async function backfillCategorySlugs(db) {
  if (!(await tableExists(db, "categories"))) return;
  const [categories] = await db.query("SELECT id, name, slug FROM categories ORDER BY id");
  const seen = new Set();
  for (const category of categories) {
    let slug = slugify(category.slug || category.name || `category-${category.id}`);
    if (!slug || seen.has(slug)) slug = `${slugify(category.name || "category")}-${category.id}`;
    while (seen.has(slug)) slug = `${slugify(category.name || "category")}-${category.id}-${seen.size}`;
    seen.add(slug);
    if (slug !== category.slug) {
      await db.query("UPDATE categories SET slug=? WHERE id=?", [slug, category.id]);
    }
  }
}

export async function ensureSeoSchema(db, options = {}) {
  const allowDataWrites = options.allowDataWrites === true;
  await db.query(`
    CREATE TABLE IF NOT EXISTS seo_settings (
      setting_key VARCHAR(120) NOT NULL,
      setting_value LONGTEXT NULL,
      updated_by INT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (setting_key),
      INDEX idx_seo_settings_updated_by (updated_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS seo_scripts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(180) NOT NULL,
      slot ENUM('global_head','body_start','home','product','category','collection','brand','blog','checkout','order_success') NOT NULL DEFAULT 'global_head',
      content LONGTEXT NOT NULL,
      status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
      version INT NOT NULL DEFAULT 1,
      created_by INT NULL,
      updated_by INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_seo_scripts_slot_status (slot, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS seo_script_revisions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      script_id BIGINT UNSIGNED NOT NULL,
      version INT NOT NULL,
      name VARCHAR(180) NOT NULL,
      slot VARCHAR(40) NOT NULL,
      content LONGTEXT NOT NULL,
      status VARCHAR(30) NOT NULL,
      changed_by INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_seo_script_revisions_script (script_id, version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS seo_redirects (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      source_path VARCHAR(500) NOT NULL,
      target_path VARCHAR(500) NOT NULL,
      status_code INT NOT NULL DEFAULT 301,
      status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
      created_by INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_seo_redirect_source (source_path),
      KEY idx_seo_redirect_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS seo_feed_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      feed_type VARCHAR(40) NOT NULL,
      status VARCHAR(40) NOT NULL,
      product_count INT NOT NULL DEFAULT 0,
      message TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_seo_feed_logs_type_created (feed_type, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS media_assets (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      storage_key VARCHAR(500) NOT NULL,
      public_url TEXT NOT NULL,
      mime_type VARCHAR(120) NULL,
      size_bytes BIGINT UNSIGNED NULL,
      folder VARCHAR(120) NULL,
      status ENUM('Pending','Ready','Deleted','Failed') NOT NULL DEFAULT 'Ready',
      uploaded_by INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_media_asset_key (storage_key),
      KEY idx_media_asset_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await addColumn(db, "products", "slug", "VARCHAR(220) NULL AFTER name");
  await addColumn(db, "products", "meta_title", "VARCHAR(190) NULL AFTER slug");
  await addColumn(db, "products", "meta_description", "TEXT NULL AFTER meta_title");
  await addColumn(db, "products", "seo_description", "LONGTEXT NULL AFTER meta_description");
  await addColumn(db, "products", "focus_keyword", "VARCHAR(190) NULL AFTER seo_description");
  await addColumn(db, "products", "search_keywords", "TEXT NULL AFTER focus_keyword");
  await addColumn(db, "products", "canonical_url", "VARCHAR(500) NULL AFTER search_keywords");
  await addColumn(db, "products", "robots_directive", "VARCHAR(80) NOT NULL DEFAULT 'index,follow' AFTER canonical_url");
  await addColumn(db, "products", "og_image", "LONGTEXT NULL AFTER robots_directive");
  await addColumn(db, "products", "schema_override_json", "LONGTEXT NULL AFTER og_image");

  await addColumn(db, "categories", "meta_title", "VARCHAR(190) NULL AFTER description");
  await addColumn(db, "categories", "meta_description", "TEXT NULL AFTER meta_title");
  await addColumn(db, "categories", "robots_directive", "VARCHAR(80) NOT NULL DEFAULT 'index,follow' AFTER meta_description");
  await addColumn(db, "categories", "og_image", "LONGTEXT NULL AFTER robots_directive");

  await addColumn(db, "product_images", "alt_text", "VARCHAR(255) NULL AFTER image_url");
  await addColumn(db, "product_images", "title_text", "VARCHAR(255) NULL AFTER alt_text");
  await addColumn(db, "product_images", "caption", "VARCHAR(255) NULL AFTER title_text");
  await addColumn(db, "product_images", "description", "TEXT NULL AFTER caption");
  await addColumn(db, "product_images", "seo_filename", "VARCHAR(255) NULL AFTER description");
  await addColumn(db, "product_images", "sort_order", "INT NOT NULL DEFAULT 0 AFTER seo_filename");
  await addColumn(db, "product_images", "storage_key", "VARCHAR(500) NULL AFTER sort_order");

  await addColumn(db, "media_assets", "alt_text", "VARCHAR(255) NULL AFTER public_url");
  await addColumn(db, "media_assets", "title_text", "VARCHAR(255) NULL AFTER alt_text");
  await addColumn(db, "media_assets", "caption", "VARCHAR(255) NULL AFTER title_text");
  await addColumn(db, "media_assets", "description", "TEXT NULL AFTER caption");
  await addColumn(db, "media_assets", "seo_filename", "VARCHAR(255) NULL AFTER description");
  await addColumn(db, "media_assets", "width", "INT NULL AFTER seo_filename");
  await addColumn(db, "media_assets", "height", "INT NULL AFTER width");
  await addColumn(db, "media_assets", "owner_type", "VARCHAR(80) NULL AFTER height");
  await addColumn(db, "media_assets", "owner_id", "BIGINT NULL AFTER owner_type");

  await addColumn(db, "blog_posts", "meta_title", "VARCHAR(190) NULL AFTER title");
  await addColumn(db, "blog_posts", "meta_description", "TEXT NULL AFTER meta_title");
  await addColumn(db, "blog_posts", "canonical_url", "VARCHAR(500) NULL AFTER meta_description");
  await addColumn(db, "blog_posts", "robots_directive", "VARCHAR(80) NOT NULL DEFAULT 'index,follow' AFTER canonical_url");
  await addColumn(db, "blog_posts", "og_image", "LONGTEXT NULL AFTER robots_directive");
  await addColumn(db, "blog_posts", "focus_keyword", "VARCHAR(190) NULL AFTER og_image");
  await addColumn(db, "blog_posts", "schema_override_json", "LONGTEXT NULL AFTER focus_keyword");

  if (allowDataWrites) {
  await backfillProductSlugs(db);
  await backfillCategorySlugs(db);

  await db.query(`
    UPDATE product_images pi
    JOIN products p ON p.id = pi.product_id
       SET pi.alt_text = COALESCE(NULLIF(pi.alt_text, ''), p.name),
           pi.title_text = COALESCE(NULLIF(pi.title_text, ''), p.name),
           pi.sort_order = CASE WHEN pi.sort_order = 0 THEN pi.id ELSE pi.sort_order END
     WHERE pi.alt_text IS NULL OR pi.alt_text = '' OR pi.title_text IS NULL OR pi.title_text = '' OR pi.sort_order = 0
  `);
  }

  await addIndex(db, "products", "uq_products_slug", "UNIQUE KEY uq_products_slug (slug)");
  await addIndex(db, "categories", "uq_categories_slug", "UNIQUE KEY uq_categories_slug (slug)");
  await addIndex(db, "product_images", "idx_product_images_sort", "KEY idx_product_images_sort (product_id, sort_order)");
  await addIndex(db, "media_assets", "idx_media_assets_owner", "KEY idx_media_assets_owner (owner_type, owner_id)");

  if (allowDataWrites) {
  const defaults = [
    ["site_title", "Golden Creation"],
    ["default_meta_title", "Golden Creation | Office Stationery & Gift Items"],
    ["default_meta_description", "Shop office stationery, writing tools, school supplies, art materials, gifts, and premium pens from Golden Creation."],
    ["canonical_base_url", "https://goldencreation.in"],
    ["robots_default", "index,follow"],
    ["merchant_feed_enabled", "true"],
    ["meta_feed_enabled", "true"],
    ["allow_ai_crawlers", "true"],
  ];
  for (const [key, value] of defaults) {
    await db.query("INSERT IGNORE INTO seo_settings (setting_key, setting_value) VALUES (?, ?)", [key, value]);
  }
  }
}

async function runStandalone() {
  const dbName = process.env.DB_NAME || "lekhanmart";
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    port: Number(process.env.DB_PORT) || 3306,
    database: dbName,
    multipleStatements: true,
  });
  await ensureSeoSchema(connection, { allowDataWrites: dataSeedAuthorized(process.env) });
  await connection.end();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runStandalone()
    .then(() => {
      console.log("SEO schema is ready.");
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
