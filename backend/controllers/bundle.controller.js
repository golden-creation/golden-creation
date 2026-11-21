import db from "../config/db.js";
import { slugify } from "../services/brand.service.js";

function dbQuery(sql, values = []) {
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

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function normalizeBundle(row = {}, items = []) {
  return {
    ...row,
    id: Number(row.id || 0),
    price: toMoney(row.price),
    comparePrice: row.compare_price === null ? null : toMoney(row.compare_price),
    featured: Boolean(row.featured),
    minItems: Number(row.min_items || 1),
    maxItems: Number(row.max_items || 15),
    itemCount: Number(row.item_count || items.length || 0),
    items,
  };
}

async function getBundleItems(bundleIds = []) {
  const ids = bundleIds.map(Number).filter(Boolean);
  if (!ids.length) return new Map();

  const rows = await dbQuery(
    `
      SELECT
        bpi.bundle_id,
        bpi.product_id,
        bpi.variant_id,
        bpi.quantity,
        bpi.sort_order,
        p.name,
        p.price,
        p.image,
        p.sku,
        p.category_id,
        c.name AS category_name,
        br.name AS brand_name,
        pv.sku AS variant_sku,
        pv.price AS variant_price,
        pv.image AS variant_image
      FROM bundle_product_items bpi
      INNER JOIN products p ON p.id = bpi.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN brands br ON br.id = p.brand_id
      LEFT JOIN product_variants pv ON pv.id = bpi.variant_id
      WHERE bpi.bundle_id IN (${ids.map(() => "?").join(", ")})
        AND COALESCE(p.status, 'Active') = 'Active'
      ORDER BY bpi.bundle_id, bpi.sort_order, bpi.id
    `,
    ids
  );

  return rows.reduce((map, row) => {
    const list = map.get(Number(row.bundle_id)) || [];
    list.push({
      productId: Number(row.product_id),
      variantId: Number(row.variant_id) || null,
      name: row.name,
      sku: row.variant_sku || row.sku || "",
      quantity: Number(row.quantity || 1),
      price: toMoney(row.variant_price ?? row.price),
      imageUrl: row.variant_image || row.image || "",
      categoryId: Number(row.category_id || 0),
      categoryName: row.category_name || "",
      brandName: row.brand_name || "",
      sortOrder: Number(row.sort_order || 0),
    });
    map.set(Number(row.bundle_id), list);
    return map;
  }, new Map());
}

export async function getBundles(req, res) {
  const q = cleanString(req.query.q || req.query.search);
  const values = [];
  const where = ["bp.deleted_at IS NULL", "bp.status = 'Active'"];

  if (q) {
    where.push(`(
      bp.name LIKE ?
      OR bp.description LIKE ?
      OR EXISTS (
        SELECT 1
        FROM bundle_product_items search_bpi
        INNER JOIN products search_p ON search_p.id = search_bpi.product_id
        LEFT JOIN categories search_c ON search_c.id = search_p.category_id
        LEFT JOIN brands search_b ON search_b.id = search_p.brand_id
        WHERE search_bpi.bundle_id = bp.id
          AND (search_p.name LIKE ? OR search_c.name LIKE ? OR search_b.name LIKE ?)
      )
    )`);
    values.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  try {
    const rows = await dbQuery(
      `
        SELECT bp.*, COUNT(bpi.id) AS item_count
        FROM bundle_products bp
        LEFT JOIN bundle_product_items bpi ON bpi.bundle_id = bp.id
        WHERE ${where.join(" AND ")}
          AND EXISTS (
            SELECT 1
            FROM bundle_product_items valid_bpi
            INNER JOIN products valid_p ON valid_p.id = valid_bpi.product_id
            WHERE valid_bpi.bundle_id = bp.id
              AND COALESCE(valid_p.status, 'Active') = 'Active'
          )
        GROUP BY bp.id
        ORDER BY bp.featured DESC, bp.created_at DESC
      `,
      values
    );
    const itemsByBundle = await getBundleItems(rows.map((row) => row.id));
    const bundles = rows
      .map((row) => normalizeBundle(row, itemsByBundle.get(Number(row.id)) || []))
      .filter((bundle) => bundle.items.length > 0);

    res.json({
      bundles,
    });
  } catch (error) {
    console.log("Bundles Error:", error);
    res.status(500).json({ message: "Failed to load bundles" });
  }
}

export async function getBundleBySlug(req, res) {
  try {
    const rows = await dbQuery(
      `
        SELECT bp.*, COUNT(bpi.id) AS item_count
        FROM bundle_products bp
        LEFT JOIN bundle_product_items bpi ON bpi.bundle_id = bp.id
        WHERE bp.slug = ?
          AND bp.status = 'Active'
          AND bp.deleted_at IS NULL
        GROUP BY bp.id
        LIMIT 1
      `,
      [slugify(req.params.slug)]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Bundle not found" });
    }

    const items = await getBundleItems([rows[0].id]);
    const bundle = normalizeBundle(rows[0], items.get(Number(rows[0].id)) || []);

    if (!bundle.items.length) {
      return res.status(404).json({ message: "Bundle has no active products" });
    }

    res.json({ bundle });
  } catch (error) {
    res.status(500).json({ message: "Failed to load bundle" });
  }
}

export async function getAdminBundles(req, res) {
  try {
    const rows = await dbQuery(
      `
        SELECT bp.*, COUNT(bpi.id) AS item_count
        FROM bundle_products bp
        LEFT JOIN bundle_product_items bpi ON bpi.bundle_id = bp.id
        WHERE bp.deleted_at IS NULL
        GROUP BY bp.id
        ORDER BY bp.created_at DESC
      `
    );
    const itemsByBundle = await getBundleItems(rows.map((row) => row.id));

    res.json({
      bundles: rows.map((row) => normalizeBundle(row, itemsByBundle.get(Number(row.id)) || [])),
      metrics: {
        total: rows.length,
        active: rows.filter((row) => row.status === "Active").length,
        featured: rows.filter((row) => Boolean(row.featured)).length,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to load bundles" });
  }
}

export async function getAdminBundleDetail(req, res) {
  try {
    const rows = await dbQuery("SELECT * FROM bundle_products WHERE id = ? AND deleted_at IS NULL LIMIT 1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: "Bundle not found" });
    const items = await getBundleItems([rows[0].id]);
    res.json({ bundle: normalizeBundle(rows[0], items.get(Number(rows[0].id)) || []) });
  } catch (error) {
    res.status(500).json({ message: "Failed to load bundle" });
  }
}

function normalizeBundlePayload(body = {}) {
  const name = cleanString(body.name);
  return {
    name,
    slug: slugify(body.slug || name),
    description: cleanString(body.description),
    image: cleanString(body.image),
    price: toMoney(body.price),
    comparePrice: body.comparePrice === "" ? null : toMoney(body.comparePrice ?? body.compare_price),
    status: cleanString(body.status) || "Active",
    featured: Boolean(body.featured),
    minItems: Math.max(1, Number(body.minItems || body.min_items || 1)),
    maxItems: Math.max(1, Number(body.maxItems || body.max_items || 15)),
    items: Array.isArray(body.items) ? body.items : [],
  };
}

async function replaceBundleItems(bundleId, items = []) {
  await dbQuery("DELETE FROM bundle_product_items WHERE bundle_id = ?", [bundleId]);
  const normalized = items
    .map((item, index) => ({
      productId: Number(item.productId || item.product_id || item.id),
      variantId: Number(item.variantId || item.variant_id) || null,
      quantity: Math.max(1, Number(item.quantity) || 1),
      sortOrder: Number(item.sortOrder || item.sort_order || index + 1),
    }))
    .filter((item) => item.productId);

  if (!normalized.length) return;

  await dbQuery(
    `
      INSERT INTO bundle_product_items
        (bundle_id, product_id, variant_id, quantity, sort_order)
      VALUES ?
    `,
    [normalized.map((item) => [bundleId, item.productId, item.variantId, item.quantity, item.sortOrder])]
  );
}

export async function createAdminBundle(req, res) {
  const payload = normalizeBundlePayload(req.body);
  if (!payload.name || !payload.slug) {
    return res.status(400).json({ message: "Bundle name is required" });
  }

  try {
    const result = await dbQuery(
      `
        INSERT INTO bundle_products
          (name, slug, description, image, price, compare_price, status, featured, min_items, max_items, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.name,
        payload.slug,
        payload.description || null,
        payload.image || null,
        payload.price,
        payload.comparePrice,
        payload.status,
        payload.featured,
        payload.minItems,
        payload.maxItems,
        req.admin?.name || req.admin?.email || "Admin",
      ]
    );
    await replaceBundleItems(result.insertId, payload.items);
    res.status(201).json({ message: "Bundle created", id: result.insertId });
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Bundle slug already exists" });
    res.status(500).json({ message: "Failed to create bundle" });
  }
}

export async function updateAdminBundle(req, res) {
  const payload = normalizeBundlePayload(req.body);
  if (!payload.name || !payload.slug) {
    return res.status(400).json({ message: "Bundle name is required" });
  }

  try {
    await dbQuery(
      `
        UPDATE bundle_products
        SET name = ?, slug = ?, description = ?, image = ?, price = ?, compare_price = ?,
            status = ?, featured = ?, min_items = ?, max_items = ?
        WHERE id = ?
      `,
      [
        payload.name,
        payload.slug,
        payload.description || null,
        payload.image || null,
        payload.price,
        payload.comparePrice,
        payload.status,
        payload.featured,
        payload.minItems,
        payload.maxItems,
        req.params.id,
      ]
    );
    await replaceBundleItems(req.params.id, payload.items);
    res.json({ message: "Bundle updated" });
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Bundle slug already exists" });
    res.status(500).json({ message: "Failed to update bundle" });
  }
}

export async function deleteAdminBundle(req, res) {
  try {
    await dbQuery("UPDATE bundle_products SET deleted_at = NOW(), status = 'Inactive' WHERE id = ?", [req.params.id]);
    res.json({ message: "Bundle deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete bundle" });
  }
}
