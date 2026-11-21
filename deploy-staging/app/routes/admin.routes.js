import express from "express";
import jwt from "jsonwebtoken";

import {
  changeAdminPassword,
  getAdminBlog,
  createAdminBlogPost,
  deleteAdminBlogPost,
  getAdminDashboard,
  getAdminGodowns,
  getAdminOrders,
  getAdminProfile,
  getAdminStaff,
  loginAdmin,
  logoutAdmin,
  resetAdminApiAccess,
  terminateAdminSessions,
  updateAdminProfile,
  updateAdminTwoFactor,
  uploadAdminProfileImage,
} from "../controllers/admin.controller.js";
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
  syncWebsiteProductsToWarehouse,
  syncWarehouseGoogleSheet,
  updateAdminCategory,
  updateAdminOrderStatus,
  updateAdminStaff,
  updateAdminStoreSetting,
  updateAdminSupplier,
  updateAdminTaxRule,
  updateGstReturnStatus,
  updateShippingRule,
  updateWarehouseSheet,
  sendAdminBill,
} from "../controllers/admin-modules.controller.js";
import {
  handleMediaUploadError,
  uploadAdminMedia,
  uploadMiddleware,
} from "../controllers/media.controller.js";

const router = express.Router();

/* ADMIN AUTH */

function requireAdminAuth(
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

    req.admin = payload;

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
  const role = String(req.admin?.role || "")
    .toLowerCase();

  if (!role.includes("admin")) {
    return res.status(403).json({
      message:
        "Only admin users can access the activity log",
    });
  }

  next();
}

/* LOGIN */

router.post(
  "/login",
  loginAdmin
);

/* PROTECTED ROUTES */

router.use(requireAdminAuth);

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
router.use(handleMediaUploadError);

router.get(
  "/notifications",
  getAdminNotifications
);

router.put(
  "/notifications/read",
  markAdminNotificationsRead
);

router.put(
  "/notifications/:id/read",
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

router.post(
  "/products/import",
  importAdminProducts
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
  deleteAdminTag
);

router.post(
  "/tags/bulk-delete",
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
  "/warehouse/sync-products",
  syncWebsiteProductsToWarehouse
);

router.post(
  "/warehouse/movements",
  createStockMovement
);

router.put(
  "/warehouse/movements/:id/approval",
  approveStockMovement
);

router.put(
  "/warehouse/:id/sheet",
  updateWarehouseSheet
);

router.post(
  "/warehouse/:id/sync-sheet",
  syncWarehouseGoogleSheet
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
  deleteAdminTaxRule
);

router.get(
  "/shipping",
  getAdminShipping
);

router.post(
  "/shipping/rules",
  createShippingRule
);

router.put(
  "/shipping/rules/:id",
  updateShippingRule
);

router.delete(
  "/shipping/rules/:id",
  deleteShippingRule
);

router.get(
  "/payments",
  getAdminPayments
);

router.put(
  "/payments/gst-return/:id",
  updateGstReturnStatus
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
  deleteAdminDiscount
);

/* BLOG */

router.get(
  "/blog",
  getAdminBlog
);

router.post(
  "/blog",
  createAdminBlogPost
);

router.delete(
  "/blog/:id",
  deleteAdminBlogPost
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
