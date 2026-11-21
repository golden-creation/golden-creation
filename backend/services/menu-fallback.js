import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const menuPath = join(dirname(fileURLToPath(import.meta.url)), "../data/dev-navbar-menu.json");

export function canUseDevelopmentMenuFallback() {
  return process.env.NODE_ENV !== "production" && process.env.MENU_DB_FALLBACK !== "false";
}

export function loadDevelopmentNavbar() {
  const payload = JSON.parse(readFileSync(menuPath, "utf8"));
  return Array.isArray(payload?.menus) ? payload.menus : [];
}
