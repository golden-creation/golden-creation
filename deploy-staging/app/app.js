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

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const publicIndex = path.join(publicDir, "index.html");
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

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        !configuredOrigins.length ||
        allowedOrigins.includes(origin) ||
        isLocalFrontendOrigin(origin)
      ) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
  })
);
app.use(express.json({ limit: "12mb" }));

// âœ… IMAGE STATIC
app.use("/images", express.static("images"));
app.use("/admin", express.static(adminDir));
app.use(express.static(publicDir));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// âœ… ROUTES
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/discounts", discountRoutes);
app.use("/api/corporate", corporateRoutes);
app.use("/api/bundles", bundleRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/google-reviews", googleReviewsRoutes);
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
  const hostname = String(req.hostname || req.headers.host || "").split(":")[0].toLowerCase();

  if (hostname === "admin.goldencreation.in") {
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

  res.sendFile(publicIndex, (error) => {
    if (error) {
      next();
    }
  });
});

export default app;



