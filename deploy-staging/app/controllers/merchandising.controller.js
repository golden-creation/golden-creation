import {
  cleanString,
  dbQuery,
  getCollectionProducts,
  normalizeCollection,
  normalizeCollectionPayload,
  normalizeTag,
  normalizeTagPayload,
  replaceCollectionProducts,
  slugify,
  validateCollectionPayload,
  validateTagPayload,
} from "../services/merchandising.service.js";
import { attachVariantsToProduct } from "../services/variant.service.js";

function moduleError(res, error, message) {
  console.log(`${message}:`, error);
  res.status(500).json({ message });
}

async function logMerchActivity(req, action, module, detail) {
  try {
    await dbQuery(
      `
        INSERT INTO admin_activity (admin_id, actor, action, module, detail)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        req.admin?.id || null,
        req.admin?.name || req.admin?.email || "Admin",
        action,
        module,
        detail,
      ]
    );
  } catch (error) {
    console.log("Merchandising activity skipped:", error.message);
  }
}

function paginationFromQuery(query = {}, fallbackLimit = 20) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || fallbackLimit));

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

export async function getTags(req, res) {
  const { page, limit, offset } = paginationFromQuery(req.query, 100);
  const q = cleanString(req.query.q || req.query.search);
  const values = [];
  const where = ["t.deleted_at IS NULL"];

  if (req.query.status) {
    where.push("t.status = ?");
    values.push(cleanString(req.query.status));
  } else if (!String(req.baseUrl || "").includes("/admin")) {
    where.push("t.status = 'Active'");
  }

  if (q) {
    where.push("(t.name LIKE ? OR t.slug LIKE ?)");
    values.push(`%${q}%`, `%${q}%`);
  }

  try {
    const tags = await dbQuery(
      `
        SELECT t.*, COUNT(pt.product_id) AS product_count
        FROM tags t
        LEFT JOIN product_tags pt ON pt.tag_id = t.id
        WHERE ${where.join(" AND ")}
        GROUP BY t.id
        ORDER BY t.name
        LIMIT ? OFFSET ?
      `,
      [...values, limit, offset]
    );
    const countRows = await dbQuery(
      `SELECT COUNT(*) AS total FROM tags t WHERE ${where.join(" AND ")}`,
      values
    );

    res.json({
      tags: tags.map(normalizeTag),
      pagination: { page, limit, total: Number(countRows[0]?.total || 0) },
    });
  } catch (error) {
    moduleError(res, error, "Failed to load tags");
  }
}

export async function createAdminTag(req, res) {
  const payload = normalizeTagPayload(req.body);
  const validation = validateTagPayload(payload);

  if (validation) return res.status(400).json({ message: validation });

  try {
    const result = await dbQuery(
      `
        INSERT INTO tags (name, slug, status)
        VALUES (?, ?, ?)
      `,
      [payload.name, payload.slug, payload.status]
    );

    await logMerchActivity(req, "Created tag", "Tag Management", payload.name);
    res.status(201).json({ message: "Tag created", tag: { id: result.insertId, ...payload } });
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Tag slug already exists" });
    }

    moduleError(res, error, "Failed to create tag");
  }
}

export async function updateAdminTag(req, res) {
  const payload = normalizeTagPayload(req.body);
  const validation = validateTagPayload(payload);

  if (validation) return res.status(400).json({ message: validation });

  try {
    const result = await dbQuery(
      `
        UPDATE tags
        SET name = ?, slug = ?, status = ?
        WHERE id = ? AND deleted_at IS NULL
      `,
      [payload.name, payload.slug, payload.status, req.params.id]
    );

    if (!result.affectedRows) return res.status(404).json({ message: "Tag not found" });

    await logMerchActivity(req, "Updated tag", "Tag Management", payload.name);
    res.json({ message: "Tag updated" });
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Tag slug already exists" });
    }

    moduleError(res, error, "Failed to update tag");
  }
}

export async function updateAdminTagStatus(req, res) {
  const status = cleanString(req.body?.status) || "Inactive";

  try {
    await dbQuery("UPDATE tags SET status = ? WHERE id = ?", [status, req.params.id]);
    await logMerchActivity(req, "Changed tag status", "Tag Management", `Tag ${req.params.id}: ${status}`);
    res.json({ message: "Tag status updated" });
  } catch (error) {
    moduleError(res, error, "Failed to update tag status");
  }
}

export async function deleteAdminTag(req, res) {
  try {
    await dbQuery("UPDATE tags SET deleted_at = NOW(), status = 'Inactive' WHERE id = ?", [req.params.id]);
    await logMerchActivity(req, "Deleted tag", "Tag Management", `Tag ${req.params.id}`);
    res.json({ message: "Tag deleted" });
  } catch (error) {
    moduleError(res, error, "Failed to delete tag");
  }
}

export async function bulkDeleteAdminTags(req, res) {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];

  if (!ids.length) return res.status(400).json({ message: "Select tags to delete" });

  try {
    await dbQuery(
      `UPDATE tags SET deleted_at = NOW(), status = 'Inactive' WHERE id IN (${ids.map(() => "?").join(", ")})`,
      ids
    );
    await logMerchActivity(req, "Bulk deleted tags", "Tag Management", `${ids.length} tags`);
    res.json({ message: "Tags deleted" });
  } catch (error) {
    moduleError(res, error, "Failed to delete tags");
  }
}

export async function getProductsByTag(req, res) {
  const slug = slugify(req.params.slug);

  try {
    const rows = await dbQuery(
      `
        SELECT id, name, slug, status
        FROM tags
        WHERE slug = ? AND status = 'Active' AND deleted_at IS NULL
        LIMIT 1
      `,
      [slug]
    );

    if (!rows.length) return res.status(404).json({ message: "Tag not found" });

    const collection = {
      id: 0,
      type: "automatic",
      conditions_json: JSON.stringify({ tags: [slug] }),
    };
    const products = await Promise.all(
      (await getCollectionProducts(collection, req.query)).map((product) => attachVariantsToProduct(product))
    );

    res.json({ tag: normalizeTag(rows[0]), products });
  } catch (error) {
    moduleError(res, error, "Failed to load tag products");
  }
}

async function listCollections(req, res, { publicOnly = false } = {}) {
  const { page, limit, offset } = paginationFromQuery(req.query, publicOnly ? 24 : 12);
  const q = cleanString(req.query.q || req.query.search);
  const values = [];
  const where = ["co.deleted_at IS NULL"];

  if (publicOnly) {
    where.push("co.status = 'Active'");
  } else if (req.query.status) {
    where.push("co.status = ?");
    values.push(cleanString(req.query.status));
  }

  if (req.query.type) {
    where.push("co.type = ?");
    values.push(cleanString(req.query.type).toLowerCase());
  }

  if (q) {
    where.push("(co.name LIKE ? OR co.slug LIKE ? OR co.description LIKE ?)");
    values.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  try {
    const collections = await dbQuery(
      `
        SELECT
          co.*,
          COUNT(DISTINCT cp.product_id) AS product_count
        FROM collections co
        LEFT JOIN collection_products cp ON cp.collection_id = co.id
        WHERE ${where.join(" AND ")}
        GROUP BY co.id
        ORDER BY co.created_at DESC
        LIMIT ? OFFSET ?
      `,
      [...values, limit, offset]
    );
    const countRows = await dbQuery(
      `SELECT COUNT(*) AS total FROM collections co WHERE ${where.join(" AND ")}`,
      values
    );

    const normalizedCollections = await Promise.all(
      collections.map(async (item) => {
        const collection = normalizeCollection(item);
        if (collection.type === "automatic") {
          const products = await getCollectionProducts(collection, { limit: 120 });
          collection.product_count = products.length;
        }
        return collection;
      })
    );

    res.json({
      collections: normalizedCollections,
      pagination: { page, limit, total: Number(countRows[0]?.total || 0) },
    });
  } catch (error) {
    moduleError(res, error, "Failed to load collections");
  }
}

export async function getCollections(req, res) {
  return listCollections(req, res, { publicOnly: true });
}

export async function getAdminCollections(req, res) {
  return listCollections(req, res, { publicOnly: false });
}

export async function getCollectionBySlug(req, res) {
  const slug = slugify(req.params.slug);

  try {
    const rows = await dbQuery(
      `
        SELECT co.*, COUNT(DISTINCT cp.product_id) AS product_count
        FROM collections co
        LEFT JOIN collection_products cp ON cp.collection_id = co.id
        WHERE co.slug = ?
          AND co.status = 'Active'
          AND co.deleted_at IS NULL
        GROUP BY co.id
        LIMIT 1
      `,
      [slug]
    );

    if (!rows.length) return res.status(404).json({ message: "Collection not found" });

    const collection = normalizeCollection(rows[0]);
    const products = await getCollectionProducts(collection, req.query);
    collection.product_count = collection.type === "automatic" ? products.length : collection.product_count;

    res.json({ collection, products });
  } catch (error) {
    moduleError(res, error, "Failed to load collection");
  }
}

export async function getAdminCollectionDetail(req, res) {
  try {
    const rows = await dbQuery(
      `
        SELECT co.*, COUNT(DISTINCT cp.product_id) AS product_count
        FROM collections co
        LEFT JOIN collection_products cp ON cp.collection_id = co.id
        WHERE co.id = ?
        GROUP BY co.id
        LIMIT 1
      `,
      [req.params.id]
    );

    if (!rows.length) return res.status(404).json({ message: "Collection not found" });

    const manualProducts = await dbQuery(
      `
        SELECT cp.product_id, cp.sort_order, cp.pinned, p.name, p.sku, p.price, p.image
        FROM collection_products cp
        INNER JOIN products p ON p.id = cp.product_id
        WHERE cp.collection_id = ?
        ORDER BY cp.pinned DESC, cp.sort_order ASC
      `,
      [req.params.id]
    );
    const collection = normalizeCollection(rows[0]);
    const previewProducts = await getCollectionProducts(collection, { limit: 24 });

    res.json({
      collection,
      manualProducts,
      previewProducts,
    });
  } catch (error) {
    moduleError(res, error, "Failed to load collection detail");
  }
}

export async function createAdminCollection(req, res) {
  const payload = normalizeCollectionPayload(req.body);
  const validation = validateCollectionPayload(payload);

  if (validation) return res.status(400).json({ message: validation });

  try {
    const result = await dbQuery(
      `
        INSERT INTO collections
          (name, slug, type, description, banner, conditions_json, status, seo_title, seo_description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.name,
        payload.slug,
        payload.type,
        payload.description || null,
        payload.banner || null,
        JSON.stringify(payload.conditions || {}),
        payload.status,
        payload.seoTitle || null,
        payload.seoDescription || null,
      ]
    );

    if (payload.type === "manual") {
      await replaceCollectionProducts(result.insertId, payload.products);
    }

    await logMerchActivity(req, "Created collection", "Collection Management", payload.name);
    res.status(201).json({ message: "Collection created", collection: { id: result.insertId, ...payload } });
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Collection slug already exists" });
    }

    moduleError(res, error, "Failed to create collection");
  }
}

export async function updateAdminCollection(req, res) {
  const payload = normalizeCollectionPayload(req.body);
  const validation = validateCollectionPayload(payload);

  if (validation) return res.status(400).json({ message: validation });

  try {
    const result = await dbQuery(
      `
        UPDATE collections
        SET
          name = ?,
          slug = ?,
          type = ?,
          description = ?,
          banner = ?,
          conditions_json = ?,
          status = ?,
          seo_title = ?,
          seo_description = ?
        WHERE id = ? AND deleted_at IS NULL
      `,
      [
        payload.name,
        payload.slug,
        payload.type,
        payload.description || null,
        payload.banner || null,
        JSON.stringify(payload.conditions || {}),
        payload.status,
        payload.seoTitle || null,
        payload.seoDescription || null,
        req.params.id,
      ]
    );

    if (!result.affectedRows) return res.status(404).json({ message: "Collection not found" });

    if (payload.type === "manual") {
      await replaceCollectionProducts(req.params.id, payload.products);
    } else {
      await replaceCollectionProducts(req.params.id, []);
    }

    await logMerchActivity(req, "Updated collection", "Collection Management", payload.name);
    res.json({ message: "Collection updated" });
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Collection slug already exists" });
    }

    moduleError(res, error, "Failed to update collection");
  }
}

export async function updateAdminCollectionStatus(req, res) {
  const status = cleanString(req.body?.status) || "Inactive";

  try {
    await dbQuery("UPDATE collections SET status = ? WHERE id = ?", [status, req.params.id]);
    await logMerchActivity(req, "Changed collection status", "Collection Management", `Collection ${req.params.id}: ${status}`);
    res.json({ message: "Collection status updated" });
  } catch (error) {
    moduleError(res, error, "Failed to update collection status");
  }
}

export async function deleteAdminCollection(req, res) {
  try {
    await dbQuery("UPDATE collections SET deleted_at = NOW(), status = 'Inactive' WHERE id = ?", [req.params.id]);
    await logMerchActivity(req, "Deleted collection", "Collection Management", `Collection ${req.params.id}`);
    res.json({ message: "Collection deleted" });
  } catch (error) {
    moduleError(res, error, "Failed to delete collection");
  }
}

export async function previewAdminCollection(req, res) {
  try {
    const payload = normalizeCollectionPayload(req.body || {});
    const collection = {
      id: req.body?.id || 0,
      type: payload.type,
      conditions_json: JSON.stringify(payload.conditions || {}),
    };

    if (payload.type === "manual") {
      const productIds = payload.products.map((item) => Number(item.product_id || item.productId || item.id)).filter(Boolean);
      if (!productIds.length) return res.json({ products: [] });

      const products = await dbQuery(
        `
          SELECT p.*, c.name AS category_name, b.name AS brand_name, b.slug AS brand_slug, b.logo AS brand_logo
          FROM products p
          LEFT JOIN categories c ON p.category_id = c.id
          LEFT JOIN brands b ON p.brand_id = b.id
          WHERE p.id IN (${productIds.map(() => "?").join(", ")})
        `,
        productIds
      );

      return res.json({ products });
    }

    const products = await getCollectionProducts(collection, { limit: 24 });
    res.json({ products });
  } catch (error) {
    moduleError(res, error, "Failed to preview collection");
  }
}
