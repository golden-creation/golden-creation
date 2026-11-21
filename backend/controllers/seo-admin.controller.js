import { dbQuery } from "../services/commerce.service.js";
import {
  SEO_SCRIPT_SLOTS,
  ensureProductSlug,
  getSeoScripts,
  getSeoSettings,
  saveSeoSettings,
  seoAuditSummary,
  slugify,
  upsertSeoScript,
  deleteSeoScript,
} from "../services/seo.service.js";

function clean(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function logActivity(req, action, detail) {
  await dbQuery(
    `INSERT INTO admin_activity (admin_id, actor, action, module, detail)
     VALUES (?, ?, ?, 'SEO & Marketing', ?)`,
    [req.admin?.id || null, req.admin?.email || "System", action, detail || ""]
  ).catch(() => {});
}

export async function getAdminSeoSettings(_req, res) {
  try {
    res.json({ settings: await getSeoSettings(), scriptSlots: SEO_SCRIPT_SLOTS });
  } catch (error) {
    res.status(500).json({ message: error.message || "Unable to load SEO settings" });
  }
}

export async function updateAdminSeoSettings(req, res) {
  try {
    const settings = await saveSeoSettings(req.body?.settings || req.body || {}, req.admin?.id);
    await logActivity(req, "Updated SEO settings", "Global SEO settings saved");
    res.json({ message: "SEO settings updated", settings });
  } catch (error) {
    res.status(400).json({ message: error.message || "Unable to update SEO settings" });
  }
}

export async function getAdminSeoScripts(_req, res) {
  try {
    res.json({ scripts: await getSeoScripts({ includeInactive: true }), scriptSlots: SEO_SCRIPT_SLOTS });
  } catch (error) {
    res.status(500).json({ message: error.message || "Unable to load SEO scripts" });
  }
}

export async function saveAdminSeoScript(req, res) {
  try {
    const script = await upsertSeoScript({ ...req.body, id: req.params.id || req.body?.id }, req.admin?.id);
    await logActivity(req, script.id ? "Saved SEO script" : "Created SEO script", clean(req.body?.name));
    res.status(req.params.id ? 200 : 201).json({ message: "SEO script saved", script });
  } catch (error) {
    res.status(400).json({ message: error.message || "Unable to save SEO script" });
  }
}

export async function removeAdminSeoScript(req, res) {
  try {
    await deleteSeoScript(req.params.id);
    await logActivity(req, "Disabled SEO script", `Script ${req.params.id}`);
    res.json({ message: "SEO script disabled" });
  } catch (error) {
    res.status(400).json({ message: error.message || "Unable to disable SEO script" });
  }
}

export async function getAdminProductSeo(req, res) {
  try {
    const id = number(req.params.id);
    const rows = await dbQuery(
      `SELECT id, name, slug, meta_title, meta_description, seo_description, focus_keyword,
              search_keywords, canonical_url, robots_directive, og_image, schema_override_json
         FROM products WHERE id=? LIMIT 1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: "Product not found" });
    const images = await dbQuery(
      `SELECT id, image_url, alt_text, title_text, caption, description, seo_filename, sort_order, storage_key
         FROM product_images
        WHERE product_id=?
        ORDER BY sort_order ASC, id ASC`,
      [id]
    );
    res.json({ product: { ...rows[0], images }, images });
  } catch (error) {
    res.status(500).json({ message: error.message || "Unable to load product SEO" });
  }
}

export async function updateAdminProductSeo(req, res) {
  try {
    const id = number(req.params.id);
    const productRows = await dbQuery("SELECT id, name FROM products WHERE id=? LIMIT 1", [id]);
    if (!productRows.length) return res.status(404).json({ message: "Product not found" });
    const slug = await ensureProductSlug(id, productRows[0].name, req.body?.slug);
    await dbQuery(
      `UPDATE products
          SET slug=?, meta_title=?, meta_description=?, seo_description=?, focus_keyword=?,
              search_keywords=?, canonical_url=?, robots_directive=?, og_image=?, schema_override_json=?
        WHERE id=?`,
      [
        slug,
        clean(req.body?.metaTitle || req.body?.meta_title).slice(0, 190) || null,
        clean(req.body?.metaDescription || req.body?.meta_description) || null,
        clean(req.body?.seoDescription || req.body?.seo_description) || null,
        clean(req.body?.focusKeyword || req.body?.focus_keyword).slice(0, 190) || null,
        clean(req.body?.searchKeywords || req.body?.search_keywords) || null,
        clean(req.body?.canonicalUrl || req.body?.canonical_url) || null,
        clean(req.body?.robotsDirective || req.body?.robots_directive || "index,follow") || "index,follow",
        clean(req.body?.ogImage || req.body?.og_image) || null,
        clean(req.body?.schemaOverrideJson || req.body?.schema_override_json) || null,
        id,
      ]
    );

    const images = Array.isArray(req.body?.images) ? req.body.images : [];
    for (const [index, image] of images.entries()) {
      await dbQuery(
        `UPDATE product_images
            SET alt_text=?, title_text=?, caption=?, description=?, seo_filename=?, sort_order=?
          WHERE id=? AND product_id=?`,
        [
          clean(image.altText || image.alt_text) || null,
          clean(image.titleText || image.title_text) || null,
          clean(image.caption) || null,
          clean(image.description) || null,
          clean(image.seoFilename || image.seo_filename) || null,
          number(image.sortOrder ?? image.sort_order ?? index + 1),
          number(image.id),
          id,
        ]
      );
    }
    await logActivity(req, "Updated product SEO", `${productRows[0].name} (${id})`);
    res.json({ message: "Product SEO updated", slug });
  } catch (error) {
    res.status(400).json({ message: error.message || "Unable to update product SEO" });
  }
}

export async function getAdminBlogSeo(req, res) {
  try {
    const rows = await dbQuery(
      `SELECT id, slug, title, meta_title, meta_description, canonical_url, robots_directive,
              og_image, focus_keyword, schema_override_json
         FROM blog_posts WHERE id=? LIMIT 1`,
      [number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ message: "Blog post not found" });
    res.json({ blog: rows[0], post: rows[0] });
  } catch (error) {
    res.status(500).json({ message: error.message || "Unable to load blog SEO" });
  }
}

export async function updateAdminBlogSeo(req, res) {
  try {
    const id = number(req.params.id);
    const postRows = await dbQuery("SELECT id, title FROM blog_posts WHERE id=? LIMIT 1", [id]);
    if (!postRows.length) return res.status(404).json({ message: "Blog post not found" });
    await dbQuery(
      `UPDATE blog_posts
          SET slug=?, meta_title=?, meta_description=?, canonical_url=?, robots_directive=?,
              og_image=?, focus_keyword=?, schema_override_json=?
        WHERE id=?`,
      [
        slugify(req.body?.slug || postRows[0].title),
        clean(req.body?.metaTitle || req.body?.meta_title).slice(0, 190) || null,
        clean(req.body?.metaDescription || req.body?.meta_description) || null,
        clean(req.body?.canonicalUrl || req.body?.canonical_url) || null,
        clean(req.body?.robotsDirective || req.body?.robots_directive || "index,follow") || "index,follow",
        clean(req.body?.ogImage || req.body?.og_image) || null,
        clean(req.body?.focusKeyword || req.body?.focus_keyword).slice(0, 190) || null,
        clean(req.body?.schemaOverrideJson || req.body?.schema_override_json) || null,
        id,
      ]
    );
    await logActivity(req, "Updated blog SEO", `${postRows[0].title} (${id})`);
    res.json({ message: "Blog SEO updated" });
  } catch (error) {
    res.status(400).json({ message: error.message || "Unable to update blog SEO" });
  }
}

export async function getAdminMediaSeo(req, res) {
  try {
    const rows = await dbQuery(
      `SELECT id, storage_key, public_url, mime_type, alt_text, title_text, caption, description,
              seo_filename, width, height, owner_type, owner_id, status, created_at
         FROM media_assets
        WHERE id=? OR storage_key=?
        LIMIT 1`,
      [number(req.params.id), clean(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ message: "Media asset not found" });
    res.json({ media: rows[0] });
  } catch (error) {
    res.status(500).json({ message: error.message || "Unable to load media SEO" });
  }
}

export async function updateAdminMediaSeo(req, res) {
  try {
    await dbQuery(
      `UPDATE media_assets
          SET alt_text=?, title_text=?, caption=?, description=?, seo_filename=?, owner_type=?, owner_id=?
        WHERE id=? OR storage_key=?`,
      [
        clean(req.body?.altText || req.body?.alt_text) || null,
        clean(req.body?.titleText || req.body?.title_text) || null,
        clean(req.body?.caption) || null,
        clean(req.body?.description) || null,
        clean(req.body?.seoFilename || req.body?.seo_filename) || null,
        clean(req.body?.ownerType || req.body?.owner_type) || null,
        number(req.body?.ownerId || req.body?.owner_id) || null,
        number(req.params.id),
        clean(req.params.id),
      ]
    );
    await logActivity(req, "Updated media SEO", `Media ${req.params.id}`);
    res.json({ message: "Media SEO updated" });
  } catch (error) {
    res.status(400).json({ message: error.message || "Unable to update media SEO" });
  }
}

export async function getAdminSeoAudit(_req, res) {
  try {
    res.json({ audit: await seoAuditSummary() });
  } catch (error) {
    res.status(500).json({ message: error.message || "Unable to load SEO audit" });
  }
}

export async function getAdminSeoFeedStatus(_req, res) {
  try {
    const [products, activeProducts, images] = await Promise.all([
      dbQuery("SELECT COUNT(*) total FROM products WHERE deleted_at IS NULL").catch(() => [{ total: 0 }]),
      dbQuery("SELECT COUNT(*) total FROM products WHERE deleted_at IS NULL AND COALESCE(status,'Active')='Active'").catch(() => [{ total: 0 }]),
      dbQuery("SELECT COUNT(*) total FROM product_images").catch(() => [{ total: 0 }]),
    ]);
    const feeds = {
      googleMerchant: "/feeds/google-merchant.xml",
      metaCatalog: "/feeds/meta-catalog.csv",
      llms: "/llms.txt",
    };
    const counts = {
      products: number(products[0]?.total),
      activeProducts: number(activeProducts[0]?.total),
      productImages: number(images[0]?.total),
    };
    res.json({ feeds, counts, feedStatus: { feeds, counts } });
  } catch (error) {
    res.status(500).json({ message: error.message || "Unable to load feed status" });
  }
}
