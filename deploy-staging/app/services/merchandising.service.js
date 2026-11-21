import db from "../config/db.js";
import { cleanString, slugify } from "./brand.service.js";

export { cleanString, slugify };

export function dbQuery(sql, values = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, values, (error, results) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(results);
    });
  });
}

export function normalizeTag(row = {}) {
  return {
    ...row,
    id: Number(row.id || 0),
    product_count: Number(row.product_count || 0),
  };
}

export function normalizeCollection(row = {}) {
  let conditions = {};

  try {
    conditions =
      typeof row.conditions_json === "string"
        ? JSON.parse(row.conditions_json || "{}")
        : row.conditions_json || {};
  } catch {
    conditions = {};
  }

  return {
    ...row,
    id: Number(row.id || 0),
    product_count: Number(row.product_count || 0),
    conditions,
  };
}

export function normalizeTagPayload(body = {}) {
  const name = cleanString(body.name);

  return {
    name,
    slug: slugify(body.slug || name),
    status: cleanString(body.status) || "Active",
  };
}

export function normalizeCollectionPayload(body = {}) {
  const name = cleanString(body.name);
  const type = cleanString(body.type).toLowerCase() === "manual" ? "manual" : "automatic";

  return {
    name,
    slug: slugify(body.slug || name),
    type,
    description: cleanString(body.description),
    banner: cleanString(body.banner),
    conditions: body.conditions || body.conditions_json || {},
    status: cleanString(body.status) || "Active",
    seoTitle: cleanString(body.seo_title || body.seoTitle),
    seoDescription: cleanString(body.seo_description || body.seoDescription),
    products: Array.isArray(body.products) ? body.products : [],
  };
}

export function validateTagPayload(payload) {
  if (!payload.name) return "Tag name is required";
  if (!payload.slug) return "Tag slug is required";
  return "";
}

export function validateCollectionPayload(payload) {
  if (!payload.name) return "Collection name is required";
  if (!payload.slug) return "Collection slug is required";
  if (!["manual", "automatic"].includes(payload.type)) return "Collection type must be manual or automatic";
  return "";
}

export async function ensureTags(values = []) {
  const inputs = Array.isArray(values)
    ? values
    : String(values || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  const tagIds = [];

  for (const item of inputs) {
    if (item && typeof item === "object") {
      if (item.id) {
        tagIds.push(Number(item.id));
        continue;
      }

      if (item.name || item.slug) {
        const name = cleanString(item.name || item.slug);
        const slug = slugify(item.slug || name);
        await dbQuery(
          `
            INSERT INTO tags (name, slug, status)
            VALUES (?, ?, 'Active')
            ON DUPLICATE KEY UPDATE
              name = VALUES(name),
              status = 'Active',
              deleted_at = NULL
          `,
          [name, slug]
        );
        const rows = await dbQuery("SELECT id FROM tags WHERE slug = ? LIMIT 1", [slug]);
        if (rows[0]?.id) tagIds.push(Number(rows[0].id));
      }
      continue;
    }

    const text = cleanString(item);
    if (!text) continue;

    if (/^\d+$/.test(text)) {
      tagIds.push(Number(text));
      continue;
    }

    const slug = slugify(text);
    await dbQuery(
      `
        INSERT INTO tags (name, slug, status)
        VALUES (?, ?, 'Active')
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          status = 'Active',
          deleted_at = NULL
      `,
      [text, slug]
    );
    const rows = await dbQuery("SELECT id FROM tags WHERE slug = ? LIMIT 1", [slug]);
    if (rows[0]?.id) tagIds.push(Number(rows[0].id));
  }

  return [...new Set(tagIds.filter(Boolean))];
}

export async function syncProductTags(productId, values = []) {
  const id = Number(productId);

  if (!id) return [];

  const tagIds = await ensureTags(values);
  await dbQuery("DELETE FROM product_tags WHERE product_id = ?", [id]);

  if (tagIds.length) {
    await dbQuery(
      "INSERT IGNORE INTO product_tags (product_id, tag_id) VALUES ?",
      [tagIds.map((tagId) => [id, tagId])]
    );
  }

  return tagIds;
}

export async function getProductTags(productId) {
  return dbQuery(
    `
      SELECT t.id, t.name, t.slug, t.status
      FROM product_tags pt
      INNER JOIN tags t ON t.id = pt.tag_id
      WHERE pt.product_id = ?
        AND t.deleted_at IS NULL
      ORDER BY t.name
    `,
    [productId]
  );
}

function addProductFilters({ where, values, filters = {} }) {
  const q = cleanString(filters.q || filters.search);
  const sort = cleanString(filters.sort);

  if (q) {
    where.push("(p.name LIKE ? OR p.description LIKE ? OR c.name LIKE ? OR b.name LIKE ?)");
    values.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  return {
    orderBy:
      {
        "price-low": "p.price ASC",
        "price-high": "p.price DESC",
        name: "p.name ASC",
        newest: "p.created_at DESC",
      }[sort] || "p.created_at DESC",
  };
}

function automaticConditionSql(conditions = {}, values = []) {
  const groups = [];
  const match = String(conditions.match || "all").toLowerCase() === "any" ? " OR " : " AND ";

  const tags = Array.isArray(conditions.tags) ? conditions.tags.filter(Boolean) : [];
  if (tags.length) {
    groups.push(`EXISTS (
      SELECT 1 FROM product_tags cpt
      INNER JOIN tags ct ON ct.id = cpt.tag_id
      WHERE cpt.product_id = p.id
        AND ct.slug IN (${tags.map(() => "?").join(", ")})
        AND ct.status = 'Active'
        AND ct.deleted_at IS NULL
    )`);
    values.push(...tags);
  }

  const brands = Array.isArray(conditions.brands) ? conditions.brands.filter(Boolean) : [];
  if (brands.length) {
    groups.push(`b.slug IN (${brands.map(() => "?").join(", ")})`);
    values.push(...brands);
  }

  const categories = Array.isArray(conditions.categories) ? conditions.categories.filter(Boolean) : [];
  if (categories.length) {
    groups.push(`(c.name IN (${categories.map(() => "?").join(", ")}) OR p.category_id IN (${categories.map(() => "?").join(", ")}))`);
    values.push(...categories, ...categories);
  }

  if (conditions.priceMin !== undefined && conditions.priceMin !== "") {
    groups.push("p.price >= ?");
    values.push(Number(conditions.priceMin) || 0);
  }

  if (conditions.priceMax !== undefined && conditions.priceMax !== "") {
    groups.push("p.price <= ?");
    values.push(Number(conditions.priceMax) || 0);
  }

  if (conditions.stockStatus === "in_stock") {
    groups.push("COALESCE(p.stock_quantity, 0) > 0");
  } else if (conditions.stockStatus === "out_of_stock") {
    groups.push("COALESCE(p.stock_quantity, 0) <= 0");
  }

  if (conditions.featured === true || conditions.featured === "true") {
    groups.push("COALESCE(p.featured, FALSE) = TRUE");
  }

  return groups.length ? `(${groups.join(match)})` : "1=1";
}

export async function getCollectionProducts(collection, filters = {}) {
  const normalized = normalizeCollection(collection);
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(120, Math.max(1, Number(filters.limit) || 48));
  const offset = (page - 1) * limit;
  const values = [];
  const where = ["COALESCE(p.status, 'Active') = 'Active'"];
  const manualJoin =
    normalized.type === "manual"
      ? "INNER JOIN collection_products cp ON cp.product_id = p.id AND cp.collection_id = ?"
      : "";

  if (normalized.type === "manual") {
    values.push(normalized.id);
  } else {
    where.push(automaticConditionSql(normalized.conditions, values));
  }

  const { orderBy } = addProductFilters({ where, values, filters });
  const manualOrder =
    normalized.type === "manual"
      ? "cp.pinned DESC, cp.sort_order ASC, p.name ASC"
      : orderBy;

  const rows = await dbQuery(
    `
      SELECT
        p.*,
        c.name AS category_name,
        b.name AS brand_name,
        b.slug AS brand_slug,
        b.logo AS brand_logo,
        GROUP_CONCAT(DISTINCT pi.image_url) AS images,
        GROUP_CONCAT(DISTINCT t.name ORDER BY t.name SEPARATOR ',') AS tags,
        GROUP_CONCAT(DISTINCT t.slug ORDER BY t.name SEPARATOR ',') AS tag_slugs,
        COALESCE(AVG(CASE WHEN pr.status = 'Published' THEN pr.rating END), 0) AS average_rating,
        COUNT(DISTINCT CASE WHEN pr.status = 'Published' THEN pr.id END) AS review_count
      FROM products p
      ${manualJoin}
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN product_images pi ON p.id = pi.product_id
      LEFT JOIN product_reviews pr ON p.id = pr.product_id
      LEFT JOIN product_tags pt ON pt.product_id = p.id
      LEFT JOIN tags t ON t.id = pt.tag_id AND t.deleted_at IS NULL
      WHERE ${where.join(" AND ")}
      GROUP BY p.id
      ORDER BY ${manualOrder}
      LIMIT ? OFFSET ?
    `,
    [...values, limit, offset]
  );

  return rows;
}

export async function replaceCollectionProducts(collectionId, products = []) {
  await dbQuery("DELETE FROM collection_products WHERE collection_id = ?", [collectionId]);

  const values = products
    .map((item, index) => ({
      product_id: Number(item.product_id || item.productId || item.id),
      sort_order: Number(item.sort_order ?? item.sortOrder ?? index + 1),
      pinned: Boolean(item.pinned),
    }))
    .filter((item) => item.product_id);

  if (!values.length) return;

  await dbQuery(
    `
      INSERT INTO collection_products (collection_id, product_id, sort_order, pinned)
      VALUES ?
    `,
    [values.map((item) => [collectionId, item.product_id, item.sort_order, item.pinned])]
  );
}
