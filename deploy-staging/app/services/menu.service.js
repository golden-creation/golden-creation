import { cleanString, dbQuery, slugify } from "./merchandising.service.js";

export { cleanString, dbQuery };

const staticPages = {
  home: "/home",
  products: "/writing-essentials",
  brands: "/brands",
  cart: "/cart",
  orders: "/orders",
  about: "/about",
  contact: "/contact",
  blog: "/blog",
  faqs: "/faqs",
  "bundle-kits": "/bundle-kits",
  "shipping-policy": "/shipping-policy",
  "return-policy": "/return-policy",
  "privacy-policy": "/privacy-policy",
  "terms-and-conditions": "/terms-and-conditions",
};

export function normalizeMenu(row = {}) {
  return {
    ...row,
    id: Number(row.id || 0),
    reference_id: row.reference_id == null ? null : Number(row.reference_id),
    parent_id: row.parent_id == null ? null : Number(row.parent_id),
    mega_menu: Boolean(row.mega_menu),
    sort_order: Number(row.sort_order || 0),
    children: [],
  };
}

export function normalizeMenuPayload(body = {}) {
  const type = cleanString(body.type || "custom").toLowerCase();

  return {
    title: cleanString(body.title),
    type: ["category", "collection", "brand", "page", "custom"].includes(type) ? type : "custom",
    referenceId: Number(body.reference_id ?? body.referenceId) || null,
    url: cleanString(body.url),
    icon: cleanString(body.icon),
    image: cleanString(body.image),
    parentId: Number(body.parent_id ?? body.parentId) || null,
    megaMenu: Boolean(body.mega_menu ?? body.megaMenu),
    sortOrder: Number(body.sort_order ?? body.sortOrder ?? 0) || 0,
    visibility: cleanString(body.visibility) || "Visible",
  };
}

export function validateMenuPayload(payload) {
  if (!payload.title) return "Menu title is required";
  if (["category", "collection", "brand"].includes(payload.type) && !payload.referenceId) {
    return "Select a linked item for this menu type";
  }
  if (payload.type === "custom" && !payload.url) return "Custom URL is required";
  if (payload.type === "page" && !payload.url) return "Select or enter a page URL";
  return "";
}

export async function resolveMenuUrl(payload) {
  if (payload.type === "category") {
    const rows = await dbQuery("SELECT id FROM categories WHERE id = ? LIMIT 1", [payload.referenceId]);
    return rows.length ? `/writing-essentials?category=${payload.referenceId}` : payload.url;
  }

  if (payload.type === "collection") {
    const rows = await dbQuery("SELECT slug FROM collections WHERE id = ? LIMIT 1", [payload.referenceId]);
    return rows[0]?.slug ? `/collections/${rows[0].slug}` : payload.url;
  }

  if (payload.type === "brand") {
    const rows = await dbQuery("SELECT slug FROM brands WHERE id = ? LIMIT 1", [payload.referenceId]);
    return rows[0]?.slug ? `/brand/${rows[0].slug}` : payload.url;
  }

  if (payload.type === "page") {
    return staticPages[slugify(payload.url)] || payload.url;
  }

  return payload.url;
}

export function buildMenuTree(rows = []) {
  const byId = new Map();
  const roots = [];

  rows.map(normalizeMenu).forEach((item) => byId.set(item.id, item));

  for (const item of byId.values()) {
    if (item.parent_id && byId.has(item.parent_id)) {
      byId.get(item.parent_id).children.push(item);
    } else {
      roots.push(item);
    }
  }

  const sortTree = (items) =>
    items
      .sort((left, right) => left.sort_order - right.sort_order || left.title.localeCompare(right.title))
      .map((item) => ({ ...item, children: sortTree(item.children || []) }));

  return sortTree(roots);
}

export async function getMenuRows({ admin = false } = {}) {
  const where = admin ? "deleted_at IS NULL" : "deleted_at IS NULL AND visibility = 'Visible'";

  return dbQuery(
    `
      SELECT *
      FROM menus
      WHERE ${where}
      ORDER BY COALESCE(parent_id, 0), sort_order, title
    `
  );
}

export function getStaticPages() {
  return Object.entries(staticPages).map(([key, url]) => ({
    key,
    title: key.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    url,
  }));
}
