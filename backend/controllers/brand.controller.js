import {
  cleanString,
  dbQuery,
  normalizeBrand,
  normalizeBrandPayload,
  slugify,
  validateBrandPayload,
} from "../services/brand.service.js";
import { resolveBrandListLimit } from "../services/brand-query.js";
import {
  canUseDevelopmentBrandFallback,
  findDevelopmentBrand,
  isDatabaseUnavailable,
  loadDevelopmentBrandCatalog,
  queryDevelopmentBrands,
} from "../services/brand-fallback.js";

function moduleError(res, error, message) {
  console.log(`${message}:`, error);
  res.status(500).json({ message });
}

async function logBrandActivity(req, action, detail) {
  try {
    await dbQuery(
      `
        INSERT INTO admin_activity (admin_id, actor, action, module, detail)
        VALUES (?, ?, ?, 'Brand Management', ?)
      `,
      [
        req.admin?.id || null,
        req.admin?.name || req.admin?.email || "Admin",
        action,
        detail,
      ]
    );
  } catch (error) {
    console.log("Brand activity skipped:", error.message);
  }
}

function brandWhereFromQuery(query = {}, includeDeleted = false) {
  const clauses = [];
  const values = [];
  const q = cleanString(query.q || query.search);

  if (!includeDeleted) {
    clauses.push("b.deleted_at IS NULL");
  }

  if (q) {
    clauses.push("(b.name LIKE ? OR b.slug LIKE ? OR b.description LIKE ?)");
    values.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  if (query.status) {
    clauses.push("b.status = ?");
    values.push(cleanString(query.status));
  }

  if (query.featured === "true" || query.featured === true) {
    clauses.push("b.featured = TRUE");
  }

  if (query.deleted === "true") {
    clauses.length = 0;
    clauses.push("b.deleted_at IS NOT NULL");
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

async function listBrands(req, res, { publicOnly = false, featuredOnly = false } = {}) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = resolveBrandListLimit(req.query.limit);
  const offset = (page - 1) * limit;
  const includeDeleted = !publicOnly && req.query.deleted === "true";
  const query = {
    ...req.query,
    status: publicOnly ? "Active" : req.query.status,
    featured: featuredOnly ? true : req.query.featured,
  };
  const { where, values } = brandWhereFromQuery(query, includeDeleted);
  const sortMap = {
    name: "b.name ASC",
    newest: "b.created_at DESC",
    products: "product_count DESC, b.name ASC",
  };
  const orderBy = sortMap[req.query.sort] || "b.featured DESC, b.name ASC";

  try {
    const rows = await dbQuery(
      `
        SELECT
          b.*,
          COUNT(p.id) AS product_count
        FROM brands b
        LEFT JOIN products p ON p.brand_id = b.id
        ${where}
        GROUP BY b.id
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `,
      [...values, limit, offset]
    );
    const countRows = await dbQuery(
      `
        SELECT COUNT(*) AS total
        FROM brands b
        ${where}
      `,
      values
    );

    res.json({
      brands: rows.map(normalizeBrand),
      pagination: {
        page,
        limit,
        total: Number(countRows[0]?.total || 0),
      },
    });
  } catch (error) {
    if (canUseDevelopmentBrandFallback() && isDatabaseUnavailable(error)) {
      const payload = queryDevelopmentBrands(loadDevelopmentBrandCatalog(), query, {
        publicOnly,
        featuredOnly,
      });
      console.log("Brand list is using the local development catalog because MySQL is unavailable.");
      return res.json(payload);
    }

    moduleError(res, error, "Failed to load brands");
  }
}

export async function getBrands(req, res) {
  return listBrands(req, res, { publicOnly: true });
}

export async function getFeaturedBrands(req, res) {
  return listBrands(req, res, { publicOnly: true, featuredOnly: true });
}

export async function searchBrands(req, res) {
  return listBrands(req, res, { publicOnly: true });
}

export async function getBrandBySlug(req, res) {
  const slug = slugify(req.params.slug);

  try {
    const brandRows = await dbQuery(
      `
        SELECT b.*, COUNT(p.id) AS product_count
        FROM brands b
        LEFT JOIN products p ON p.brand_id = b.id
        WHERE b.slug = ?
          AND b.status = 'Active'
          AND b.deleted_at IS NULL
        GROUP BY b.id
        LIMIT 1
      `,
      [slug]
    );

    if (!brandRows.length) {
      return res.status(404).json({ message: "Brand not found" });
    }

    const products = await dbQuery(
      `
        SELECT
          p.*,
          c.name AS category_name,
          b.name AS brand_name,
          b.slug AS brand_slug,
          b.logo AS brand_logo,
          GROUP_CONCAT(DISTINCT pi.image_url) AS images,
          COALESCE(AVG(CASE WHEN pr.status = 'Published' THEN pr.rating END), 0) AS average_rating,
          COUNT(DISTINCT CASE WHEN pr.status = 'Published' THEN pr.id END) AS review_count
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN brands b ON p.brand_id = b.id
        LEFT JOIN product_images pi ON p.id = pi.product_id
        LEFT JOIN product_reviews pr ON p.id = pr.product_id
        WHERE p.brand_id = ?
          AND COALESCE(p.status, 'Active') = 'Active'
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `,
      [brandRows[0].id]
    );

    res.json({
      brand: normalizeBrand(brandRows[0]),
      products,
    });
  } catch (error) {
    if (canUseDevelopmentBrandFallback() && isDatabaseUnavailable(error)) {
      const brand = findDevelopmentBrand(loadDevelopmentBrandCatalog(), slug);
      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      console.log("Brand detail is using the local development catalog because MySQL is unavailable.");
      return res.json({
        brand: normalizeBrand(brand),
        products: [],
      });
    }

    moduleError(res, error, "Failed to load brand");
  }
}

export async function getAdminBrands(req, res) {
  return listBrands(req, res, { publicOnly: false });
}

export async function getAdminBrandDetail(req, res) {
  try {
    const rows = await dbQuery(
      `
        SELECT b.*, COUNT(p.id) AS product_count
        FROM brands b
        LEFT JOIN products p ON p.brand_id = b.id
        WHERE b.id = ?
        GROUP BY b.id
        LIMIT 1
      `,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Brand not found" });
    }

    const products = await dbQuery(
      `
        SELECT id, sku, name, price, stock_quantity, status
        FROM products
        WHERE brand_id = ?
        ORDER BY updated_at DESC
        LIMIT 50
      `,
      [req.params.id]
    );

    res.json({
      brand: normalizeBrand(rows[0]),
      products,
    });
  } catch (error) {
    moduleError(res, error, "Failed to load brand detail");
  }
}

export async function createAdminBrand(req, res) {
  const payload = normalizeBrandPayload(req.body);
  const validationMessage = validateBrandPayload(payload);

  if (validationMessage) {
    return res.status(400).json({ message: validationMessage });
  }

  try {
    const result = await dbQuery(
      `
        INSERT INTO brands (
          name, slug, logo, banner, description, meta_title, meta_description,
          website_url, featured, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.name,
        payload.slug,
        payload.logo || null,
        payload.banner || null,
        payload.description || null,
        payload.metaTitle || null,
        payload.metaDescription || null,
        payload.websiteUrl || null,
        payload.featured,
        payload.status,
      ]
    );

    await logBrandActivity(req, "Created brand", payload.name);
    res.status(201).json({
      message: "Brand created successfully",
      brand: { id: result.insertId, ...payload },
    });
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Brand slug already exists" });
    }

    moduleError(res, error, "Failed to create brand");
  }
}

export async function updateAdminBrand(req, res) {
  const payload = normalizeBrandPayload(req.body);
  const validationMessage = validateBrandPayload(payload);

  if (validationMessage) {
    return res.status(400).json({ message: validationMessage });
  }

  try {
    const result = await dbQuery(
      `
        UPDATE brands
        SET
          name = ?,
          slug = ?,
          logo = ?,
          banner = ?,
          description = ?,
          meta_title = ?,
          meta_description = ?,
          website_url = ?,
          featured = ?,
          status = ?
        WHERE id = ?
      `,
      [
        payload.name,
        payload.slug,
        payload.logo || null,
        payload.banner || null,
        payload.description || null,
        payload.metaTitle || null,
        payload.metaDescription || null,
        payload.websiteUrl || null,
        payload.featured,
        payload.status,
        req.params.id,
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Brand not found" });
    }

    await logBrandActivity(req, "Updated brand", payload.name);
    res.json({ message: "Brand updated successfully" });
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Brand slug already exists" });
    }

    moduleError(res, error, "Failed to update brand");
  }
}

export async function updateAdminBrandStatus(req, res) {
  const status = cleanString(req.body?.status) || "Inactive";

  try {
    await dbQuery("UPDATE brands SET status = ? WHERE id = ?", [status, req.params.id]);
    await logBrandActivity(req, "Changed brand status", `Brand ${req.params.id}: ${status}`);
    res.json({ message: "Brand status updated" });
  } catch (error) {
    moduleError(res, error, "Failed to update brand status");
  }
}

export async function updateAdminBrandFeatured(req, res) {
  const featured = Boolean(req.body?.featured);

  try {
    await dbQuery("UPDATE brands SET featured = ? WHERE id = ?", [featured, req.params.id]);
    await logBrandActivity(req, "Changed brand featured flag", `Brand ${req.params.id}: ${featured}`);
    res.json({ message: "Brand featured flag updated" });
  } catch (error) {
    moduleError(res, error, "Failed to update brand featured flag");
  }
}

export async function deleteAdminBrand(req, res) {
  try {
    await dbQuery("UPDATE brands SET deleted_at = NOW(), status = 'Inactive' WHERE id = ?", [req.params.id]);
    await logBrandActivity(req, "Deleted brand", `Brand ${req.params.id}`);
    res.json({ message: "Brand deleted" });
  } catch (error) {
    moduleError(res, error, "Failed to delete brand");
  }
}

export async function restoreAdminBrand(req, res) {
  try {
    await dbQuery("UPDATE brands SET deleted_at = NULL, status = 'Active' WHERE id = ?", [req.params.id]);
    await logBrandActivity(req, "Restored brand", `Brand ${req.params.id}`);
    res.json({ message: "Brand restored" });
  } catch (error) {
    moduleError(res, error, "Failed to restore brand");
  }
}
