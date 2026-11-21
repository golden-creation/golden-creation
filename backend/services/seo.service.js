import fs from "fs/promises";
import { dbQuery } from "./commerce.service.js";

const DEFAULT_BASE_URL = "https://goldencreation.in";
const INDEXABLE_ROBOTS = "index,follow";
const NON_INDEXABLE_ROBOTS = "noindex,follow";

export const SEO_SCRIPT_SLOTS = [
  "global_head",
  "body_start",
  "home",
  "product",
  "category",
  "collection",
  "brand",
  "blog",
  "checkout",
  "order_success",
];

export const DEFAULT_SEO_SETTINGS = {
  site_title: "Golden Creation",
  default_meta_title: "Golden Creation | Office Stationery & Gift Items",
  default_meta_description:
    "Shop office stationery, writing tools, school supplies, art materials, gifts, and premium pens from Golden Creation.",
  canonical_base_url: DEFAULT_BASE_URL,
  default_social_image: "",
  robots_default: INDEXABLE_ROBOTS,
  search_console_verification: "",
  gtm_container_id: "",
  ga4_measurement_id: "",
  google_ads_conversion_id: "",
  google_ads_purchase_label: "",
  google_merchant_center_id: "",
  meta_pixel_id: "",
  meta_capi_dataset_id: "",
  meta_catalog_id: "",
  merchant_feed_enabled: "true",
  meta_feed_enabled: "true",
  allow_ai_crawlers: "true",
};

function clean(value) {
  return String(value ?? "").trim();
}

export function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 180);
}

function htmlEscape(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function xmlEscape(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripHtml(value) {
  return clean(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(value, max = 160) {
  const text = stripHtml(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3).replace(/\s+\S*$/, "")}...`;
}

function safeJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isoDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function getBaseUrlFromSettings(settings, req) {
  const explicit =
    clean(settings.canonical_base_url) ||
    clean(process.env.SITE_BASE_URL) ||
    clean(process.env.PUBLIC_SITE_URL) ||
    clean(process.env.CANONICAL_SITE_URL);
  if (explicit) return explicit.replace(/\/$/, "");

  const host = clean(req?.headers?.["x-forwarded-host"] || req?.headers?.host);
  if (host && !/^admin\./i.test(host)) {
    const proto = clean(req?.headers?.["x-forwarded-proto"]) || req?.protocol || "https";
    return `${proto}://${host}`.replace(/\/$/, "");
  }

  return DEFAULT_BASE_URL;
}

export async function getSeoSettings() {
  const settings = { ...DEFAULT_SEO_SETTINGS };
  try {
    const rows = await dbQuery("SELECT setting_key, setting_value FROM seo_settings");
    rows.forEach((row) => {
      settings[row.setting_key] = row.setting_value ?? "";
    });
  } catch {
    return settings;
  }
  return settings;
}

export async function saveSeoSettings(values = {}, adminId = null) {
  const allowed = Object.keys(DEFAULT_SEO_SETTINGS);
  for (const key of allowed) {
    if (values[key] === undefined) continue;
    await dbQuery(
      `INSERT INTO seo_settings (setting_key, setting_value, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value), updated_by=VALUES(updated_by)`,
      [key, clean(values[key]), adminId]
    );
  }
  return getSeoSettings();
}

export async function getSeoScripts({ includeInactive = false } = {}) {
  const where = includeInactive ? "" : "WHERE status = 'Active'";
  try {
    return await dbQuery(
      `SELECT id, name, slot, content, status, version, created_by, updated_by, created_at, updated_at
       FROM seo_scripts ${where}
       ORDER BY FIELD(slot, ${SEO_SCRIPT_SLOTS.map(() => "?").join(",")}), name`,
      SEO_SCRIPT_SLOTS
    );
  } catch {
    return [];
  }
}

export async function upsertSeoScript(payload = {}, adminId = null) {
  const id = Number(payload.id || 0);
  const name = clean(payload.name);
  const slot = clean(payload.slot);
  const content = clean(payload.content);
  const status = clean(payload.status || "Active") === "Inactive" ? "Inactive" : "Active";

  if (!name) throw new Error("Script name is required");
  if (!SEO_SCRIPT_SLOTS.includes(slot)) throw new Error("Valid script slot is required");

  if (id) {
    const currentRows = await dbQuery("SELECT * FROM seo_scripts WHERE id=? LIMIT 1", [id]);
    if (!currentRows.length) throw new Error("SEO script not found");
    const version = Number(currentRows[0].version || 1) + 1;
    await dbQuery(
      `INSERT INTO seo_script_revisions (script_id, version, name, slot, content, status, changed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, version, name, slot, content, status, adminId]
    );
    await dbQuery(
      `UPDATE seo_scripts
          SET name=?, slot=?, content=?, status=?, version=?, updated_by=?
        WHERE id=?`,
      [name, slot, content, status, version, adminId, id]
    );
    return { id, version };
  }

  const result = await dbQuery(
    `INSERT INTO seo_scripts (name, slot, content, status, version, created_by, updated_by)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
    [name, slot, content, status, adminId, adminId]
  );
  await dbQuery(
    `INSERT INTO seo_script_revisions (script_id, version, name, slot, content, status, changed_by)
     VALUES (?, 1, ?, ?, ?, ?, ?)`,
    [result.insertId, name, slot, content, status, adminId]
  );
  return { id: result.insertId, version: 1 };
}

export async function deleteSeoScript(id) {
  const scriptId = Number(id);
  if (!scriptId) throw new Error("Valid script ID is required");
  await dbQuery("UPDATE seo_scripts SET status='Inactive' WHERE id=?", [scriptId]);
}

function publicImage(value, baseUrl = DEFAULT_BASE_URL) {
  const input = clean(value);
  if (!input) return "";
  if (/^https?:\/\//i.test(input)) return input;
  if (input.startsWith("/")) return `${baseUrl}${input}`;
  return `${baseUrl}/images/${input}`;
}

function productPath(product) {
  const slug = clean(product.slug) || `${slugify(product.name)}-${product.id}`;
  return `/product/${encodeURIComponent(slug)}`;
}

function categoryPath(category) {
  const slug = clean(category.slug) || `${slugify(category.name)}-${category.id}`;
  return `/category/${encodeURIComponent(slug)}`;
}

async function productImages(productId) {
  const rows = await dbQuery(
    `SELECT id, image_url, alt_text, title_text, caption, description, sort_order
       FROM product_images
      WHERE product_id=?
      ORDER BY sort_order ASC, id ASC`,
    [productId]
  );
  return rows;
}

async function loadProduct(identifier) {
  const value = clean(identifier);
  const numeric = /^\d+$/.test(value) ? Number(value) : 0;
  const rows = await dbQuery(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug, b.name AS brand_name, b.slug AS brand_slug,
            COALESCE(AVG(CASE WHEN pr.status='Published' THEN pr.rating END), 0) AS average_rating,
            COUNT(DISTINCT CASE WHEN pr.status='Published' THEN pr.id END) AS review_count
       FROM products p
       LEFT JOIN categories c ON c.id=p.category_id
       LEFT JOIN brands b ON b.id=p.brand_id
       LEFT JOIN product_reviews pr ON pr.product_id=p.id
      WHERE p.id=? OR p.slug=?
      GROUP BY p.id
      LIMIT 1`,
    [numeric, value]
  );
  if (!rows.length) return null;
  return { ...rows[0], images: await productImages(rows[0].id) };
}

async function loadCategory(identifier) {
  const value = clean(identifier);
  const numeric = /^\d+$/.test(value) ? Number(value) : 0;
  const rows = await dbQuery(
    "SELECT * FROM categories WHERE id=? OR slug=? LIMIT 1",
    [numeric, value]
  );
  return rows[0] || null;
}

async function loadBrand(slug) {
  const rows = await dbQuery("SELECT * FROM brands WHERE slug=? AND deleted_at IS NULL LIMIT 1", [slugify(slug)]);
  return rows[0] || null;
}

async function loadCollection(slug) {
  const rows = await dbQuery("SELECT * FROM collections WHERE slug=? AND deleted_at IS NULL LIMIT 1", [slugify(slug)]);
  return rows[0] || null;
}

async function loadBundle(slug) {
  const rows = await dbQuery("SELECT * FROM bundle_products WHERE slug=? LIMIT 1", [slugify(slug)]);
  return rows[0] || null;
}

async function loadBlog(slug) {
  const rows = await dbQuery("SELECT * FROM blog_posts WHERE slug=? AND status='Published' LIMIT 1", [slugify(slug)]);
  return rows[0] || null;
}

function gtmHead(containerId) {
  const id = clean(containerId);
  if (!/^GTM-[A-Z0-9]+$/i.test(id)) return "";
  return `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${htmlEscape(id)}');</script>`;
}

function gtmBody(containerId) {
  const id = clean(containerId);
  if (!/^GTM-[A-Z0-9]+$/i.test(id)) return "";
  return `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${htmlEscape(id)}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;
}

function metaTags(seo) {
  const tags = [
    `<title>${htmlEscape(seo.title)}</title>`,
    `<meta name="description" content="${htmlEscape(seo.description)}">`,
    `<link rel="canonical" href="${htmlEscape(seo.canonical)}">`,
    `<meta name="robots" content="${htmlEscape(seo.robots || INDEXABLE_ROBOTS)}">`,
    `<meta property="og:type" content="${htmlEscape(seo.ogType || "website")}">`,
    `<meta property="og:title" content="${htmlEscape(seo.title)}">`,
    `<meta property="og:description" content="${htmlEscape(seo.description)}">`,
    `<meta property="og:url" content="${htmlEscape(seo.canonical)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${htmlEscape(seo.title)}">`,
    `<meta name="twitter:description" content="${htmlEscape(seo.description)}">`,
  ];
  if (seo.image) {
    tags.push(`<meta property="og:image" content="${htmlEscape(seo.image)}">`);
    tags.push(`<meta name="twitter:image" content="${htmlEscape(seo.image)}">`);
  }
  if (seo.verification) {
    tags.push(`<meta name="google-site-verification" content="${htmlEscape(seo.verification)}">`);
  }
  (seo.jsonLd || []).filter(Boolean).forEach((schema) => {
    tags.push(`<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`);
  });
  return tags.join("\n");
}

function organizationSchema(baseUrl, settings) {
  const logo = publicImage(settings.default_social_image, baseUrl);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Golden Creation",
    url: baseUrl,
    ...(logo ? { logo } : {}),
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+91-9599090630",
      contactType: "customer support",
      areaServed: "IN",
    },
  };
}

function websiteSchema(baseUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Golden Creation",
    url: baseUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${baseUrl}/all-products?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

function breadcrumbSchema(baseUrl, items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${baseUrl}${item.path}`,
    })),
  };
}

function productSchema(baseUrl, product, imageUrls) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: truncate(product.seo_description || product.description, 5000),
    sku: product.sku || String(product.id),
    ...(product.barcode ? { gtin: product.barcode } : {}),
    ...(product.brand_name ? { brand: { "@type": "Brand", name: product.brand_name } } : {}),
    ...(imageUrls.length ? { image: imageUrls } : {}),
    category: product.category_name || undefined,
    offers: {
      "@type": "Offer",
      url: `${baseUrl}${productPath(product)}`,
      priceCurrency: "INR",
      price: Number(product.price || 0).toFixed(2),
      availability: Number(product.stock_quantity || 0) > 0
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };
  if (Number(product.review_count || 0) > 0) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(product.average_rating || 0).toFixed(1),
      reviewCount: Number(product.review_count || 0),
    };
  }
  return schema;
}

function articleSchema(baseUrl, post, image) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: truncate(post.meta_description || post.excerpt || post.content, 220),
    url: `${baseUrl}/blog/${post.slug}`,
    datePublished: isoDate(post.published_at || post.created_at),
    dateModified: isoDate(post.updated_at || post.published_at || post.created_at),
    author: { "@type": "Person", name: post.author || "Golden Creation" },
    publisher: { "@type": "Organization", name: "Golden Creation" },
    ...(image ? { image } : {}),
  };
  if (post.featured_media_type === "video" && post.featured_video_url) {
    schema.video = {
      "@type": "VideoObject",
      name: post.title,
      description: truncate(post.meta_description || post.excerpt || post.content, 220),
      thumbnailUrl: image ? [image] : undefined,
      uploadDate: isoDate(post.published_at || post.created_at),
      contentUrl: post.featured_video_url,
    };
  }
  return schema;
}

function mergeSchemaOverride(defaultSchema, overrideJson) {
  const override = safeJson(overrideJson);
  if (!override || typeof override !== "object") return defaultSchema;
  return { ...defaultSchema, ...override };
}

export async function buildSeoForRequest(req) {
  const settings = await getSeoSettings();
  const baseUrl = getBaseUrlFromSettings(settings, req);
  const url = new URL(req.originalUrl || req.url || "/", baseUrl);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const scripts = await getSeoScripts();
  const slots = new Set(["global_head"]);
  const bodySlots = new Set(["body_start"]);
  const baseJsonLd = [organizationSchema(baseUrl, settings), websiteSchema(baseUrl)];
  const base = {
    title: settings.default_meta_title,
    description: settings.default_meta_description,
    canonical: `${baseUrl}${path}`,
    robots: settings.robots_default || INDEXABLE_ROBOTS,
    image: publicImage(settings.default_social_image, baseUrl),
    ogType: "website",
    verification: settings.search_console_verification,
    jsonLd: baseJsonLd,
    headScripts: "",
    bodyScripts: "",
  };

  if (url.search) {
    base.robots = NON_INDEXABLE_ROBOTS;
    base.canonical = `${baseUrl}${path}`;
  }

  if (path === "/") {
    slots.add("home");
    base.canonical = `${baseUrl}/`;
  } else if (path.startsWith("/product/")) {
    const product = await loadProduct(decodeURIComponent(path.split("/").pop()));
    if (product) {
      slots.add("product");
      const images = product.images.map((image) => publicImage(image.image_url, baseUrl)).filter(Boolean);
      const image = publicImage(product.og_image || product.image || images[0] || settings.default_social_image, baseUrl);
      const canonical = clean(product.canonical_url) || `${baseUrl}${productPath(product)}`;
      const breadcrumbItems = [
        { name: "Home", path: "/" },
        { name: product.category_name || "Products", path: product.category_slug ? categoryPath({ id: product.category_id, slug: product.category_slug, name: product.category_name }) : "/all-products" },
        { name: product.name, path: productPath(product) },
      ];
      Object.assign(base, {
        title: product.meta_title || `${product.name} | Golden Creation`,
        description: truncate(product.meta_description || product.seo_description || product.description || `Buy ${product.name} from Golden Creation.`),
        canonical,
        robots: product.robots_directive || INDEXABLE_ROBOTS,
        image,
        ogType: "product",
        jsonLd: [
          ...baseJsonLd,
          mergeSchemaOverride(productSchema(baseUrl, product, images.length ? images : [image].filter(Boolean)), product.schema_override_json),
          breadcrumbSchema(baseUrl, breadcrumbItems),
        ],
        entity: { type: "product", id: product.id, canonicalPath: productPath(product) },
      });
    }
  } else if (path.startsWith("/category/")) {
    const category = await loadCategory(decodeURIComponent(path.split("/").pop()));
    if (category) {
      slots.add("category");
      Object.assign(base, {
        title: category.meta_title || `${category.name} | Golden Creation`,
        description: truncate(category.meta_description || category.description || `Shop ${category.name} products at Golden Creation.`),
        canonical: `${baseUrl}${categoryPath(category)}`,
        robots: category.robots_directive || INDEXABLE_ROBOTS,
        image: publicImage(category.og_image || category.image || settings.default_social_image, baseUrl),
        jsonLd: [...baseJsonLd, breadcrumbSchema(baseUrl, [{ name: "Home", path: "/" }, { name: category.name, path: categoryPath(category) }])],
      });
    }
  } else if (path.startsWith("/brand/")) {
    const brand = await loadBrand(decodeURIComponent(path.split("/").pop()));
    if (brand) {
      slots.add("brand");
      Object.assign(base, {
        title: brand.meta_title || `${brand.name} | Golden Creation`,
        description: truncate(brand.meta_description || brand.description || `Shop ${brand.name} products at Golden Creation.`),
        canonical: `${baseUrl}/brand/${brand.slug}`,
        image: publicImage(brand.banner || brand.logo || settings.default_social_image, baseUrl),
      });
    }
  } else if (path.startsWith("/collections/")) {
    const collection = await loadCollection(decodeURIComponent(path.split("/").pop()));
    if (collection) {
      slots.add("collection");
      Object.assign(base, {
        title: collection.seo_title || `${collection.name} | Golden Creation`,
        description: truncate(collection.seo_description || collection.description || `Shop ${collection.name} at Golden Creation.`),
        canonical: `${baseUrl}/collections/${collection.slug}`,
        image: publicImage(collection.banner || settings.default_social_image, baseUrl),
      });
    }
  } else if (path.startsWith("/bundles/")) {
    const bundle = await loadBundle(decodeURIComponent(path.split("/").pop()));
    if (bundle) {
      Object.assign(base, {
        title: `${bundle.name} | Golden Creation`,
        description: truncate(bundle.description || "Shop this Golden Creation bundle."),
        canonical: `${baseUrl}/bundles/${bundle.slug}`,
        image: publicImage(bundle.image || settings.default_social_image, baseUrl),
      });
    }
  } else if (path.startsWith("/blog/")) {
    const post = await loadBlog(decodeURIComponent(path.split("/").pop()));
    if (post) {
      slots.add("blog");
      const image = publicImage(post.og_image || post.video_poster || post.cover_image || settings.default_social_image, baseUrl);
      Object.assign(base, {
        title: post.meta_title || `${post.title} | Golden Creation Blog`,
        description: truncate(post.meta_description || post.excerpt || post.content),
        canonical: clean(post.canonical_url) || `${baseUrl}/blog/${post.slug}`,
        robots: post.robots_directive || INDEXABLE_ROBOTS,
        image,
        ogType: "article",
        jsonLd: [
          ...baseJsonLd,
          mergeSchemaOverride(articleSchema(baseUrl, post, image), post.schema_override_json),
          breadcrumbSchema(baseUrl, [{ name: "Home", path: "/" }, { name: "Blog", path: "/blog" }, { name: post.title, path: `/blog/${post.slug}` }]),
        ],
      });
    }
  } else {
    const titles = {
      "/all-products": "All Products | Golden Creation",
      "/writing-essentials": "Shop The Catalog | Golden Creation",
      "/brands": "Brands | Golden Creation",
      "/bundles": "Bundles | Golden Creation",
      "/blog": "Golden Creation Blog",
      "/about": "About Golden Creation",
      "/contact": "Contact Golden Creation",
      "/faqs": "FAQs | Golden Creation",
      "/corporate-orders": "Corporate Orders | Golden Creation",
      "/shipping-policy": "Shipping Policy | Golden Creation",
      "/return-policy": "Return Policy | Golden Creation",
      "/privacy-policy": "Privacy Policy | Golden Creation",
      "/terms-and-conditions": "Terms And Conditions | Golden Creation",
    };
    if (titles[path]) base.title = titles[path];
    if (path === "/checkout") slots.add("checkout");
    if (path === "/order-success") slots.add("order_success");
  }

  const scriptRows = scripts.filter((script) => slots.has(script.slot) || bodySlots.has(script.slot));
  base.headScripts = [gtmHead(settings.gtm_container_id), ...scriptRows.filter((s) => slots.has(s.slot)).map((s) => s.content)].filter(Boolean).join("\n");
  base.bodyScripts = [gtmBody(settings.gtm_container_id), ...scriptRows.filter((s) => bodySlots.has(s.slot)).map((s) => s.content)].filter(Boolean).join("\n");
  return base;
}

export async function renderSeoHtml(req, indexPath) {
  const html = await fs.readFile(indexPath, "utf8");
  const seo = await buildSeoForRequest(req);
  const cleaned = html
    .replace(/<title>.*?<\/title>/is, "")
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, "")
    .replace(/<meta\s+(?:property|name)=["'](?:og:|twitter:)[^>]*>/gi, "");
  return cleaned
    .replace("</head>", `${metaTags(seo)}\n${seo.headScripts}\n</head>`)
    .replace(/<body([^>]*)>/i, `<body$1>\n${seo.bodyScripts}`);
}

function sitemapUrl(baseUrl, path, lastmod, changefreq = "weekly", images = []) {
  const imageXml = images
    .filter(Boolean)
    .map((image) => {
      const loc = typeof image === "string" ? image : image.loc;
      const title = typeof image === "string" ? "" : image.title;
      const caption = typeof image === "string" ? "" : image.caption;
      return [
        "    <image:image>",
        `      <image:loc>${xmlEscape(loc)}</image:loc>`,
        title ? `      <image:title>${xmlEscape(title)}</image:title>` : "",
        caption ? `      <image:caption>${xmlEscape(caption)}</image:caption>` : "",
        "    </image:image>",
      ].filter(Boolean).join("\n");
    })
    .join("\n");
  return [
    "  <url>",
    `    <loc>${xmlEscape(`${baseUrl}${path}`)}</loc>`,
    `    <lastmod>${xmlEscape(isoDate(lastmod))}</lastmod>`,
    `    <changefreq>${xmlEscape(changefreq)}</changefreq>`,
    imageXml,
    "  </url>",
  ].filter(Boolean).join("\n");
}

function sitemapDocument(entries, withImages = false) {
  const imageNs = withImages ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : "";
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${imageNs}>`,
    ...entries,
    "</urlset>",
    "",
  ].join("\n");
}

export async function buildSitemap(req, type = "index") {
  const settings = await getSeoSettings();
  const baseUrl = getBaseUrlFromSettings(settings, req);
  if (type === "index") {
    const sitemapPaths = [
      "/sitemap-static.xml",
      "/sitemap-products-1.xml",
      "/sitemap-categories.xml",
      "/sitemap-brands.xml",
      "/sitemap-collections.xml",
      "/sitemap-bundles.xml",
      "/sitemap-blog.xml",
      "/sitemap-images.xml",
    ];
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...sitemapPaths.map((path) => `  <sitemap><loc>${xmlEscape(`${baseUrl}${path}`)}</loc><lastmod>${isoDate(new Date())}</lastmod></sitemap>`),
      "</sitemapindex>",
      "",
    ].join("\n");
  }

  const now = new Date();
  if (type === "static") {
    return sitemapDocument([
      ["/", "daily"],
      ["/all-products", "daily"],
      ["/brands", "weekly"],
      ["/bundles", "weekly"],
      ["/blog", "weekly"],
      ["/about", "monthly"],
      ["/contact", "monthly"],
      ["/faqs", "monthly"],
      ["/corporate-orders", "monthly"],
      ["/shipping-policy", "monthly"],
      ["/return-policy", "monthly"],
      ["/privacy-policy", "monthly"],
      ["/terms-and-conditions", "monthly"],
    ].map(([path, freq]) => sitemapUrl(baseUrl, path, now, freq)));
  }

  if (type === "products") {
    const rows = await dbQuery(
      `SELECT id, slug, name, image, COALESCE(updated_at, created_at) AS lastmod
         FROM products
        WHERE COALESCE(status,'Active')='Active'
          AND deleted_at IS NULL
          AND COALESCE(robots_directive,'index,follow') NOT LIKE 'noindex%'
        ORDER BY COALESCE(updated_at, created_at) DESC
        LIMIT 45000`
    );
    return sitemapDocument(rows.map((row) => sitemapUrl(baseUrl, productPath(row), row.lastmod, "weekly")));
  }

  if (type === "categories") {
    const rows = await dbQuery(
      `SELECT id, slug, name, image, created_at AS lastmod
         FROM categories
        WHERE COALESCE(status,'Active')='Active'
        ORDER BY created_at DESC`
    );
    return sitemapDocument(rows.map((row) => sitemapUrl(baseUrl, categoryPath(row), row.lastmod, "weekly")));
  }

  if (type === "brands") {
    const rows = await dbQuery("SELECT slug, COALESCE(updated_at, created_at) lastmod FROM brands WHERE deleted_at IS NULL AND COALESCE(status,'Active')='Active' AND slug<>''");
    return sitemapDocument(rows.map((row) => sitemapUrl(baseUrl, `/brand/${encodeURIComponent(row.slug)}`, row.lastmod, "weekly")));
  }

  if (type === "collections") {
    const rows = await dbQuery("SELECT slug, COALESCE(updated_at, created_at) lastmod FROM collections WHERE deleted_at IS NULL AND COALESCE(status,'Active')='Active' AND slug<>''");
    return sitemapDocument(rows.map((row) => sitemapUrl(baseUrl, `/collections/${encodeURIComponent(row.slug)}`, row.lastmod, "weekly")));
  }

  if (type === "bundles") {
    const rows = await dbQuery("SELECT slug, COALESCE(updated_at, created_at) lastmod FROM bundle_products WHERE COALESCE(status,'Active')='Active' AND slug<>''");
    return sitemapDocument(rows.map((row) => sitemapUrl(baseUrl, `/bundles/${encodeURIComponent(row.slug)}`, row.lastmod, "weekly")));
  }

  if (type === "blog") {
    const rows = await dbQuery("SELECT slug, COALESCE(published_at, updated_at, created_at) lastmod FROM blog_posts WHERE status='Published' AND slug<>'' AND COALESCE(robots_directive,'index,follow') NOT LIKE 'noindex%'");
    return sitemapDocument(rows.map((row) => sitemapUrl(baseUrl, `/blog/${encodeURIComponent(row.slug)}`, row.lastmod, "weekly")));
  }

  if (type === "images") {
    const rows = await dbQuery(
      `SELECT p.id, p.slug, p.name, COALESCE(p.updated_at,p.created_at) lastmod,
              pi.image_url, pi.alt_text, pi.caption, pi.title_text
         FROM products p
         JOIN product_images pi ON pi.product_id=p.id
        WHERE COALESCE(p.status,'Active')='Active' AND p.deleted_at IS NULL
        ORDER BY p.id, pi.sort_order, pi.id
        LIMIT 10000`
    );
    const grouped = new Map();
    rows.forEach((row) => {
      if (!grouped.has(row.id)) grouped.set(row.id, { product: row, images: [] });
      grouped.get(row.id).images.push({
        loc: publicImage(row.image_url, baseUrl),
        title: row.title_text || row.alt_text || row.name,
        caption: row.caption || row.alt_text || row.name,
      });
    });
    return sitemapDocument(
      [...grouped.values()].map(({ product, images }) => sitemapUrl(baseUrl, productPath(product), product.lastmod, "weekly", images)),
      true
    );
  }

  return sitemapDocument([]);
}

export async function buildRobotsTxt(req) {
  const settings = await getSeoSettings();
  const baseUrl = getBaseUrlFromSettings(settings, req);
  const lines = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /api",
    "Disallow: /cart",
    "Disallow: /checkout",
    "Disallow: /profile",
    "Disallow: /wishlist",
    "Disallow: /orders",
    "Disallow: /track-order",
  ];
  if (!["true", "1", "yes"].includes(String(settings.allow_ai_crawlers || "").toLowerCase())) {
    lines.push("", "User-agent: GPTBot", "Disallow: /", "", "User-agent: OAI-SearchBot", "Disallow: /", "", "User-agent: ChatGPT-User", "Disallow: /");
  } else {
    lines.push("", "User-agent: GPTBot", "Allow: /", "", "User-agent: OAI-SearchBot", "Allow: /", "", "User-agent: ChatGPT-User", "Allow: /");
  }
  lines.push("", `Sitemap: ${baseUrl}/sitemap.xml`, "");
  return lines.join("\n");
}

export async function buildLlmsTxt(req) {
  const settings = await getSeoSettings();
  const baseUrl = getBaseUrlFromSettings(settings, req);
  const categories = await dbQuery("SELECT name, slug FROM categories WHERE COALESCE(status,'Active')='Active' ORDER BY name LIMIT 60").catch(() => []);
  const brands = await dbQuery("SELECT name, slug FROM brands WHERE deleted_at IS NULL AND COALESCE(status,'Active')='Active' ORDER BY name LIMIT 60").catch(() => []);
  return [
    "# Golden Creation",
    "",
    "Golden Creation is an Indian ecommerce website for office stationery, writing tools, school supplies, art materials, premium pens, gifts, bundles, and corporate orders.",
    "",
    "## Important URLs",
    `- Website: ${baseUrl}`,
    `- Products: ${baseUrl}/all-products`,
    `- Blog: ${baseUrl}/blog`,
    `- Contact: ${baseUrl}/contact`,
    `- Sitemap: ${baseUrl}/sitemap.xml`,
    `- Google Merchant feed: ${baseUrl}/feeds/google-merchant.xml`,
    `- Meta catalog feed: ${baseUrl}/feeds/meta-catalog.csv`,
    "",
    "## Categories",
    ...categories.map((category) => `- ${category.name}: ${baseUrl}/category/${category.slug}`),
    "",
    "## Brands",
    ...brands.map((brand) => `- ${brand.name}: ${baseUrl}/brand/${brand.slug}`),
    "",
  ].join("\n");
}

async function productFeedRows() {
  return dbQuery(
    `SELECT p.id, p.slug, p.name, p.description, p.price, p.stock_quantity, p.image, p.barcode,
            c.name AS category_name, b.name AS brand_name,
            COALESCE(NULLIF(p.image,''), (SELECT pi.image_url FROM product_images pi WHERE pi.product_id=p.id ORDER BY pi.sort_order, pi.id LIMIT 1)) AS feed_image
       FROM products p
       LEFT JOIN categories c ON c.id=p.category_id
       LEFT JOIN brands b ON b.id=p.brand_id
      WHERE COALESCE(p.status,'Active')='Active' AND p.deleted_at IS NULL
      ORDER BY p.id`
  );
}

export async function buildGoogleMerchantFeed(req) {
  const settings = await getSeoSettings();
  const baseUrl = getBaseUrlFromSettings(settings, req);
  const rows = await productFeedRows();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "  <channel>",
    "    <title>Golden Creation Products</title>",
    `    <link>${xmlEscape(baseUrl)}</link>`,
    "    <description>Golden Creation ecommerce product feed</description>",
    ...rows.map((product) => [
      "    <item>",
      `      <g:id>${xmlEscape(product.id)}</g:id>`,
      `      <g:title>${xmlEscape(product.name)}</g:title>`,
      `      <g:description>${xmlEscape(truncate(product.description, 5000) || product.name)}</g:description>`,
      `      <g:link>${xmlEscape(`${baseUrl}${productPath(product)}`)}</g:link>`,
      `      <g:image_link>${xmlEscape(publicImage(product.feed_image, baseUrl))}</g:image_link>`,
      `      <g:availability>${Number(product.stock_quantity || 0) > 0 ? "in_stock" : "out_of_stock"}</g:availability>`,
      `      <g:price>${Number(product.price || 0).toFixed(2)} INR</g:price>`,
      `      <g:brand>${xmlEscape(product.brand_name || "Golden Creation")}</g:brand>`,
      product.barcode ? `      <g:gtin>${xmlEscape(product.barcode)}</g:gtin>` : "",
      `      <g:condition>new</g:condition>`,
      product.category_name ? `      <g:product_type>${xmlEscape(product.category_name)}</g:product_type>` : "",
      "    </item>",
    ].filter(Boolean).join("\n")),
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

function csvCell(value) {
  const text = clean(value).replace(/"/g, '""');
  return `"${text}"`;
}

export async function buildMetaCatalogFeed(req) {
  const settings = await getSeoSettings();
  const baseUrl = getBaseUrlFromSettings(settings, req);
  const rows = await productFeedRows();
  const header = ["id", "title", "description", "availability", "condition", "price", "link", "image_link", "brand", "product_type", "gtin"];
  return [
    header.map(csvCell).join(","),
    ...rows.map((product) => [
      product.id,
      product.name,
      truncate(product.description, 5000) || product.name,
      Number(product.stock_quantity || 0) > 0 ? "in stock" : "out of stock",
      "new",
      `${Number(product.price || 0).toFixed(2)} INR`,
      `${baseUrl}${productPath(product)}`,
      publicImage(product.feed_image, baseUrl),
      product.brand_name || "Golden Creation",
      product.category_name || "",
      product.barcode || "",
    ].map(csvCell).join(",")),
    "",
  ].join("\n");
}

export async function seoAuditSummary() {
  const [
    missingProductSlug,
    missingProductMeta,
    missingImageAlt,
    missingMediaAlt,
    missingBlogMeta,
    scripts,
  ] = await Promise.all([
    dbQuery("SELECT COUNT(*) total FROM products WHERE deleted_at IS NULL AND (slug IS NULL OR slug='')").catch(() => [{ total: 0 }]),
    dbQuery("SELECT COUNT(*) total FROM products WHERE deleted_at IS NULL AND (meta_title IS NULL OR meta_title='' OR meta_description IS NULL OR meta_description='')").catch(() => [{ total: 0 }]),
    dbQuery("SELECT COUNT(*) total FROM product_images WHERE alt_text IS NULL OR alt_text=''").catch(() => [{ total: 0 }]),
    dbQuery("SELECT COUNT(*) total FROM media_assets WHERE status <> 'Deleted' AND mime_type LIKE 'image/%' AND (alt_text IS NULL OR alt_text='')").catch(() => [{ total: 0 }]),
    dbQuery("SELECT COUNT(*) total FROM blog_posts WHERE status='Published' AND (meta_title IS NULL OR meta_title='' OR meta_description IS NULL OR meta_description='')").catch(() => [{ total: 0 }]),
    getSeoScripts({ includeInactive: true }),
  ]);
  return {
    missingProductSlug: Number(missingProductSlug[0]?.total || 0),
    missingProductMeta: Number(missingProductMeta[0]?.total || 0),
    missingImageAlt: Number(missingImageAlt[0]?.total || 0),
    missingBlogMeta: Number(missingBlogMeta[0]?.total || 0),
    productsMissingMeta: Number(missingProductMeta[0]?.total || 0),
    productImagesMissingAlt: Number(missingImageAlt[0]?.total || 0),
    blogsMissingMeta: Number(missingBlogMeta[0]?.total || 0),
    mediaMissingAlt: Number(missingMediaAlt[0]?.total || 0),
    scriptsConfigured: scripts.filter((script) => script.status === "Active").length,
  };
}

export async function ensureProductSlug(productId, name, providedSlug = "") {
  let base = slugify(providedSlug || name || `product-${productId}`) || `product-${productId}`;
  let slug = base;
  let suffix = 1;
  while (true) {
    const rows = await dbQuery("SELECT id FROM products WHERE slug=? AND id<>? LIMIT 1", [slug, productId || 0]);
    if (!rows.length) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}
