import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveBrandListLimit } from "./brand-query.js";

const catalogPath = join(dirname(fileURLToPath(import.meta.url)), "../data/dev-brand-catalog.json");

const unavailableCodes = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
  "ER_ACCESS_DENIED_ERROR",
  "ER_BAD_DB_ERROR",
  "ER_DBACCESS_DENIED_ERROR",
]);

export function isDatabaseUnavailable(error) {
  if (!error) return false;
  if (unavailableCodes.has(error.code)) return true;
  if (Array.isArray(error.errors) && error.errors.some((item) => unavailableCodes.has(item?.code))) {
    return true;
  }
  return false;
}

export function canUseDevelopmentBrandFallback() {
  return process.env.NODE_ENV !== "production" && process.env.BRAND_DB_FALLBACK !== "false";
}

export function loadDevelopmentBrandCatalog() {
  const payload = JSON.parse(readFileSync(catalogPath, "utf8"));
  return Array.isArray(payload?.brands) ? payload.brands : [];
}

function compareNames(left, right) {
  return String(left || "").localeCompare(String(right || ""), "en", {
    sensitivity: "base",
    numeric: true,
  });
}

export function queryDevelopmentBrands(catalog, query = {}, { publicOnly = false, featuredOnly = false } = {}) {
  let brands = (catalog || []).filter((brand) => !brand.deleted_at);

  const status = publicOnly ? "Active" : query.status;
  if (status) {
    brands = brands.filter((brand) => String(brand.status || "") === String(status));
  }

  if (featuredOnly || query.featured === true || query.featured === "true") {
    brands = brands.filter((brand) => Boolean(brand.featured));
  }

  const term = String(query.q || query.search || "").trim().toLowerCase();
  if (term) {
    brands = brands.filter((brand) =>
      `${brand.name || ""} ${brand.slug || ""} ${brand.description || ""}`.toLowerCase().includes(term)
    );
  }

  brands.sort((left, right) => {
    if (query.sort === "products") {
      return Number(right.product_count || 0) - Number(left.product_count || 0) || compareNames(left.name, right.name);
    }
    if (query.sort === "newest") {
      return String(right.created_at || "").localeCompare(String(left.created_at || ""));
    }
    if (query.sort === "name") {
      return compareNames(left.name, right.name);
    }
    return Number(Boolean(right.featured)) - Number(Boolean(left.featured)) || compareNames(left.name, right.name);
  });

  const page = Math.max(1, Number(query.page) || 1);
  const limit = resolveBrandListLimit(query.limit);
  const start = (page - 1) * limit;

  return {
    brands: brands.slice(start, start + limit).map((brand) => ({
      ...brand,
      id: Number(brand.id || 0),
      featured: Boolean(brand.featured),
      product_count: Number(brand.product_count || 0),
    })),
    pagination: {
      page,
      limit,
      total: brands.length,
    },
  };
}

export function findDevelopmentBrand(catalog, slug) {
  const key = String(slug || "").trim().toLowerCase();
  return (catalog || []).find(
    (brand) =>
      String(brand.slug || "").toLowerCase() === key &&
      String(brand.status || "Active") === "Active" &&
      !brand.deleted_at
  ) || null;
}
