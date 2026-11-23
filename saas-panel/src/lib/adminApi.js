import { API_BASE_URL, apiRequest, getAdminToken } from "./api";

export async function getAdminDashboard() {
  return apiRequest(
    "/admin/dashboard"
  );
}

export async function getAdminOrders() {
  return apiRequest(
    "/admin/orders"
  );
}

export async function getAdminStaff() {
  return apiRequest(
    "/admin/staff"
  );
}

export async function getAdminContactEnquiries({ q = "", status = "", page = 1, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  params.set("page", page);
  params.set("limit", limit);
  return apiRequest(`/admin/contact-enquiries?${params.toString()}`);
}

export async function updateAdminContactEnquiry(id, payload) {
  return apiRequest(`/admin/contact-enquiries/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getAdminOrderDetail(
  id
) {
  return apiRequest(
    `/admin/orders/${id}`
  );
}

export async function createAdminOrder(
  order
) {
  return apiRequest(
    "/admin/orders",
    {
      method: "POST",
      body: JSON.stringify(
        order
      ),
    }
  );
}

export async function getAdminStaffProfile(
  id
) {
  return apiRequest(
    `/admin/staff/${id}`
  );
}

export async function createAdminStaff(
  staff
) {
  return apiRequest(
    "/admin/staff",
    {
      method: "POST",
      body: JSON.stringify(
        staff
      ),
    }
  );
}

export async function updateAdminStaff(
  id,
  staff
) {
  return apiRequest(
    `/admin/staff/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(
        staff
      ),
    }
  );
}

export async function deleteAdminStaff(id) {
  return apiRequest(
    `/admin/staff/${id}`,
    {
      method: "DELETE",
    }
  );
}

export async function getAdminRoles() {
  return apiRequest(
    "/admin/roles"
  );
}

export async function createAdminRole(
  role
) {
  return apiRequest(
    "/admin/roles",
    {
      method: "POST",
      body: JSON.stringify(
        role
      ),
    }
  );
}

export async function getAdminActivity(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  return apiRequest(
    `/admin/activity${params.toString() ? `?${params.toString()}` : ""}`
  );
}

export async function searchAdmin(
  query
) {
  return apiRequest(
    `/admin/search?q=${encodeURIComponent(
      query
    )}`
  );
}

export async function getAdminNotifications() {
  return apiRequest(
    "/admin/notifications"
  );
}

export async function markAdminNotificationsRead(
  id
) {
  return apiRequest(
    id
      ? `/admin/notifications/${id}/read`
      : "/admin/notifications/read",
    {
      method: "PUT",
    }
  );
}

export async function getReferralSettings() {
  return apiRequest("/admin/referrals/settings");
}

export async function updateReferralSettings(settings) {
  return apiRequest("/admin/referrals/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export async function getCommissionRules() {
  return apiRequest("/admin/referrals/commission-rules");
}

export async function saveCommissionRule(rule) {
  const id = rule.id || rule.ruleId;
  return apiRequest(id ? `/admin/referrals/commission-rules/${id}` : "/admin/referrals/commission-rules", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(rule),
  });
}

export async function deleteCommissionRule(id) {
  return apiRequest(`/admin/referrals/commission-rules/${id}`, {
    method: "DELETE",
  });
}

export async function getReferralCustomers() {
  return apiRequest("/admin/referrals/customers");
}

export async function getReferralLedger() {
  return apiRequest("/admin/referrals/ledger");
}

export async function createReferralManualAdjustment(payload) {
  return apiRequest("/admin/referrals/manual-adjustments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getReferralReports() {
  return apiRequest("/admin/referrals/reports");
}

export async function getAffiliateApplications() {
  return apiRequest("/admin/affiliate-applications");
}

export async function updateAffiliateApplication(id, payload) {
  return apiRequest(`/admin/affiliate-applications/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getAffiliates() {
  return apiRequest("/admin/affiliates");
}

export async function createAffiliate(payload) {
  return apiRequest("/admin/affiliates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAffiliate(id, payload) {
  return apiRequest(`/admin/affiliates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getWalletWithdrawals() {
  return apiRequest("/admin/wallet/withdrawals");
}

export async function updateWalletWithdrawal(id, payload) {
  return apiRequest(`/admin/wallet/withdrawals/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getAffiliateDashboard() {
  return apiRequest("/affiliate/dashboard");
}

export async function getAffiliateMe() {
  return apiRequest("/affiliate/me");
}

export async function createAffiliateLink(payload) {
  return apiRequest("/affiliate/links", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createAffiliatePayoutMethod(payload) {
  return apiRequest("/affiliate/wallet/payout-methods", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createAffiliateWithdrawal(payload) {
  return apiRequest("/affiliate/wallet/withdrawals", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getAdminCategories() {
  return apiRequest(
    "/admin/categories"
  );
}

export async function createAdminCategory(
  category
) {
  return apiRequest(
    "/admin/categories",
    {
      method: "POST",
      body: JSON.stringify(
        category
      ),
    }
  );
}

export async function updateAdminCategory(
  id,
  category
) {
  return apiRequest(
    `/admin/categories/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(
        category
      ),
    }
  );
}

export async function deleteAdminCategory(id) {
  return apiRequest(
    `/admin/categories/${id}`,
    {
      method: "DELETE",
    }
  );
}

export async function importAdminProducts(
  products,
  options = {}
) {
  return apiRequest(
    "/admin/products/import",
    {
      method: "POST",
      body: JSON.stringify({
        products,
        ...options,
      }),
    }
  );
}

export async function uploadAdminMedia(file, folder = "admin") {
  if (!file) {
    throw new Error("File is required");
  }

  const token = getAdminToken();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);

  const response = await fetch(
    `${API_BASE_URL}/admin/media/upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.message || "Unable to upload media");
  }

  return payload.media;
}

export async function deleteAdminMedia(value) {
  return apiRequest("/admin/media", {
    method: "DELETE",
    body: JSON.stringify(
      /^https?:\/\//i.test(String(value || "")) ? { url: value } : { key: value }
    ),
  });
}

export async function getMediaMigration() {
  return apiRequest("/admin/media/migration");
}

export async function runMediaMigration(limit = 100) {
  return apiRequest("/admin/media/migration/run", {
    method: "POST",
    body: JSON.stringify({ limit }),
  });
}

export async function createAdminVideoUpload(file, folder = "blog-videos") {
  const prepared = await apiRequest("/admin/media/video-upload-url", {
    method: "POST",
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      folder,
    }),
  });
  const response = await fetch(prepared.media.uploadUrl, {
    method: "PUT",
    headers: prepared.media.headers,
    body: file,
  });
  if (!response.ok) throw new Error("Video upload failed");
  const completed = await apiRequest("/admin/media/video-upload-complete", {
    method: "POST",
    body: JSON.stringify({ key: prepared.media.key }),
  });
  return completed.media;
}

export async function getDriveItems(filters = {}) {
  return apiRequest(withQuery("/admin/drive", filters));
}

export async function createDriveFolder(payload) {
  return apiRequest("/admin/drive/folders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateDriveFolder(id, payload) {
  return apiRequest(`/admin/drive/folders/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteDriveFolder(id) {
  return apiRequest(`/admin/drive/folders/${id}`, {
    method: "DELETE",
  });
}

export async function uploadDriveFile(file, folderId) {
  if (!file) throw new Error("File is required");

  const token = getAdminToken();
  const formData = new FormData();
  formData.append("file", file);
  if (folderId) formData.append("folderId", folderId);

  const response = await fetch(`${API_BASE_URL}/admin/drive/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.message || "Unable to upload Drive file");
  }

  return payload.file;
}

export async function updateDriveFile(id, payload) {
  return apiRequest(`/admin/drive/files/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteDriveFile(id) {
  return apiRequest(`/admin/drive/files/${id}`, {
    method: "DELETE",
  });
}

export async function getAdminBrands(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  });

  return apiRequest(
    `/admin/brands${params.toString() ? `?${params.toString()}` : ""}`
  );
}

export async function getAdminBrandDetail(id) {
  return apiRequest(
    `/admin/brands/${id}`
  );
}

export async function createAdminBrand(brand) {
  return apiRequest(
    "/admin/brands",
    {
      method: "POST",
      body: JSON.stringify(brand),
    }
  );
}

export async function updateAdminBrand(id, brand) {
  return apiRequest(
    `/admin/brands/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(brand),
    }
  );
}

export async function updateAdminBrandStatus(id, status) {
  return apiRequest(
    `/admin/brands/${id}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }
  );
}

export async function updateAdminBrandFeatured(id, featured) {
  return apiRequest(
    `/admin/brands/${id}/featured`,
    {
      method: "PATCH",
      body: JSON.stringify({ featured }),
    }
  );
}

export async function deleteAdminBrand(id) {
  return apiRequest(
    `/admin/brands/${id}`,
    {
      method: "DELETE",
    }
  );
}

export async function restoreAdminBrand(id) {
  return apiRequest(
    `/admin/brands/${id}/restore`,
    {
      method: "PUT",
    }
  );
}

export async function getAdminTags(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  });

  return apiRequest(
    `/admin/tags${params.toString() ? `?${params.toString()}` : ""}`
  );
}

export async function createAdminTag(tag) {
  return apiRequest(
    "/admin/tags",
    {
      method: "POST",
      body: JSON.stringify(tag),
    }
  );
}

export async function updateAdminTag(id, tag) {
  return apiRequest(
    `/admin/tags/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(tag),
    }
  );
}

export async function updateAdminTagStatus(id, status) {
  return apiRequest(
    `/admin/tags/${id}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }
  );
}

export async function deleteAdminTag(id) {
  return apiRequest(
    `/admin/tags/${id}`,
    {
      method: "DELETE",
    }
  );
}

export async function bulkDeleteAdminTags(ids) {
  return apiRequest(
    "/admin/tags/bulk-delete",
    {
      method: "POST",
      body: JSON.stringify({ ids }),
    }
  );
}

export async function getAdminCollections(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  });

  return apiRequest(
    `/admin/collections${params.toString() ? `?${params.toString()}` : ""}`
  );
}

export async function getAdminCollectionDetail(id) {
  return apiRequest(
    `/admin/collections/${id}`
  );
}

export async function createAdminCollection(collection) {
  return apiRequest(
    "/admin/collections",
    {
      method: "POST",
      body: JSON.stringify(collection),
    }
  );
}

export async function updateAdminCollection(id, collection) {
  return apiRequest(
    `/admin/collections/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(collection),
    }
  );
}

export async function updateAdminCollectionStatus(id, status) {
  return apiRequest(
    `/admin/collections/${id}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }
  );
}

export async function deleteAdminCollection(id) {
  return apiRequest(
    `/admin/collections/${id}`,
    {
      method: "DELETE",
    }
  );
}

export async function previewAdminCollection(collection) {
  return apiRequest(
    "/admin/collections/preview",
    {
      method: "POST",
      body: JSON.stringify(collection),
    }
  );
}

export async function getAdminMenus() {
  return apiRequest(
    "/admin/menus"
  );
}

export async function getAdminMenuReferences() {
  return apiRequest(
    "/admin/menus/references"
  );
}

export async function createAdminMenu(menu) {
  return apiRequest(
    "/admin/menus",
    {
      method: "POST",
      body: JSON.stringify(menu),
    }
  );
}

export async function updateAdminMenu(id, menu) {
  return apiRequest(
    `/admin/menus/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(menu),
    }
  );
}

export async function reorderAdminMenus(items) {
  return apiRequest(
    "/admin/menus/reorder",
    {
      method: "PUT",
      body: JSON.stringify({ items }),
    }
  );
}

export async function duplicateAdminMenu(id) {
  return apiRequest(
    `/admin/menus/${id}/duplicate`,
    {
      method: "POST",
    }
  );
}

export async function deleteAdminMenu(id) {
  return apiRequest(
    `/admin/menus/${id}`,
    {
      method: "DELETE",
    }
  );
}

export async function getAdminCorporateEnquiries(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });

  return apiRequest(
    `/admin/corporate-enquiries${params.toString() ? `?${params.toString()}` : ""}`
  );
}

export async function getAdminCorporateEnquiryDetail(id) {
  return apiRequest(
    `/admin/corporate-enquiries/${id}`
  );
}

export async function updateAdminCorporateEnquiry(id, enquiry) {
  return apiRequest(
    `/admin/corporate-enquiries/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(enquiry),
    }
  );
}

export async function getAdminBundles() {
  return apiRequest(
    "/admin/bundles"
  );
}

export async function getAdminBundleDetail(id) {
  return apiRequest(
    `/admin/bundles/${id}`
  );
}

export async function createAdminBundle(bundle) {
  return apiRequest(
    "/admin/bundles",
    {
      method: "POST",
      body: JSON.stringify(bundle),
    }
  );
}

export async function updateAdminBundle(id, bundle) {
  return apiRequest(
    `/admin/bundles/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(bundle),
    }
  );
}

export async function deleteAdminBundle(id) {
  return apiRequest(
    `/admin/bundles/${id}`,
    {
      method: "DELETE",
    }
  );
}

export async function getAdminCustomers() {
  return apiRequest(
    "/admin/customers"
  );
}

export async function getAdminCustomerDetail(
  id
) {
  return apiRequest(
    `/admin/customers/${id}`
  );
}

export async function createAdminCustomer(
  customer
) {
  return apiRequest(
    "/admin/customers",
    {
      method: "POST",
      body: JSON.stringify(
        customer
      ),
    }
  );
}

export async function deleteAdminCustomer(
  id
) {
  return apiRequest(
    `/admin/customers/${id}`,
    {
      method: "DELETE",
    }
  );
}

export async function getAdminInventory() {
  return apiRequest(
    "/admin/inventory"
  );
}

export async function getAdminGodowns() {
  return apiRequest(
    "/admin/godowns"
  );
}

export async function getAdminWarehouse() {
  return apiRequest(
    "/admin/warehouse"
  );
}

export async function createWarehouseStock(
  stock
) {
  return apiRequest(
    "/admin/warehouse/stock",
    {
      method: "POST",
      body: JSON.stringify(
        stock
      ),
    }
  );
}

export async function createWarehouseProduct(
  product
) {
  return apiRequest(
    "/admin/warehouse/products",
    {
      method: "POST",
      body: JSON.stringify(
        product
      ),
    }
  );
}

export async function syncWarehouseProducts(
  warehouseId
) {
  return apiRequest(
    "/admin/warehouse/sync-products",
    {
      method: "POST",
      body: JSON.stringify({
        warehouseId,
      }),
    }
  );
}

export async function createWarehouseMovement(
  movement
) {
  return apiRequest(
    "/admin/warehouse/movements",
    {
      method: "POST",
      body: JSON.stringify(
        movement
      ),
    }
  );
}

export async function updateWarehouseSheet(
  warehouseId,
  sheet
) {
  return apiRequest(
    `/admin/warehouse/${warehouseId}/sheet`,
    {
      method: "PUT",
      body: JSON.stringify(
        sheet
      ),
    }
  );
}

export async function syncWarehouseSheet(
  warehouseId
) {
  return apiRequest(
    `/admin/warehouse/${warehouseId}/sync-sheet`,
    {
      method: "POST",
    }
  );
}

export async function approveWarehouseMovement(
  id,
  status
) {
  return apiRequest(
    `/admin/warehouse/movements/${id}/approval`,
    {
      method: "PUT",
      body: JSON.stringify({
        status,
      }),
    }
  );
}

export async function getAdminSuppliers() {
  return apiRequest(
    "/admin/suppliers"
  );
}

export async function createAdminSupplier(
  supplier
) {
  return apiRequest(
    "/admin/suppliers",
    {
      method: "POST",
      body: JSON.stringify(
        supplier
      ),
    }
  );
}

export async function updateAdminSupplier(
  id,
  supplier
) {
  return apiRequest(
    `/admin/suppliers/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(
        supplier
      ),
    }
  );
}

export async function deleteAdminSupplier(
  id
) {
  return apiRequest(
    `/admin/suppliers/${id}`,
    {
      method: "DELETE",
    }
  );
}

export async function getAdminStoreSettings() {
  return apiRequest(
    "/admin/store-settings"
  );
}

export async function updateAdminStoreSetting(
  key,
  value
) {
  return apiRequest(
    `/admin/store-settings/${key}`,
    {
      method: "PUT",
      body: JSON.stringify({
        value,
      }),
    }
  );
}

export async function getAdminTaxRules() {
  return apiRequest(
    "/admin/tax-rules"
  );
}

export async function createAdminTaxRule(
  rule
) {
  return apiRequest(
    "/admin/tax-rules",
    {
      method: "POST",
      body: JSON.stringify(
        rule
      ),
    }
  );
}

export async function updateAdminTaxRule(
  id,
  rule
) {
  return apiRequest(
    `/admin/tax-rules/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(
        rule
      ),
    }
  );
}

export async function deleteAdminTaxRule(
  id
) {
  return apiRequest(
    `/admin/tax-rules/${id}`,
    {
      method: "DELETE",
    }
  );
}

export async function getAdminShipping() {
  return apiRequest(
    "/admin/shipping"
  );
}

export async function createShippingRule(
  rule
) {
  return apiRequest(
    "/admin/shipping/rules",
    {
      method: "POST",
      body: JSON.stringify(
        rule
      ),
    }
  );
}

export async function updateShippingRule(
  id,
  rule
) {
  return apiRequest(
    `/admin/shipping/rules/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(
        rule
      ),
    }
  );
}

export async function deleteShippingRule(
  id
) {
  return apiRequest(
    `/admin/shipping/rules/${id}`,
    {
      method: "DELETE",
    }
  );
}

export async function getAdminPayments() {
  return apiRequest(
    "/admin/payments"
  );
}

export async function getPaymentSettings() {
  return apiRequest("/admin/payment-settings");
}

export async function updatePaymentSettings(settings) {
  return apiRequest("/admin/payment-settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export async function savePartialCodRule(rule) {
  return apiRequest("/admin/payment-settings/partial-cod-rules", {
    method: "POST",
    body: JSON.stringify(rule),
  });
}

export async function deletePartialCodRule(id) {
  return apiRequest(`/admin/payment-settings/partial-cod-rules/${id}`, {
    method: "DELETE",
  });
}

export async function updateGstReturnStatus(
  id,
  status
) {
  return apiRequest(
    `/admin/payments/gst-return/${id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        status,
      }),
    }
  );
}

export async function getAdminDiscounts(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  return apiRequest(
    `/admin/discounts${params.toString() ? `?${params.toString()}` : ""}`
  );
}

export async function getAdminDiscountDetail(id) {
  return apiRequest(
    `/admin/discounts/${id}`
  );
}

export async function createAdminDiscount(discount) {
  return apiRequest(
    "/admin/discounts",
    {
      method: "POST",
      body: JSON.stringify(discount),
    }
  );
}

export async function updateAdminDiscount(id, discount) {
  return apiRequest(
    `/admin/discounts/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(discount),
    }
  );
}

export async function updateAdminDiscountStatus(id, status) {
  return apiRequest(
    `/admin/discounts/${id}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }
  );
}

export async function duplicateAdminDiscount(id) {
  return apiRequest(
    `/admin/discounts/${id}/duplicate`,
    {
      method: "POST",
    }
  );
}

export async function deleteAdminDiscount(id) {
  return apiRequest(
    `/admin/discounts/${id}`,
    {
      method: "DELETE",
    }
  );
}

export async function getAdminDiscountAnalytics(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  return apiRequest(
    `/admin/discounts/analytics${params.toString() ? `?${params.toString()}` : ""}`
  );
}

export async function downloadAdminDiscountsCsv() {
  const token = getAdminToken();
  const response = await fetch(
    `${API_BASE_URL}/admin/discounts/export`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Unable to export discounts");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "discounts.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function updateAdminOrderStatus(
  id,
  status,
  payload = {}
) {
  return apiRequest(
    `/admin/orders/${id}/status`,
    {
      method: "PUT",
      body: JSON.stringify({
        status,
        ...payload,
      }),
    }
  );
}

export async function getAdminReports(
  filters = {}
) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(
    ([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    }
  );

  return apiRequest(
    `/admin/reports${params.toString() ? `?${params.toString()}` : ""}`
  );
}

export async function getAdminBilling() {
  return apiRequest(
    "/admin/billing"
  );
}

export async function createAdminInvoice(
  invoice
) {
  return apiRequest(
    "/admin/billing",
    {
      method: "POST",
      body: JSON.stringify(
        invoice
      ),
    }
  );
}

export async function sendAdminBill(
  id,
  payload
) {
  return apiRequest(
    `/admin/billing/${id}/send`,
    {
      method: "POST",
      body: JSON.stringify(
        payload
      ),
    }
  );
}

export async function downloadAdminBillPdf(
  id
) {
  const token = getAdminToken();
  const response = await fetch(
    `${API_BASE_URL}/admin/billing/${id}/pdf`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    let message = "Unable to download bill PDF";

    try {
      const payload = await response.json();
      message = payload?.message || message;
    } catch {
      // Keep the generic message for non-JSON PDF errors.
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bill-${id}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function getAdminBlog() {
  return apiRequest(
    "/admin/blog"
  );
}

export async function createAdminBlogPost(
  post
) {
  return apiRequest(
    "/admin/blog",
    {
      method: "POST",
      body: JSON.stringify(
        post
      ),
    }
  );
}

export async function deleteAdminBlogPost(
  id
) {
  return apiRequest(
    `/admin/blog/${id}`,
    {
      method: "DELETE",
    }
  );
}

function withQuery(path, filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, value);
  });
  return `${path}${params.toString() ? `?${params.toString()}` : ""}`;
}

export async function getAdminLookup(type, filters = {}) {
  return apiRequest(withQuery(`/admin/lookups/${type}`, filters));
}

export async function getCatalogInventory(filters = {}) {
  return apiRequest(withQuery("/admin/inventory/catalog", filters));
}

export async function getProductStockDetail(id) {
  return apiRequest(`/admin/inventory/products/${id}/stock`);
}

export async function updateProductStock(id, stock) {
  return apiRequest(`/admin/inventory/products/${id}/stock`, {
    method: "PUT",
    body: JSON.stringify(stock),
  });
}

export async function getOperationalCatalog(catalog, filters = {}) {
  return apiRequest(withQuery(`/admin/catalogs/${catalog}`, filters));
}

export async function saveOperationalProduct(catalog, product) {
  return apiRequest(`/admin/catalogs/${catalog}/products`, {
    method: "POST",
    body: JSON.stringify(product),
  });
}

export async function saveOperationalStock(catalog, stock) {
  return apiRequest(`/admin/catalogs/${catalog}/stock`, {
    method: "POST",
    body: JSON.stringify(stock),
  });
}

export async function submitOperationalMovement(catalog, movement) {
  return apiRequest(`/admin/catalogs/${catalog}/movements`, {
    method: "POST",
    body: JSON.stringify(movement),
  });
}

export async function approveOperationalMovement(catalog, id, status) {
  return apiRequest(`/admin/catalogs/${catalog}/movements/${id}/approval`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export async function importStoreProducts(products, { dryRun = false } = {}) {
  return apiRequest("/admin/catalogs/store/import", {
    method: "POST",
    body: JSON.stringify({ products, dryRun }),
  });
}

export async function getAdminTasks() {
  return apiRequest("/admin/tasks");
}

export async function createAdminTask(task) {
  return apiRequest("/admin/tasks", { method: "POST", body: JSON.stringify(task) });
}

export async function updateTaskAssignment(id, assignment) {
  return apiRequest(`/admin/tasks/assignments/${id}`, { method: "PUT", body: JSON.stringify(assignment) });
}

export async function getHrSummary() {
  return apiRequest("/admin/hr");
}

export async function saveHrAttendance(attendance) {
  return apiRequest("/admin/hr/attendance", {
    method: "POST",
    body: JSON.stringify(attendance),
  });
}

export async function getNewsletterSubscribers(filters = {}) {
  return apiRequest(withQuery("/admin/newsletter", filters));
}

export async function updateNewsletterSubscriber(id, status) {
  return apiRequest(`/admin/newsletter/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
}

export async function getAdminReturns() {
  return apiRequest("/admin/returns");
}

export async function updateAdminReturn(id, payload) {
  return apiRequest(`/admin/returns/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function updateAdminShipment(id, payload) {
  return apiRequest(`/admin/orders/${id}/shipment`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function markOrderCodCollected(id, remarks = "") {
  return apiRequest(`/admin/orders/${id}/cod-collected`, {
    method: "PUT",
    body: JSON.stringify({ remarks }),
  });
}

export async function updateAdminBlogPost(id, post) {
  return apiRequest(`/admin/blog/${id}`, { method: "PUT", body: JSON.stringify(post) });
}

export async function getSalesmen() {
  return apiRequest("/admin/salesmen");
}

export async function getSalesLeads(filters = {}) {
  return apiRequest(withQuery("/admin/leads", filters));
}

export async function getSalesLead(id) {
  return apiRequest(`/admin/leads/${id}`);
}

export async function createSalesLead(payload) {
  return apiRequest("/admin/leads", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateSalesLead(id, payload) {
  return apiRequest(`/admin/leads/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function downloadSalesLeads(filters = {}) {
  const response = await fetch(`${API_BASE_URL}${withQuery("/admin/leads/export", filters)}`, {
    headers: { Authorization: `Bearer ${getAdminToken()}` },
  });
  if (!response.ok) throw new Error("Unable to export leads");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "golden-creation-leads.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function searchSalesCatalogProducts(filters = {}) {
  const normalized = { ...filters };
  ["categoryIds", "brandIds", "tagIds", "collectionIds"].forEach((key) => {
    if (Array.isArray(normalized[key])) normalized[key] = normalized[key].join(",");
  });
  return apiRequest(withQuery("/admin/sales-catalog-products", normalized));
}

export async function getSalesCatalogs(filters = {}) {
  return apiRequest(withQuery("/admin/sales-catalogs", filters));
}

export async function getSalesCatalog(id) {
  return apiRequest(`/admin/sales-catalogs/${id}`);
}

export async function createSalesCatalog(payload) {
  return apiRequest("/admin/sales-catalogs", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateSalesCatalog(id, payload) {
  return apiRequest(`/admin/sales-catalogs/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function duplicateSalesCatalog(id) {
  return apiRequest(`/admin/sales-catalogs/${id}/duplicate`, { method: "POST" });
}

export async function generateSalesCatalog(id) {
  return apiRequest(`/admin/sales-catalogs/${id}/generate`, { method: "POST" });
}

export async function archiveSalesCatalog(id) {
  return apiRequest(`/admin/sales-catalogs/${id}/archive`, { method: "POST" });
}

export async function deleteSalesCatalog(id) {
  return apiRequest(`/admin/sales-catalogs/${id}`, { method: "DELETE" });
}

export async function recordSalesCatalogShare(id, payload) {
  return apiRequest(`/admin/sales-catalogs/${id}/share`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function downloadSalesCatalog(id, name = "catalog") {
  const response = await fetch(`${API_BASE_URL}/admin/sales-catalogs/${id}/download`, {
    headers: { Authorization: `Bearer ${getAdminToken()}` },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "Unable to download catalog");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${String(name || "catalog").replace(/[^a-z0-9]+/gi, "-")}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function runBulkAction(entity, action, ids) {
  return apiRequest(`/admin/bulk/${entity}`, { method: "POST", body: JSON.stringify({ action, ids }) });
}

export async function getRemovalRequests(filters = {}) {
  return apiRequest(withQuery("/admin/removal-requests", filters));
}

export async function decideRemovalRequest(id, payload) {
  return apiRequest(`/admin/removal-requests/${id}/decision`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function downloadAdminXlsx(type, filters = {}) {
  const response = await fetch(`${API_BASE_URL}${withQuery(`/admin/exports/${type}`, filters)}`, {
    headers: { Authorization: `Bearer ${getAdminToken()}` },
  });
  if (!response.ok) throw new Error("Unable to export workbook");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${type}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function getSeoSettings() {
  return apiRequest("/admin/seo/settings");
}

export async function updateSeoSettings(settings) {
  return apiRequest("/admin/seo/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export async function getSeoScripts() {
  return apiRequest("/admin/seo/scripts");
}

export async function saveSeoScript(script) {
  return apiRequest(script?.id ? `/admin/seo/scripts/${script.id}` : "/admin/seo/scripts", {
    method: script?.id ? "PUT" : "POST",
    body: JSON.stringify(script),
  });
}

export async function deleteSeoScript(id) {
  return apiRequest(`/admin/seo/scripts/${id}`, {
    method: "DELETE",
  });
}

export async function getProductSeo(id) {
  return apiRequest(`/admin/seo/products/${id}`);
}

export async function updateProductSeo(id, payload) {
  return apiRequest(`/admin/seo/products/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function getBlogSeo(id) {
  return apiRequest(`/admin/seo/blogs/${id}`);
}

export async function updateBlogSeo(id, payload) {
  return apiRequest(`/admin/seo/blogs/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function getMediaSeo(id) {
  return apiRequest(`/admin/seo/media/${id}`);
}

export async function updateMediaSeo(id, payload) {
  return apiRequest(`/admin/seo/media/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function getSeoAudit() {
  return apiRequest("/admin/seo/audit");
}

export async function getSeoFeedStatus() {
  return apiRequest("/admin/seo/feed-status");
}
