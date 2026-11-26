import express from "express";
import jwt from "jsonwebtoken";
import db from "../config/db.js";
import { attachAdminAudit } from "../middleware/admin-audit.middleware.js";
import {
  exportAuditEvents,
  listAuditEvents,
  recordAuditObservations,
  rejectAuditMutation,
  requireAuditSuperAdmin,
} from "../controllers/admin-audit.controller.js";

import {
  changeAdminPassword,
  getAdminDashboard,
  getAdminGodowns,
  getAdminOrders,
  getAdminProfile,
  getAdminStaff,
  loginAdmin,
  logoutAdmin,
  requestAdminPasswordReset,
  requestAdminSecurityOtp,
  resetAdminApiAccess,
  terminateAdminSessions,
  updateAdminProfile,
  updateAdminTwoFactor,
  uploadAdminProfileImage,
  verifyAdminLoginOtp,
  verifyAdminPasswordReset,
} from "../controllers/admin.controller.js";
import {
  approveOperationalMovement,
  bulkAction,
  createOperationalMovement,
  createReturnRequest,
  createTask,
  deleteAdminBlogPostPersistent,
  exportAdminXlsx,
  getAdminBlogPosts,
  getAdminReturns,
  getCatalogInventory,
  getHrSummary,
  getLookups,
  getNewsletterSubscribers,
  getOperationalCatalog,
  getProductStockDetail,
  getTasks,
  importStoreProducts,
  refreshAdminLowStock,
  saveHrAttendance,
  saveAdminBlogPost,
  saveOperationalStock,
  saveStoreProduct,
  saveWarehouseProduct,
  updateNewsletterSubscriber,
  updateProductStock,
  updateReturnRequest,
  updateShipment,
  updateTaskAssignment,
} from "../controllers/expansion.controller.js";
import {
  createAdminBrand,
  deleteAdminBrand,
  getAdminBrandDetail,
  getAdminBrands,
  restoreAdminBrand,
  updateAdminBrand,
  updateAdminBrandFeatured,
  updateAdminBrandStatus,
} from "../controllers/brand.controller.js";
import {
  createAdminDiscount,
  deleteAdminDiscount,
  duplicateAdminDiscount,
  exportAdminDiscounts,
  getAdminDiscountAnalytics,
  getAdminDiscountDetail,
  getAdminDiscounts,
  updateAdminDiscount,
  updateAdminDiscountStatus,
} from "../controllers/discount.controller.js";
import {
  createAdminBundle,
  deleteAdminBundle,
  getAdminBundleDetail,
  getAdminBundles,
  updateAdminBundle,
} from "../controllers/bundle.controller.js";
import {
  getAdminCorporateEnquiries,
  getAdminCorporateEnquiryDetail,
  updateAdminCorporateEnquiry,
} from "../controllers/corporate.controller.js";
import {
  getAdminContactEnquiries,
  updateAdminContactEnquiry,
} from "../controllers/contact.controller.js";
import {
  bulkDeleteAdminTags,
  createAdminCollection,
  createAdminTag,
  deleteAdminCollection,
  deleteAdminTag,
  getAdminCollectionDetail,
  getAdminCollections,
  getTags,
  previewAdminCollection,
  updateAdminCollection,
  updateAdminCollectionStatus,
  updateAdminTag,
  updateAdminTagStatus,
} from "../controllers/merchandising.controller.js";
import {
  createAdminMenu,
  deleteAdminMenu,
  duplicateAdminMenu,
  getAdminMenus,
  getMenuReferences,
  reorderAdminMenus,
  updateAdminMenu,
} from "../controllers/menu.controller.js";
import {
  approveStockMovement,
  createAdminCategory,
  createAdminCustomer,
  createAdminBill,
  createAdminOrder,
  createAdminRole,
  createAdminStaff,
  createAdminSupplier,
  createAdminTaxRule,
  createShippingRule,
  createStockMovement,
  createWarehouseProduct,
  createWarehouseStock,
  deleteAdminCustomer,
  deleteAdminCategory,
  deleteAdminStaff,
  deleteAdminSupplier,
  deleteAdminTaxRule,
  deleteShippingRule,
  downloadAdminBillPdf,
  getAdminCategories,
  getAdminActivity,
  getAdminBillingData,
  getAdminCustomerDetail,
  getAdminCustomers,
  getAdminInventory,
  getAdminNotifications,
  getAdminOrderDetail,
  getAdminPayments,
  getAdminReportsData,
  getAdminRoles,
  getAdminShipping,
  getAdminStaffProfile,
  getAdminStoreSettings,
  getAdminSuppliersData,
  getAdminTaxRules,
  getAdminWarehouse,
  importAdminProducts,
  markAdminNotificationsRead,
  searchAdmin,
  updateAdminCategory,
  updateAdminOrderStatus,
  updateAdminStaff,
  updateAdminStoreSetting,
  updateAdminSupplier,
  updateAdminTaxRule,
  updateGstReturnStatus,
  updateShippingRule,
  sendAdminBill,
} from "../controllers/admin-modules.controller.js";
import {
  completeVideoUpload,
  createVideoUploadUrl,
  deleteAdminMedia,
  getRemoteMediaMigration,
  handleMediaUploadError,
  uploadAdminMedia,
  uploadMiddleware,
  runRemoteMediaMigration,
} from "../controllers/media.controller.js";
import {
  createDriveFolder,
  deleteDriveFile,
  deleteDriveFolder,
  driveUploadMiddleware,
  getDriveItems,
  updateDriveFile,
  updateDriveFolder,
  uploadDriveFile,
} from "../controllers/drive.controller.js";
import {
  archiveSalesCatalog,
  createSalesCatalog,
  createSalesLead,
  deleteSalesCatalog,
  duplicateSalesCatalog,
  downloadSalesCatalog,
  exportSalesLeads,
  generateSalesCatalog,
  getSalesCatalog,
  getSalesCatalogs,
  getSalesLead,
  getSalesLeads,
  getSalesmen,
  recordSalesCatalogShare,
  searchSalesCatalogProducts,
  updateSalesCatalog,
  updateSalesLead,
} from "../controllers/sales.controller.js";
import {
  createCommerceShippingRule,
  deletePartialCodRule,
  getCommerceShipping,
  getPaymentSettings,
  savePartialCodRule,
  updateCommerceShippingRule,
  savePorterBooking,
  updatePaymentSettings,
} from "../controllers/commerce-admin.controller.js";
import {
  getAdminBlogSeo,
  getAdminMediaSeo,
  getAdminProductSeo,
  getAdminSeoAudit,
  getAdminSeoFeedStatus,
  getAdminSeoScripts,
  getAdminSeoSettings,
  removeAdminSeoScript,
  saveAdminSeoScript,
  updateAdminBlogSeo,
  updateAdminMediaSeo,
  updateAdminProductSeo,
  updateAdminSeoSettings,
} from "../controllers/seo-admin.controller.js";
import {
  createAdminAffiliate,
  createAdminManualAdjustment,
  deleteAdminCommissionRule,
  getAdminAffiliateApplications,
  getAdminAffiliates,
  getAdminCommissionRules,
  getAdminReferralCustomers,
  getAdminReferralLedger,
  getAdminReferralReports,
  getAdminReferralSettings,
  getAdminWithdrawals,
  saveAdminCommissionRule,
  updateAdminAffiliate,
  updateAdminAffiliateApplication,
  updateAdminReferralSettings,
  updateAdminWithdrawal,
} from "../controllers/referral-affiliate.controller.js";
import { markCodCollected } from "../controllers/checkout.controller.js";
import {
  decideRemovalRequest,
  getRemovalRequests,
  requireAdminDeleteApproval,
} from "../controllers/removal-requests.controller.js";

const router = express.Router();

router.use(attachAdminAudit);

function dbQuery(sql, values = []) {
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

function parsePermissionValue(value) {
  const expandLegacyPermissions = (permissions) => {
    const expanded = new Set(permissions);

    if (expanded.has("products")) {
      expanded.add("categories");
      expanded.add("bundles");
      expanded.add("media");
    }
    if (expanded.has("customers")) {
      expanded.add("contact_enquiries");
      expanded.add("corporate_enquiries");
      expanded.add("newsletter");
    }
    if (expanded.has("orders")) {
      expanded.add("returns");
      expanded.add("billing");
    }
    if (expanded.has("users")) {
      expanded.add("hr");
    }
    if (expanded.has("blog") || expanded.has("brands") || expanded.has("collections") || expanded.has("menus") || expanded.has("bundles")) {
      expanded.add("media");
    }

    return [...expanded];
  };

  if (Array.isArray(value)) {
    return expandLegacyPermissions(value.map((item) => String(item).trim()).filter(Boolean));
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? expandLegacyPermissions(parsed.map((item) => String(item).trim()).filter(Boolean))
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

/* ADMIN AUTH */

async function requireAdminAuth(
  req,
  res,
  next
) {
  const header =
    req.headers.authorization || "";

  const token = header.startsWith(
    "Bearer "
  )
    ? header.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      message:
        "Admin login required",
    });
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET ||
        "local_dev_secret_change_before_deploy"
    );

    if (payload.type !== "admin") {
      return res.status(403).json({
        message:
          "Admin access required",
      });
    }

    const rows = await dbQuery(
      `
        SELECT id, name, email, role, status, permissions
        FROM admins
        WHERE id = ?
        LIMIT 1
      `,
      [payload.id]
    );
    const admin = rows[0];

    if (!admin || String(admin.status || "").trim().toLowerCase() !== "active") {
      return res.status(403).json({
        message: "Admin account is inactive or unavailable",
      });
    }

    req.admin = {
      ...payload,
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      status: admin.status,
      permissions: parsePermissionValue(admin.permissions),
    };

    next();
  } catch (error) {
    res.status(401).json({
      message:
        "Invalid or expired admin session",
    });
  }
}

function requireSuperAdmin(
  req,
  res,
  next
) {
  if (!isPrivilegedAdminRole(req.admin)) {
    return res.status(403).json({
      message:
        "Only admin users can access the activity log",
    });
  }

  next();
}

function permissionList(admin) {
  return parsePermissionValue(admin?.permissions);
}

function requiredPermissions(path) {
  const anyProductLookup = [
    "products",
    "categories",
    "brands",
    "tags",
    "collections",
    "bundles",
    "orders",
    "billing",
    "discounts",
    "inventory",
    "warehouse",
    "store",
    "suppliers",
    "leads",
    "sales_catalogs",
    "seo_marketing",
    "referral_affiliate",
  ];
  const mediaUsers = [
    "products",
    "categories",
    "brands",
    "collections",
    "menus",
    "bundles",
    "blog",
    "profile",
    "drive",
    "media",
  ];

  if (path === "/dashboard") return ["dashboard"];
  if (path === "/search") return ["dashboard"];
  if (path.startsWith("/lookups/")) return anyProductLookup;
  if (path.startsWith("/media")) return mediaUsers;
  if (path.startsWith("/drive")) return ["drive"];

  if (path.startsWith("/exports/website-products")) return "products";
  if (path.startsWith("/exports/warehouse-products")) return "warehouse";
  if (path.startsWith("/exports/store-products")) return "store";
  if (path.startsWith("/exports/brands")) return "brands";
  if (path.startsWith("/exports/orders")) return "orders";
  if (path.startsWith("/exports/bills")) return "billing";
  if (path.startsWith("/exports/customers")) return "customers";
  if (path.startsWith("/exports/suppliers")) return "suppliers";
  if (path.startsWith("/exports/subscribers")) return "newsletter";
  if (path.startsWith("/exports/blogs")) return "blog";

  const rules = [
    ["/orders", "orders"],
    ["/returns", "returns"],
    ["/billing", "billing"],
    ["/contact-enquiries", "contact_enquiries"],
    ["/corporate-enquiries", "corporate_enquiries"],
    ["/staff", "users"],
    ["/roles", "roles"],
    ["/activity", "activity_log"],
    ["/customers", "customers"],
    ["/categories", "categories"],
    ["/products/import", "products"],
    ["/brands", "brands"],
    ["/tags", "tags"],
    ["/collections", "collections"],
    ["/menus", "menus"],
    ["/bundles", "bundles"],
    ["/inventory", "inventory"],
    ["/catalogs/warehouse", "warehouse"],
    ["/warehouse", "warehouse"],
    ["/godowns", "warehouse"],
    ["/catalogs/store", "store"],
    ["/store-settings", "store"],
    ["/tax-rules", "store"],
    ["/shipping", "shipping"],
    ["/payments", "payments"],
    ["/payment-settings", "payments"],
    ["/discounts", "discounts"],
    ["/tasks", "tasks"],
    ["/hr", "hr"],
    ["/newsletter", "newsletter"],
    ["/blog", "blog"],
    ["/suppliers", "suppliers"],
    ["/reports", "reports"],
    ["/exports", "reports"],
    ["/leads", "leads"],
    ["/salesmen", "leads"],
    ["/sales-catalogs", "sales_catalogs"],
    ["/sales-catalog-products", "sales_catalogs"],
    ["/seo", "seo_marketing"],
    ["/referrals", "referral_affiliate"],
    ["/affiliate-applications", "referral_affiliate"],
    ["/affiliates", "referral_affiliate"],
    ["/wallet/withdrawals", "referral_affiliate"],
  ];

  const match = rules.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  return match?.[1] ? [match[1]] : [];
}

function requireModulePermission(req, res, next) {
  if (isPrivilegedAdminRole(req.admin)) {
    next();
    return;
  }

  const permissions = requiredPermissions(req.path);
  if (!permissions.length) {
    next();
    return;
  }

  const assignedPermissions = permissionList(req.admin);
  if (permissions.some((permission) => assignedPermissions.includes(permission))) {
    next();
    return;
  }

  res.status(403).json({ message: "You do not have permission to access this module" });
}

function isSuperAdminRole(admin) {
  return String(admin?.role || "").trim().toLowerCase() === "super admin";
}

function isPrivilegedAdminRole(admin) {
  return ["super admin", "technical developer"].includes(String(admin?.role || "").trim().toLowerCase());
}

/* LOGIN */

router.post(
  "/login",
  loginAdmin
);

router.post(
  "/login/verify-otp",
  verifyAdminLoginOtp
);

router.post(
  "/password-reset/request",
  requestAdminPasswordReset
);

router.post(
  "/password-reset/verify",
  verifyAdminPasswordReset
);

/* PROTECTED ROUTES */

router.use(requireAdminAuth);

router.use((req, res, next) => {
  if (String(req.admin?.role || "").trim().toLowerCase() !== "salesman") {
    next();
    return;
  }

  const allowedPrefixes = [
    "/dashboard",
    "/leads",
    "/sales-catalogs",
    "/sales-catalog-products",
    "/drive",
    "/tasks",
    "/profile",
    "/logout",
    "/security",
  ];
  const allowedLookups = new Set(["products", "categories", "brands", "tags", "collections"]);

  if (allowedPrefixes.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
    next();
    return;
  }

  if (req.path.startsWith("/lookups/") && allowedLookups.has(req.path.split("/").pop())) {
    next();
    return;
  }

  res.status(403).json({ message: "This module is not available to Salesman accounts" });
});

router.use(requireModulePermission);

router.get("/audit/events", requireAuditSuperAdmin, listAuditEvents);
router.get("/audit/export", requireAuditSuperAdmin, exportAuditEvents);
router.post("/audit/observations", recordAuditObservations);
router.put("/audit/events", requireAuditSuperAdmin, rejectAuditMutation);
router.put("/audit/events/:id", requireAuditSuperAdmin, rejectAuditMutation);
router.patch("/audit/events", requireAuditSuperAdmin, rejectAuditMutation);
router.patch("/audit/events/:id", requireAuditSuperAdmin, rejectAuditMutation);
router.delete("/audit/events", requireAuditSuperAdmin, rejectAuditMutation);
router.delete("/audit/events/:id", requireAuditSuperAdmin, rejectAuditMutation);

router.get("/contact-enquiries", getAdminContactEnquiries);
router.patch("/contact-enquiries/:id", updateAdminContactEnquiry);

router.get("/removal-requests", requireSuperAdmin, getRemovalRequests);
router.put("/removal-requests/:id/decision", requireSuperAdmin, decideRemovalRequest);

router.get("/seo/settings", getAdminSeoSettings);
router.put("/seo/settings", requireSuperAdmin, updateAdminSeoSettings);
router.get("/seo/scripts", getAdminSeoScripts);
router.post("/seo/scripts", requireSuperAdmin, saveAdminSeoScript);
router.put("/seo/scripts/:id", requireSuperAdmin, saveAdminSeoScript);
router.delete("/seo/scripts/:id", requireSuperAdmin, removeAdminSeoScript);
router.get("/seo/products/:id", getAdminProductSeo);
router.put("/seo/products/:id", updateAdminProductSeo);
router.get("/seo/blogs/:id", getAdminBlogSeo);
router.put("/seo/blogs/:id", updateAdminBlogSeo);
router.get("/seo/media/:id", getAdminMediaSeo);
router.put("/seo/media/:id", updateAdminMediaSeo);
router.get("/seo/audit", getAdminSeoAudit);
router.get("/seo/feed-status", getAdminSeoFeedStatus);

/* DASHBOARD */

router.get(
  "/dashboard",
  getAdminDashboard
);

router.get(
  "/search",
  searchAdmin
);

router.post(
  "/media/upload",
  uploadMiddleware.single("file"),
  uploadAdminMedia
);
router.post("/media/video-upload-url", createVideoUploadUrl);
router.post("/media/video-upload-complete", completeVideoUpload);
router.delete("/media", requireAdminDeleteApproval, deleteAdminMedia);
router.get("/media/migration", getRemoteMediaMigration);
router.post("/media/migration/run", runRemoteMediaMigration);
router.use(handleMediaUploadError);

router.get("/drive", getDriveItems);
router.post("/drive/folders", createDriveFolder);
router.put("/drive/folders/:id", updateDriveFolder);
router.delete("/drive/folders/:id", requireAdminDeleteApproval, deleteDriveFolder);
router.post("/drive/files", driveUploadMiddleware.single("file"), uploadDriveFile);
router.put("/drive/files/:id", updateDriveFile);
router.delete("/drive/files/:id", requireAdminDeleteApproval, deleteDriveFile);
router.use(handleMediaUploadError);

router.get(
  "/notifications",
  requireSuperAdmin,
  getAdminNotifications
);

router.put(
  "/notifications/read",
  requireSuperAdmin,
  markAdminNotificationsRead
);

router.put(
  "/notifications/:id/read",
  requireSuperAdmin,
  markAdminNotificationsRead
);

/* ORDERS */

router.get(
  "/orders",
  getAdminOrders
);

router.post(
  "/orders",
  createAdminOrder
);

router.get(
  "/orders/:id",
  getAdminOrderDetail
);

router.put(
  "/orders/:id/status",
  updateAdminOrderStatus
);

router.put(
  "/orders/:id/shipment",
  updateShipment
);

router.put(
  "/orders/:id/cod-collected",
  markCodCollected
);

router.put(
  "/orders/:id/porter-booking",
  savePorterBooking
);

router.get(
  "/returns",
  getAdminReturns
);

router.post(
  "/returns",
  createReturnRequest
);

router.put(
  "/returns/:id",
  updateReturnRequest
);

/* USER MANAGEMENT / RBAC */

router.get(
  "/roles",
  getAdminRoles
);

router.post(
  "/roles",
  createAdminRole
);

router.post(
  "/staff",
  createAdminStaff
);

router.put(
  "/staff/:id",
  updateAdminStaff
);

router.delete(
  "/staff/:id",
  requireAdminDeleteApproval,
  deleteAdminStaff
);

router.get(
  "/staff/:id",
  getAdminStaffProfile
);

router.get(
  "/activity",
  requireSuperAdmin,
  getAdminActivity
);

router.get(
  "/customers",
  getAdminCustomers
);

router.post(
  "/customers",
  createAdminCustomer
);

router.get(
  "/customers/:id",
  getAdminCustomerDetail
);

router.delete(
  "/customers/:id",
  requireAdminDeleteApproval,
  deleteAdminCustomer
);

router.get(
  "/categories",
  getAdminCategories
);

router.post(
  "/categories",
  createAdminCategory
);

router.put(
  "/categories/:id",
  updateAdminCategory
);

router.delete(
  "/categories/:id",
  requireAdminDeleteApproval,
  deleteAdminCategory
);

router.post(
  "/products/import",
  importAdminProducts
);

router.get(
  "/lookups/:type",
  getLookups
);

router.get("/salesmen", getSalesmen);
router.get("/leads", getSalesLeads);
router.get("/leads/export", exportSalesLeads);
router.post("/leads", createSalesLead);
router.get("/leads/:id", getSalesLead);
router.put("/leads/:id", updateSalesLead);
router.get("/sales-catalog-products", searchSalesCatalogProducts);
router.get("/sales-catalogs", getSalesCatalogs);
router.post("/sales-catalogs", createSalesCatalog);
router.get("/sales-catalogs/:id", getSalesCatalog);
router.put("/sales-catalogs/:id", updateSalesCatalog);
router.post("/sales-catalogs/:id/duplicate", duplicateSalesCatalog);
router.post("/sales-catalogs/:id/generate", generateSalesCatalog);
router.get("/sales-catalogs/:id/download", downloadSalesCatalog);
router.post("/sales-catalogs/:id/archive", archiveSalesCatalog);
router.delete("/sales-catalogs/:id", requireAdminDeleteApproval, deleteSalesCatalog);
router.post("/sales-catalogs/:id/share", recordSalesCatalogShare);

router.get(
  "/inventory/catalog",
  getCatalogInventory
);

router.get(
  "/inventory/products/:id/stock",
  getProductStockDetail
);

router.put(
  "/inventory/products/:id/stock",
  updateProductStock
);

router.get(
  "/catalogs/:catalog",
  getOperationalCatalog
);

router.post(
  "/catalogs/warehouse/products",
  saveWarehouseProduct
);

router.post(
  "/catalogs/store/products",
  saveStoreProduct
);

router.post(
  "/catalogs/store/import",
  importStoreProducts
);

router.post(
  "/catalogs/:catalog/stock",
  saveOperationalStock
);

router.post(
  "/catalogs/:catalog/movements",
  createOperationalMovement
);

router.put(
  "/catalogs/:catalog/movements/:id/approval",
  requireSuperAdmin,
  approveOperationalMovement
);

router.post(
  "/bulk/:entity",
  (req, res, next) => String(req.body?.action || "").toLowerCase() === "delete" ? requireAdminDeleteApproval(req, res, next) : next(),
  bulkAction
);

router.get(
  "/exports/:type",
  exportAdminXlsx
);

/* BRANDS */

router.get(
  "/brands",
  getAdminBrands
);

router.post(
  "/brands",
  createAdminBrand
);

router.get(
  "/brands/:id",
  getAdminBrandDetail
);

router.put(
  "/brands/:id",
  updateAdminBrand
);

router.patch(
  "/brands/:id/status",
  updateAdminBrandStatus
);

router.patch(
  "/brands/:id/featured",
  updateAdminBrandFeatured
);

router.delete(
  "/brands/:id",
  requireAdminDeleteApproval,
  deleteAdminBrand
);

router.put(
  "/brands/:id/restore",
  restoreAdminBrand
);

/* TAGS AND COLLECTIONS */

router.get(
  "/tags",
  getTags
);

router.post(
  "/tags",
  createAdminTag
);

router.put(
  "/tags/:id",
  updateAdminTag
);

router.patch(
  "/tags/:id/status",
  updateAdminTagStatus
);

router.delete(
  "/tags/:id",
  requireAdminDeleteApproval,
  deleteAdminTag
);

router.post(
  "/tags/bulk-delete",
  requireAdminDeleteApproval,
  bulkDeleteAdminTags
);

router.get(
  "/collections",
  getAdminCollections
);

router.post(
  "/collections/preview",
  previewAdminCollection
);

router.post(
  "/collections",
  createAdminCollection
);

router.get(
  "/collections/:id",
  getAdminCollectionDetail
);

router.put(
  "/collections/:id",
  updateAdminCollection
);

router.patch(
  "/collections/:id/status",
  updateAdminCollectionStatus
);

router.delete(
  "/collections/:id",
  requireAdminDeleteApproval,
  deleteAdminCollection
);

/* MENUS */

router.get(
  "/menus",
  getAdminMenus
);

router.get(
  "/menus/references",
  getMenuReferences
);

router.post(
  "/menus",
  createAdminMenu
);

router.put(
  "/menus/reorder",
  reorderAdminMenus
);

router.put(
  "/menus/:id",
  updateAdminMenu
);

router.post(
  "/menus/:id/duplicate",
  duplicateAdminMenu
);

router.delete(
  "/menus/:id",
  requireAdminDeleteApproval,
  deleteAdminMenu
);

/* CORPORATE ENQUIRIES */

router.get(
  "/corporate-enquiries",
  getAdminCorporateEnquiries
);

router.get(
  "/corporate-enquiries/:id",
  getAdminCorporateEnquiryDetail
);

router.put(
  "/corporate-enquiries/:id",
  updateAdminCorporateEnquiry
);

/* BUNDLES */

router.get(
  "/bundles",
  getAdminBundles
);

router.post(
  "/bundles",
  createAdminBundle
);

router.get(
  "/bundles/:id",
  getAdminBundleDetail
);

router.put(
  "/bundles/:id",
  updateAdminBundle
);

router.delete(
  "/bundles/:id",
  requireAdminDeleteApproval,
  deleteAdminBundle
);

/* OPERATIONS */

router.get(
  "/inventory",
  getAdminInventory
);

router.get(
  "/warehouse",
  getAdminWarehouse
);

router.post(
  "/warehouse/products",
  createWarehouseProduct
);

router.post(
  "/warehouse/stock",
  createWarehouseStock
);

router.post(
  "/warehouse/movements",
  createStockMovement
);

router.put(
  "/warehouse/movements/:id/approval",
  approveStockMovement
);

router.get(
  "/store-settings",
  getAdminStoreSettings
);

router.put(
  "/store-settings/:key",
  updateAdminStoreSetting
);

router.get(
  "/tax-rules",
  getAdminTaxRules
);

router.post(
  "/tax-rules",
  createAdminTaxRule
);

router.put(
  "/tax-rules/:id",
  updateAdminTaxRule
);

router.delete(
  "/tax-rules/:id",
  requireAdminDeleteApproval,
  deleteAdminTaxRule
);

router.get(
  "/shipping",
  getCommerceShipping
);

router.post(
  "/shipping/rules",
  createCommerceShippingRule
);

router.put(
  "/shipping/rules/:id",
  updateCommerceShippingRule
);

router.delete(
  "/shipping/rules/:id",
  requireAdminDeleteApproval,
  deleteShippingRule
);

router.get(
  "/payments",
  getAdminPayments
);

router.get(
  "/payment-settings",
  getPaymentSettings
);

router.put(
  "/payment-settings",
  updatePaymentSettings
);

router.post(
  "/payment-settings/partial-cod-rules",
  savePartialCodRule
);

router.delete(
  "/payment-settings/partial-cod-rules/:id",
  requireAdminDeleteApproval,
  deletePartialCodRule
);

router.put(
  "/payments/gst-return/:id",
  updateGstReturnStatus
);

/* REFERRALS / AFFILIATES */

router.get(
  "/referrals/settings",
  getAdminReferralSettings
);

router.put(
  "/referrals/settings",
  updateAdminReferralSettings
);

router.get(
  "/referrals/commission-rules",
  getAdminCommissionRules
);

router.post(
  "/referrals/commission-rules",
  saveAdminCommissionRule
);

router.put(
  "/referrals/commission-rules/:id",
  saveAdminCommissionRule
);

router.delete(
  "/referrals/commission-rules/:id",
  requireAdminDeleteApproval,
  deleteAdminCommissionRule
);

router.get(
  "/referrals/customers",
  getAdminReferralCustomers
);

router.get(
  "/referrals/ledger",
  getAdminReferralLedger
);

router.post(
  "/referrals/manual-adjustments",
  createAdminManualAdjustment
);

router.get(
  "/referrals/reports",
  getAdminReferralReports
);

router.get(
  "/affiliate-applications",
  getAdminAffiliateApplications
);

router.patch(
  "/affiliate-applications/:id",
  updateAdminAffiliateApplication
);

router.get(
  "/affiliates",
  getAdminAffiliates
);

router.post(
  "/affiliates",
  createAdminAffiliate
);

router.put(
  "/affiliates/:id",
  updateAdminAffiliate
);

router.patch(
  "/affiliates/:id",
  updateAdminAffiliate
);

router.get(
  "/wallet/withdrawals",
  getAdminWithdrawals
);

router.patch(
  "/wallet/withdrawals/:id",
  updateAdminWithdrawal
);

/* DISCOUNTS */

router.get(
  "/discounts",
  getAdminDiscounts
);

router.get(
  "/discounts/export",
  exportAdminDiscounts
);

router.get(
  "/discounts/analytics",
  getAdminDiscountAnalytics
);

router.post(
  "/discounts",
  createAdminDiscount
);

router.get(
  "/discounts/:id",
  getAdminDiscountDetail
);

router.put(
  "/discounts/:id",
  updateAdminDiscount
);

router.patch(
  "/discounts/:id/status",
  updateAdminDiscountStatus
);

router.post(
  "/discounts/:id/duplicate",
  duplicateAdminDiscount
);

router.delete(
  "/discounts/:id",
  requireAdminDeleteApproval,
  deleteAdminDiscount
);

/* TASKS / HR */

router.get(
  "/tasks",
  getTasks
);

router.post(
  "/tasks",
  requireSuperAdmin,
  createTask
);

router.put(
  "/tasks/assignments/:id",
  updateTaskAssignment
);

router.get(
  "/hr",
  getHrSummary
);

router.post(
  "/hr/attendance",
  saveHrAttendance
);

router.post(
  "/notifications/refresh-low-stock",
  requireSuperAdmin,
  refreshAdminLowStock
);

router.get(
  "/newsletter",
  getNewsletterSubscribers
);

router.put(
  "/newsletter/:id",
  updateNewsletterSubscriber
);

/* BLOG */

router.get(
  "/blog",
  getAdminBlogPosts
);

router.post(
  "/blog",
  saveAdminBlogPost
);

router.put(
  "/blog/:id",
  saveAdminBlogPost
);

router.delete(
  "/blog/:id",
  requireAdminDeleteApproval,
  deleteAdminBlogPostPersistent
);

/* PROFILE */

router.get(
  "/profile",
  getAdminProfile
);

router.put(
  "/profile",
  updateAdminProfile
);

router.post(
  "/profile/upload-image",
  uploadAdminProfileImage
);

router.post(
  "/logout",
  logoutAdmin
);

router.put(
  "/security/two-factor",
  updateAdminTwoFactor
);

router.post(
  "/security/request-otp",
  requestAdminSecurityOtp
);

router.post(
  "/security/reset-api",
  resetAdminApiAccess
);

router.post(
  "/security/terminate-sessions",
  terminateAdminSessions
);

router.put(
  "/security/change-password",
  changeAdminPassword
);

/* STAFF */

router.get(
  "/staff",
  getAdminStaff
);

/* GODOWNS */

router.get(
  "/godowns",
  getAdminGodowns
);

/* SUPPLIERS */

router.get(
  "/suppliers",
  getAdminSuppliersData
);

router.post(
  "/suppliers",
  createAdminSupplier
);

router.put(
  "/suppliers/:id",
  updateAdminSupplier
);

router.delete(
  "/suppliers/:id",
  requireAdminDeleteApproval,
  deleteAdminSupplier
);

/* REPORTS */

router.get(
  "/reports",
  getAdminReportsData
);

/* BILLING */

router.get(
  "/billing",
  getAdminBillingData
);

router.post(
  "/billing",
  createAdminBill
);

router.post(
  "/billing/:id/send",
  sendAdminBill
);

router.get(
  "/billing/:id/pdf",
  downloadAdminBillPdf
);

export default router;
