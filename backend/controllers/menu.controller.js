import { isDatabaseUnavailable } from "../services/brand-fallback.js";
import {
  canUseDevelopmentMenuFallback,
  loadDevelopmentNavbar,
} from "../services/menu-fallback.js";
import {
  buildMenuTree,
  cleanString,
  dbQuery,
  getMenuRows,
  getStaticPages,
  normalizeMenu,
  normalizeMenuPayload,
  resolveMenuUrl,
  validateMenuPayload,
} from "../services/menu.service.js";

let cachedNavbar = null;
let cachedNavbarAt = 0;
const cacheTtlMs = 60 * 1000;

function clearMenuCache() {
  cachedNavbar = null;
  cachedNavbarAt = 0;
}

function removeBrandPenItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => {
      const title = String(item?.title || "").trim().toLowerCase();
      const url = String(item?.url || "").toLowerCase();
      return title !== "brand pen" && !url.includes("category=440");
    })
    .map((item) => ({
      ...item,
      children: removeBrandPenItems(item.children),
    }));
}

function moduleError(res, error, message) {
  console.log(`${message}:`, error);
  res.status(500).json({ message });
}

async function logMenuActivity(req, action, detail) {
  try {
    await dbQuery(
      `
        INSERT INTO admin_activity (admin_id, actor, action, module, detail)
        VALUES (?, ?, ?, 'Menu Management', ?)
      `,
      [
        req.admin?.id || null,
        req.admin?.name || req.admin?.email || "Admin",
        action,
        detail,
      ]
    );
  } catch (error) {
    console.log("Menu activity skipped:", error.message);
  }
}

export async function getNavbarMenus(_req, res) {
  try {
    const now = Date.now();
    if (cachedNavbar && now - cachedNavbarAt < cacheTtlMs) {
      return res.json(cachedNavbar);
    }

    const rows = await getMenuRows();
    cachedNavbar = { menus: removeBrandPenItems(buildMenuTree(rows)), cached: false };
    cachedNavbarAt = now;
    res.json(cachedNavbar);
  } catch (error) {
    if (canUseDevelopmentMenuFallback() && isDatabaseUnavailable(error)) {
      console.log("Navbar is using the local development menu because MySQL is unavailable.");
      return res.json({ menus: loadDevelopmentNavbar(), cached: false });
    }

    moduleError(res, error, "Failed to load menu");
  }
}

export async function getAdminMenus(_req, res) {
  try {
    const rows = await getMenuRows({ admin: true });
    res.json({
      menus: rows.map(normalizeMenu),
      tree: buildMenuTree(rows),
      pages: getStaticPages(),
    });
  } catch (error) {
    moduleError(res, error, "Failed to load menus");
  }
}

export async function getMenuReferences(_req, res) {
  try {
    const [categories, collections, brands] = await Promise.all([
      dbQuery("SELECT id, name AS title FROM categories WHERE COALESCE(status, 'Active') = 'Active' ORDER BY name"),
      dbQuery("SELECT id, name AS title, slug FROM collections WHERE deleted_at IS NULL AND status = 'Active' ORDER BY name"),
      dbQuery("SELECT id, name AS title, slug FROM brands WHERE deleted_at IS NULL AND status = 'Active' ORDER BY name"),
    ]);

    res.json({
      categories,
      collections,
      brands,
      pages: getStaticPages(),
    });
  } catch (error) {
    moduleError(res, error, "Failed to load menu references");
  }
}

export async function createAdminMenu(req, res) {
  const payload = normalizeMenuPayload(req.body);
  const validation = validateMenuPayload(payload);

  if (validation) return res.status(400).json({ message: validation });

  try {
    const url = await resolveMenuUrl(payload);
    const result = await dbQuery(
      `
        INSERT INTO menus (
          title, type, reference_id, url, icon, image, parent_id,
          mega_menu, sort_order, visibility
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.title,
        payload.type,
        payload.referenceId,
        url,
        payload.icon || null,
        payload.image || null,
        payload.parentId,
        payload.megaMenu,
        payload.sortOrder,
        payload.visibility,
      ]
    );

    clearMenuCache();
    await logMenuActivity(req, "Created menu item", payload.title);
    res.status(201).json({ message: "Menu item created", menu: { id: result.insertId, ...payload, url } });
  } catch (error) {
    moduleError(res, error, "Failed to create menu item");
  }
}

export async function updateAdminMenu(req, res) {
  const payload = normalizeMenuPayload(req.body);
  const validation = validateMenuPayload(payload);
  const id = Number(req.params.id);

  if (!id) return res.status(400).json({ message: "Invalid menu id" });
  if (validation) return res.status(400).json({ message: validation });
  if (payload.parentId === id) return res.status(400).json({ message: "Menu cannot be its own parent" });

  try {
    const url = await resolveMenuUrl(payload);
    const result = await dbQuery(
      `
        UPDATE menus
        SET
          title = ?,
          type = ?,
          reference_id = ?,
          url = ?,
          icon = ?,
          image = ?,
          parent_id = ?,
          mega_menu = ?,
          sort_order = ?,
          visibility = ?
        WHERE id = ? AND deleted_at IS NULL
      `,
      [
        payload.title,
        payload.type,
        payload.referenceId,
        url,
        payload.icon || null,
        payload.image || null,
        payload.parentId,
        payload.megaMenu,
        payload.sortOrder,
        payload.visibility,
        id,
      ]
    );

    if (!result.affectedRows) return res.status(404).json({ message: "Menu item not found" });

    clearMenuCache();
    await logMenuActivity(req, "Updated menu item", payload.title);
    res.json({ message: "Menu item updated" });
  } catch (error) {
    moduleError(res, error, "Failed to update menu item");
  }
}

export async function deleteAdminMenu(req, res) {
  try {
    await dbQuery("UPDATE menus SET deleted_at = NOW(), visibility = 'Hidden' WHERE id = ? OR parent_id = ?", [req.params.id, req.params.id]);
    clearMenuCache();
    await logMenuActivity(req, "Deleted menu item", `Menu ${req.params.id}`);
    res.json({ message: "Menu item deleted" });
  } catch (error) {
    moduleError(res, error, "Failed to delete menu item");
  }
}

export async function reorderAdminMenus(req, res) {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];

  if (!items.length) return res.status(400).json({ message: "No menu order supplied" });

  try {
    for (const item of items) {
      const id = Number(item.id);
      if (!id) continue;
      await dbQuery(
        "UPDATE menus SET sort_order = ?, parent_id = ? WHERE id = ?",
        [
          Number(item.sort_order ?? item.sortOrder ?? 0) || 0,
          Number(item.parent_id ?? item.parentId) || null,
          id,
        ]
      );
    }

    clearMenuCache();
    await logMenuActivity(req, "Reordered menu items", `${items.length} items`);
    res.json({ message: "Menu order updated" });
  } catch (error) {
    moduleError(res, error, "Failed to reorder menu items");
  }
}

export async function duplicateAdminMenu(req, res) {
  try {
    const rows = await dbQuery("SELECT * FROM menus WHERE id = ? AND deleted_at IS NULL LIMIT 1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: "Menu item not found" });

    const item = rows[0];
    const result = await dbQuery(
      `
        INSERT INTO menus (
          title, type, reference_id, url, icon, image, parent_id,
          mega_menu, sort_order, visibility
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        `${cleanString(item.title)} Copy`,
        item.type,
        item.reference_id,
        item.url,
        item.icon,
        item.image,
        item.parent_id,
        item.mega_menu,
        Number(item.sort_order || 0) + 1,
        item.visibility,
      ]
    );

    clearMenuCache();
    await logMenuActivity(req, "Duplicated menu item", item.title);
    res.status(201).json({ message: "Menu item duplicated", id: result.insertId });
  } catch (error) {
    moduleError(res, error, "Failed to duplicate menu item");
  }
}
