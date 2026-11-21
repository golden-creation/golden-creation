export const DEFAULT_PERMISSION_CATALOG = [
  { key: "dashboard", label: "Dashboard", group: "Core" },
  { key: "products", label: "Website Products", group: "Website Management" },
  { key: "categories", label: "Manage Categories", group: "Website Management" },
  { key: "brands", label: "Brand Management", group: "Website Management" },
  { key: "tags", label: "Tag Management", group: "Website Management" },
  { key: "collections", label: "Collection Management", group: "Website Management" },
  { key: "menus", label: "Menu Management", group: "Website Management" },
  { key: "bundles", label: "Bundle Management", group: "Website Management" },
  { key: "orders", label: "Order Management", group: "Website Management" },
  { key: "returns", label: "Returns & Replacements", group: "Website Management" },
  { key: "billing", label: "Billing Management", group: "Business Management" },
  { key: "customers", label: "Customers", group: "Website Management" },
  { key: "corporate_enquiries", label: "Corporate Enquiries", group: "Website Management" },
  { key: "contact_enquiries", label: "Enquiry Management", group: "Website Management" },
  { key: "newsletter", label: "Newsletter Subscribers", group: "Website Management" },
  { key: "shipping", label: "Shipping", group: "Website Management" },
  { key: "payments", label: "Payment Management", group: "Website Management" },
  { key: "discounts", label: "Discount Management", group: "Website Management" },
  { key: "referral_affiliate", label: "Referral & Affiliate", group: "Website Management" },
  { key: "seo_marketing", label: "SEO & Marketing", group: "Website Management" },
  { key: "blog", label: "Blog", group: "Website Management" },
  { key: "inventory", label: "Inventory", group: "Business Management" },
  { key: "warehouse", label: "Warehouse Management", group: "Business Management" },
  { key: "store", label: "Shop Products & Store Settings", group: "Business Management" },
  { key: "tasks", label: "To-Do Workspace", group: "Business Management" },
  { key: "hr", label: "HR Lite", group: "Business Management" },
  { key: "suppliers", label: "Supplier Management", group: "Business Management" },
  { key: "reports", label: "Reports", group: "Business Management" },
  { key: "leads", label: "Lead Management", group: "Sales" },
  { key: "sales_catalogs", label: "Catalog Sharing", group: "Sales" },
  { key: "drive", label: "Drive Storage", group: "Files & Media" },
  { key: "media", label: "Media Uploads", group: "Files & Media" },
  { key: "profile", label: "Profile Details", group: "Account" },
  { key: "users", label: "Staff Management", group: "Admin" },
  { key: "roles", label: "Role Management", group: "Admin" },
];

export function permissionKey(permission) {
  return String(permission?.key || permission || "").trim();
}

export function permissionLabel(permission) {
  const key = permissionKey(permission);
  return permission?.label || DEFAULT_PERMISSION_CATALOG.find((item) => item.key === key)?.label || key;
}

export function normalizePermissionCatalog(catalog) {
  const source = Array.isArray(catalog) && catalog.length ? catalog : DEFAULT_PERMISSION_CATALOG;

  return source
    .map((permission) => {
      const key = permissionKey(permission);
      if (!key) return null;
      return {
        key,
        label: permission?.label || permissionLabel(key),
        group: permission?.group || "Other",
      };
    })
    .filter(Boolean);
}

export function groupPermissions(catalog) {
  return normalizePermissionCatalog(catalog).reduce((groups, permission) => {
    const groupName = permission.group || "Other";
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push(permission);
    return groups;
  }, {});
}

export function expandPermissionKeys(permissions) {
  const expanded = new Set(
    (Array.isArray(permissions) ? permissions : [])
      .map((permission) => permissionKey(permission))
      .filter(Boolean)
  );

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
}
