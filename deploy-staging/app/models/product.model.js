import db from "../config/db.js";

function queryFirstAvailable(sqlStatements, values, callback) {
  const statements = [...sqlStatements];

  function runNext(lastError) {
    const sql = statements.shift();

    if (!sql) {
      callback(lastError || new Error("No product query available"));
      return;
    }

    db.query(sql, values, (error, results, fields) => {
      if (error) {
        runNext(error);
        return;
      }

      callback(null, results, fields);
    });
  }

  runNext();
}

const productSelectWithImages = `
  SELECT
    p.*,
    c.name AS category_name,
    b.name AS brand_name,
    b.slug AS brand_slug,
    b.logo AS brand_logo,
    GROUP_CONCAT(DISTINCT pi.image_url) AS images,
    GROUP_CONCAT(DISTINCT t.name ORDER BY t.name SEPARATOR ',') AS tags,
    GROUP_CONCAT(DISTINCT t.slug ORDER BY t.name SEPARATOR ',') AS tag_slugs,
    (SELECT COUNT(*) FROM product_variants list_pv WHERE list_pv.product_id = p.id) AS variant_count,
    (SELECT MIN(list_pv.price) FROM product_variants list_pv WHERE list_pv.product_id = p.id AND list_pv.status = 'Active' AND list_pv.visibility <> 'Hidden') AS min_variant_price,
    (SELECT MAX(list_pv.price) FROM product_variants list_pv WHERE list_pv.product_id = p.id AND list_pv.status = 'Active' AND list_pv.visibility <> 'Hidden') AS max_variant_price,
    (SELECT COALESCE(SUM(list_pv.stock), 0) FROM product_variants list_pv WHERE list_pv.product_id = p.id AND list_pv.status = 'Active' AND list_pv.visibility <> 'Hidden') AS variant_stock,
    COALESCE(AVG(CASE WHEN pr.status = 'Published' THEN pr.rating END), 0) AS average_rating,
    COUNT(DISTINCT CASE WHEN pr.status = 'Published' THEN pr.id END) AS review_count
  FROM products p
  LEFT JOIN categories c ON p.category_id = c.id
  LEFT JOIN brands b ON p.brand_id = b.id
  LEFT JOIN product_images pi ON p.id = pi.product_id
  LEFT JOIN product_reviews pr ON p.id = pr.product_id
  LEFT JOIN product_tags pt ON pt.product_id = p.id
  LEFT JOIN tags t ON t.id = pt.tag_id AND t.deleted_at IS NULL
`;

const productSelectWithCategory = `
  SELECT
    p.*,
    c.name AS category_name,
    b.name AS brand_name,
    b.slug AS brand_slug,
    b.logo AS brand_logo,
    (SELECT COUNT(*) FROM product_variants list_pv WHERE list_pv.product_id = p.id) AS variant_count,
    (SELECT MIN(list_pv.price) FROM product_variants list_pv WHERE list_pv.product_id = p.id AND list_pv.status = 'Active' AND list_pv.visibility <> 'Hidden') AS min_variant_price,
    (SELECT MAX(list_pv.price) FROM product_variants list_pv WHERE list_pv.product_id = p.id AND list_pv.status = 'Active' AND list_pv.visibility <> 'Hidden') AS max_variant_price,
    (SELECT COALESCE(SUM(list_pv.stock), 0) FROM product_variants list_pv WHERE list_pv.product_id = p.id AND list_pv.status = 'Active' AND list_pv.visibility <> 'Hidden') AS variant_stock
  FROM products p
  LEFT JOIN categories c ON p.category_id = c.id
  LEFT JOIN brands b ON p.brand_id = b.id
`;

const productSelectOnly = "SELECT * FROM products";

export const Product = {
  search: (filters = {}, callback) => {
    const values = [];
    const where = [];
    const categoryId = Number(filters.category);
    const brandSlugs = String(filters.brands || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const brandId = Number(filters.brand_id || filters.brandId);
    const tagSlugs = String(filters.tags || filters.tag || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const q = String(filters.q || filters.search || "").trim();
    const includeInactive = filters.includeInactive === true || filters.includeInactive === "true";

    if (!includeInactive) {
      where.push("COALESCE(p.status, 'Active') = 'Active'");
    }

    if (categoryId) {
      where.push("p.category_id = ?");
      values.push(categoryId);
    }

    if (brandId) {
      where.push("p.brand_id = ?");
      values.push(brandId);
    }

    if (brandSlugs.length) {
      where.push(`b.slug IN (${brandSlugs.map(() => "?").join(", ")})`);
      values.push(...brandSlugs);
    }

    if (tagSlugs.length) {
      where.push(`EXISTS (
        SELECT 1
        FROM product_tags filter_pt
        INNER JOIN tags filter_t ON filter_t.id = filter_pt.tag_id
        WHERE filter_pt.product_id = p.id
          AND filter_t.slug IN (${tagSlugs.map(() => "?").join(", ")})
          AND filter_t.deleted_at IS NULL
      )`);
      values.push(...tagSlugs);
    }

    if (q) {
      where.push(`(
        p.name LIKE ?
        OR p.description LIKE ?
        OR c.name LIKE ?
        OR b.name LIKE ?
        OR b.slug LIKE ?
        OR t.name LIKE ?
        OR t.slug LIKE ?
        OR EXISTS (
          SELECT 1
          FROM product_variants search_pv
          LEFT JOIN variant_attribute_map search_vam ON search_vam.variant_id = search_pv.id
          LEFT JOIN variant_options search_vo ON search_vo.id = search_vam.option_id
          LEFT JOIN variant_option_values search_vov ON search_vov.id = search_vam.value_id
          WHERE search_pv.product_id = p.id
            AND (
              search_pv.sku LIKE ?
              OR search_vo.name LIKE ?
              OR search_vov.value LIKE ?
            )
        )
      )`);
      values.push(
        `%${q}%`,
        `%${q}%`,
        `%${q}%`,
        `%${q}%`,
        `%${q}%`,
        `%${q}%`,
        `%${q}%`,
        `%${q}%`,
        `%${q}%`,
        `%${q}%`
      );
    }

    const sortMap = {
      "price-low": "p.price ASC",
      "price-high": "p.price DESC",
      name: "p.name ASC",
      newest: "p.created_at DESC",
    };
    const orderBy = sortMap[filters.sort] || "p.created_at DESC";
    const limit = Math.min(120, Math.max(1, Number(filters.limit) || 120));
    const offset = Math.max(0, (Math.max(1, Number(filters.page) || 1) - 1) * limit);
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    queryFirstAvailable(
      [
        `${productSelectWithImages} ${whereSql} GROUP BY p.id ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
        `${productSelectWithCategory} ${whereSql} GROUP BY p.id ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
        `${productSelectOnly} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} LIMIT ? OFFSET ?`,
      ],
      [...values, limit, offset],
      callback
    );
  },

  getAll: (callback) => {
    queryFirstAvailable(
      [
        `${productSelectWithImages} GROUP BY p.id`,
        `${productSelectWithCategory} GROUP BY p.id`,
        productSelectOnly,
      ],
      [],
      callback
    );
  },

  getAllByCategory: (categoryId, callback) => {
    queryFirstAvailable(
      [
        `${productSelectWithImages} WHERE p.category_id = ? GROUP BY p.id`,
        `${productSelectWithCategory} WHERE p.category_id = ? GROUP BY p.id`,
        `${productSelectOnly} WHERE category_id = ?`,
      ],
      [categoryId],
      callback
    );
  },

  getById: (id, callback) => {
    queryFirstAvailable(
      [
        `${productSelectWithImages} WHERE p.id = ? GROUP BY p.id`,
        `${productSelectWithCategory} WHERE p.id = ? GROUP BY p.id`,
        `${productSelectOnly} WHERE id = ?`,
      ],
      [id],
      callback
    );
  },

  create: (data, callback) => {
    const sql = `
      INSERT INTO products (name, description, price, image, category_id, brand_id, sku, stock_quantity, reorder_level, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    db.query(
      sql,
      [
        data.name,
        data.description,
        data.price,
        data.image,
        data.category_id,
        data.brand_id || null,
        data.sku || null,
        Number(data.stock_quantity ?? data.stock ?? 0) || 0,
        Number(data.reorder_level ?? 10) || 10,
        data.status || "Active",
      ],
      callback
    );
  },

  addImages: (productId, images, callback) => {
    const values = images.map((image) => [productId, image]);
    db.query(
      "INSERT INTO product_images (product_id, image_url) VALUES ?",
      [values],
      callback
    );
  },

  update: (id, data, callback) => {
    const sql = `
      UPDATE products
      SET name=?, description=?, price=?, image=?, category_id=?, brand_id=?, sku=?, stock_quantity=?, reorder_level=?, status=?
      WHERE id=?
    `;
    db.query(
      sql,
      [
        data.name,
        data.description,
        data.price,
        data.image,
        data.category_id,
        data.brand_id || null,
        data.sku || null,
        Number(data.stock_quantity ?? data.stock ?? 0) || 0,
        Number(data.reorder_level ?? 10) || 10,
        data.status || "Active",
        id,
      ],
      callback
    );
  },

  delete: (id, callback) => {
    db.query("DELETE FROM products WHERE id = ?", [id], callback);
  },
};
