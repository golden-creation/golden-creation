import { dbQuery } from "../services/commerce.service.js";

export async function getContentPage(req, res) {
  try {
    const rows = await dbQuery(
      `SELECT slug, title, body, metadata, updated_at
         FROM content_pages
        WHERE slug = ? AND status = 'Published'
        LIMIT 1`,
      [String(req.params.slug || "").trim()]
    );
    if (!rows.length) return res.status(404).json({ message: "Content page not found" });
    const page = rows[0];
    try {
      page.metadata = typeof page.metadata === "string" ? JSON.parse(page.metadata) : page.metadata || {};
    } catch {
      page.metadata = {};
    }
    res.json({ page });
  } catch {
    res.status(500).json({ message: "Unable to load content page" });
  }
}
