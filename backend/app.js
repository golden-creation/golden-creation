import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import productRoutes from "./routes/product.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import brandRoutes from "./routes/brand.routes.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import orderRoutes from "./routes/order.routes.js";
import storeRoutes from "./routes/store.routes.js";
import discountRoutes from "./routes/discount.routes.js";
import merchandisingRoutes from "./routes/merchandising.routes.js";
import corporateRoutes from "./routes/corporate.routes.js";
import bundleRoutes from "./routes/bundle.routes.js";
import mediaRoutes from "./routes/media.routes.js";
import googleReviewsRoutes from "./routes/google-reviews.routes.js";
import expansionRoutes from "./routes/expansion.routes.js";
import checkoutRoutes from "./routes/checkout.routes.js";
import contactRoutes from "./routes/contact.routes.js";
import customerRoutes from "./routes/customer.routes.js";
import contentRoutes from "./routes/content.routes.js";
import referralRoutes from "./routes/referral.routes.js";
import affiliateRoutes from "./routes/affiliate.routes.js";
import { razorpayWebhook } from "./controllers/checkout.controller.js";
import {
  getBlogSitemap,
  getBrandSitemap,
  getBundleSitemap,
  getCategorySitemap,
  getCollectionSitemap,
  getGoogleMerchantFeed,
  getImageSitemap,
  getLlmsTxt,
  getMetaCatalogFeed,
  getProductSitemap,
  getRobotsTxt,
  getSitemap,
  getStaticSitemap,
} from "./controllers/seo.controller.js";
import { buildSeoForRequest, renderSeoHtml } from "./services/seo.service.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const publicIndex = path.join(publicDir, "index.html");
const assetLinksPath = path.join(publicDir, ".well-known", "assetlinks.json");
const adminDir = path.join(publicDir, "admin");
const adminIndex = path.join(adminDir, "index.html");

const configuredOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function isLocalFrontendOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

const allowedOrigins = [...new Set([
  ...configuredOrigins,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5176",
  "http://127.0.0.1:5176",
])];
const allowedOriginSet = new Set(allowedOrigins);

function resolveConfiguredFrontendOrigin(origin) {
  const normalizedOrigin = String(origin || "").trim();
  if (allowedOriginSet.has(normalizedOrigin)) {
    return normalizedOrigin;
  }

  if (normalizedOrigin.includes(",")) {
    return normalizedOrigin
      .split(",")
      .map((value) => value.trim())
      .map((value) => resolveConfiguredFrontendOrigin(value))
      .find(Boolean);
  }

  try {
    const parsedOrigin = new URL(normalizedOrigin);
    return allowedOriginSet.has(parsedOrigin.origin) ? parsedOrigin.origin : null;
  } catch {
    return null;
  }
}

function resolveLocalFrontendOrigin(origin) {
  const normalizedOrigin = String(origin || "").trim();
  if (normalizedOrigin.includes(",")) {
    return normalizedOrigin
      .split(",")
      .map((value) => value.trim())
      .find((value) => isLocalFrontendOrigin(value));
  }

  return isLocalFrontendOrigin(normalizedOrigin) ? normalizedOrigin : null;
}

app.use(
  cors({
    origin(origin, callback) {
      const configuredOrigin = resolveConfiguredFrontendOrigin(origin);
      const localOrigin = resolveLocalFrontendOrigin(origin);

      if (!origin || !configuredOrigins.length) {
        callback(null, true);
        return;
      }

      if (configuredOrigin || localOrigin) {
        callback(null, configuredOrigin || localOrigin);
        return;
      }

      callback(null, false);
    },
  })
);
app.post(
  "/api/payments/razorpay/webhook",
  express.raw({ type: "application/json", limit: "2mb" }),
  razorpayWebhook
);
app.use(express.json({ limit: "12mb" }));

// âœ… IMAGE STATIC
app.use("/images", express.static("images"));
function isAdminHost(req) {
  const hostname = String(req.hostname || req.headers.host || "").split(":")[0].toLowerCase();
  return hostname === "admin.goldencreation.in";
}

app.use((req, res, next) => {
  if (req.path !== "/.well-known/assetlinks.json") {
    next();
    return;
  }

  res.type("application/json").sendFile(assetLinksPath, { dotfiles: "allow" }, (error) => {
    if (error) {
      next(error);
    }
  });
});

app.use((req, res, next) => {
  if (!isAdminHost(req) || req.path.startsWith("/api/")) {
    next();
    return;
  }

  express.static(adminDir)(req, res, next);
});
app.use("/admin", express.static(adminDir));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/sitemap.xml", getSitemap);
app.get("/sitemap-static.xml", getStaticSitemap);
app.get("/sitemap-products-1.xml", getProductSitemap);
app.get("/sitemap-categories.xml", getCategorySitemap);
app.get("/sitemap-brands.xml", getBrandSitemap);
app.get("/sitemap-collections.xml", getCollectionSitemap);
app.get("/sitemap-bundles.xml", getBundleSitemap);
app.get("/sitemap-blog.xml", getBlogSitemap);
app.get("/sitemap-images.xml", getImageSitemap);
app.get("/robots.txt", getRobotsTxt);
app.get("/llms.txt", getLlmsTxt);
app.get("/feeds/google-merchant.xml", getGoogleMerchantFeed);
app.get("/feeds/meta-catalog.csv", getMetaCatalogFeed);
app.use(express.static(publicDir, { index: false }));
app.get("/home", (_req, res) => res.redirect(301, "/"));
app.get("/product/:identifier", async (req, res, next) => {
  if (!/^\d+$/.test(String(req.params.identifier || ""))) {
    next();
    return;
  }

  try {
    const seo = await buildSeoForRequest(req);
    const canonicalPath = seo.entity?.canonicalPath;
    if (canonicalPath && canonicalPath !== req.path) {
      res.redirect(301, canonicalPath);
      return;
    }
  } catch {
    // Fall through to SPA rendering if SEO lookup is unavailable.
  }

  next();
});

// âœ… ROUTES
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/discounts", discountRoutes);
app.use("/api/corporate", corporateRoutes);
app.use("/api/bundles", bundleRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/google-reviews", googleReviewsRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/affiliate", affiliateRoutes);
app.use("/api", expansionRoutes);
app.use("/api", merchandisingRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/store", storeRoutes);

app.get(["/admin", "/admin/{*splat}"], (_req, res, next) => {
  res.sendFile(adminIndex, (error) => {
    if (error) {
      next();
    }
  });
});
app.get("/{*splat}", (req, res, next) => {
  if (isAdminHost(req)) {
    res.sendFile(adminIndex, (error) => {
      if (error) {
        next();
      }
    });
    return;
  }

  if (req.path === "/admin" || req.path.startsWith("/admin/")) {
    res.sendFile(adminIndex, (error) => {
      if (error) {
        next();
      }
    });
    return;
  }

  if (req.path.startsWith("/api/")) {
    next();
    return;
  }

  renderSeoHtml(req, publicIndex)
    .then((html) => {
      res.set({
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      });
      res.send(html);
    })
    .catch(() => {
      res.sendFile(publicIndex, (error) => {
        if (error) {
          next();
        }
      });
    });
});

export default app;



