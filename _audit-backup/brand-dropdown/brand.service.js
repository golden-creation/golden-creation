import db from "../config/db.js";

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

export function cleanString(value) {
  return String(value || "").trim();
}

export function slugify(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function normalizeBrand(row = {}) {
  return {
    ...row,
    id: Number(row.id || 0),
    featured: Boolean(row.featured),
    product_count: Number(row.product_count || 0),
  };
}

export function normalizeBrandPayload(body = {}) {
  const name = cleanString(body.name);
  const slug = slugify(body.slug || name);

  return {
    name,
    slug,
    logo: cleanString(body.logo),
    banner: cleanString(body.banner),
    description: cleanString(body.description),
    metaTitle: cleanString(body.meta_title || body.metaTitle),
    metaDescription: cleanString(body.meta_description || body.metaDescription),
    websiteUrl: cleanString(body.website_url || body.websiteUrl),
    featured: Boolean(body.featured),
    status: cleanString(body.status) || "Active",
  };
}

export function validateBrandPayload(payload) {
  if (!payload.name) {
    return "Brand name is required";
  }

  if (!payload.slug) {
    return "Brand slug is required";
  }

  if (payload.websiteUrl && !/^https?:\/\//i.test(payload.websiteUrl)) {
    return "Website URL must start with http:// or https://";
  }

  for (const [field, value] of [
    ["Logo", payload.logo],
    ["Banner", payload.banner],
  ]) {
    if (!value) continue;
    const isAllowed =
      /^https?:\/\//i.test(value) ||
      /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value) ||
      /^[\w./-]+\.(png|jpe?g|webp|gif|avif)$/i.test(value);

    if (!isAllowed) {
      return `${field} must be an image URL, image filename, or base64 image`;
    }
  }

  return "";
}
