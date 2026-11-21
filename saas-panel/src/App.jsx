import React, { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import ProductManagement from "./pages/ProductManagement";
import AddProduct from "./pages/AddProduct";
import AddCategory from "./pages/AddCategory";
import ProfileDetails from "./pages/ProfileDetails";
import StaffManagement from "./pages/StaffManagement";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import BillGenerator from "./pages/BillGenerator";
import Supplier from "./pages/Supplier";
import Reports from "./pages/Reports";
import AddBlog from "./pages/AddBlog";
import AddNewBlog from "./pages/AddNewBlog";
import AddEditProduct from "./pages/AddEditProduct";
import Login from "./pages/Login";
import CustomerManagement from "./pages/CustomerManagement";
import InventoryManagement from "./pages/InventoryManagement";
import PaymentIntegrations from "./pages/PaymentIntegrations";
import ShippingManagement from "./pages/ShippingManagement";
import StoreManagement from "./pages/StoreManagement";
import StaffForm from "./pages/StaffForm";
import StaffProfile from "./pages/StaffProfile";
import ManageCategories from "./pages/ManageCategories";
import OrderDetail from "./pages/OrderDetail";
import CustomerDetail from "./pages/CustomerDetail";
import CreateOrder from "./pages/CreateOrder";
import ActivityLog from "./pages/ActivityLog";
import DiscountManagement from "./pages/DiscountManagement";
import BrandManagement from "./pages/BrandManagement";
import BrandForm from "./pages/BrandForm";
import TagManagement from "./pages/TagManagement";
import CollectionManagement from "./pages/CollectionManagement";
import CollectionForm from "./pages/CollectionForm";
import MenuManagement from "./pages/MenuManagement";
import CorporateEnquiries from "./pages/CorporateEnquiries";
import CorporateEnquiryDetail from "./pages/CorporateEnquiryDetail";
import BundleManagement from "./pages/BundleManagement";
import OperationalCatalog from "./pages/OperationalCatalog";
import Tasks from "./pages/Tasks";
import HrManagement from "./pages/HrManagement";
import NewsletterManagement from "./pages/NewsletterManagement";
import ReturnsManagement from "./pages/ReturnsManagement";
import LeadManagement from "./pages/LeadManagement";
import SalesCatalogManagement from "./pages/SalesCatalogManagement";
import EnquiryManagement from "./pages/EnquiryManagement";
import DriveStorage from "./pages/DriveStorage";
import RemovalRequests from "./pages/RemovalRequests";
import SeoMarketing from "./pages/SeoMarketing";
import ReferralAffiliate from "./pages/ReferralAffiliate";
import AffiliateDashboard from "./pages/AffiliateDashboard";
import { Navigate } from "react-router-dom";
import { apiRequest, clearAdminSession, getAdminToken, getStoredAdmin } from "./lib/api";
import { expandPermissionKeys } from "./lib/permissions";
function App() {
  const [admin, setAdmin] = useState(() => getStoredAdmin());
  const isLoggedIn = Boolean(getAdminToken() && admin);
  const role = String(admin?.role || "").trim().toLowerCase();
  const isAffiliate = role === "affiliate";
  const isSalesman = role === "salesman";
  const isPrivilegedAdmin = ["super admin", "technical developer"].includes(role);
  const permissions = expandPermissionKeys(admin?.permissions);
  const can = (permission) => isPrivilegedAdmin || !permission || permissions.includes(permission);
  const firstAllowedPath = (() => {
    if (isSalesman) {
      if (can("leads")) return "/leads";
      if (can("sales_catalogs")) return "/sales-catalogs";
      if (can("tasks")) return "/tasks";
      if (can("drive")) return "/drive";
      if (can("dashboard")) return "/";
      return "/profile";
    }

    const routeOrder = [
      ["dashboard", "/"],
      ["products", "/product"],
      ["orders", "/orders"],
      ["brands", "/brands"],
      ["categories", "/categories"],
      ["inventory", "/inventory"],
      ["warehouse", "/warehouse"],
      ["store", "/shop-products"],
      ["referral_affiliate", "/referrals"],
      ["seo_marketing", "/seo"],
      ["tasks", "/tasks"],
      ["drive", "/drive"],
      ["users", "/staff"],
    ];
    const match = routeOrder.find(([permission]) => can(permission));
    return match?.[1] || "/profile";
  })();
  const guarded = (permission, element) => can(permission) ? element : <Navigate to={firstAllowedPath} replace />;

  useEffect(() => {
    const syncAdmin = (event) => {
      setAdmin(event.detail || getStoredAdmin());
    };

    window.addEventListener("admin-session-updated", syncAdmin);
    return () => window.removeEventListener("admin-session-updated", syncAdmin);
  }, []);

  const handleLogout = async () => {
    try {
      await apiRequest("/admin/logout", { method: "POST" });
    } catch {
      // Local logout should still complete if the API session has expired.
    }

    clearAdminSession();
    setAdmin(null);
  };

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      {isLoggedIn ? (
        isAffiliate ? (
          <div className="min-h-screen bg-[#F6F3ED]">
            <header className="sticky top-0 z-20 border-b border-[#E6D7BF] bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
              <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-[#8A541E]">Golden Creation Affiliate</p>
                  <h1 className="text-lg font-semibold text-[#242414]">{admin?.name || "Affiliate Dashboard"}</h1>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-xl bg-[#404C31] px-4 py-2 text-sm font-semibold text-white"
                >
                  Logout
                </button>
              </div>
            </header>
            <Routes>
              <Route path="/" element={<AffiliateDashboard />} />
              <Route path="/affiliate-dashboard" element={<AffiliateDashboard />} />
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        ) : (
        <>
          <Sidebar admin={admin} />
          <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-100 md:ml-64">
            <Navbar admin={admin} onLogout={handleLogout} />
            {isSalesman ? (
              <Routes>
                <Route path="/" element={guarded("dashboard", <Dashboard />)} />
                <Route path="/dashboard" element={guarded("dashboard", <Dashboard />)} />
                <Route path="/leads" element={guarded("leads", <LeadManagement />)} />
                <Route path="/sales-catalogs" element={guarded("sales_catalogs", <SalesCatalogManagement />)} />
                <Route path="/tasks" element={guarded("tasks", <Tasks />)} />
                <Route path="/drive" element={guarded("drive", <DriveStorage admin={admin} />)} />
                <Route path="/profile" element={<ProfileDetails />} />
                <Route path="/login" element={<Navigate to={firstAllowedPath} replace />} />
                <Route path="*" element={<Navigate to={firstAllowedPath} replace />} />
              </Routes>
            ) : (
            <Routes>
              <Route path="/" element={guarded("dashboard", <Dashboard />)} />
              <Route path="/dashboard" element={guarded("dashboard", <Dashboard />)} />
              <Route path="/orders" element={guarded("orders", <Orders />)} />
              <Route path="/orders/new" element={guarded("orders", <CreateOrder />)} />
              <Route path="/orders/:id" element={guarded("orders", <OrderDetail />)} />
              <Route path="/product" element={guarded("products", <ProductManagement />)} />
              <Route path="/brands" element={guarded("brands", <BrandManagement />)} />
              <Route path="/brands/new" element={guarded("brands", <BrandForm />)} />
              <Route path="/brands/:id" element={guarded("brands", <BrandForm />)} />
              <Route path="/tags" element={guarded("tags", <TagManagement />)} />
              <Route path="/collections" element={guarded("collections", <CollectionManagement />)} />
              <Route path="/collections/new" element={guarded("collections", <CollectionForm />)} />
              <Route path="/collections/:id" element={guarded("collections", <CollectionForm />)} />
              <Route path="/menus" element={guarded("menus", <MenuManagement />)} />
              <Route path="/corporate-enquiries" element={guarded("corporate_enquiries", <CorporateEnquiries />)} />
              <Route path="/corporate-enquiries/:id" element={guarded("corporate_enquiries", <CorporateEnquiryDetail />)} />
              <Route path="/enquiries" element={guarded("contact_enquiries", <EnquiryManagement />)} />
              <Route path="/bundles" element={guarded("bundles", <BundleManagement />)} />
              <Route path="/removal-requests" element={isPrivilegedAdmin ? <RemovalRequests /> : <Navigate to="/" replace />} />
              <Route path="/add-product" element={guarded("products", <AddProduct />)} />
              <Route path="/add-category" element={guarded("categories", <AddCategory />)} />
              <Route path="/blog" element={guarded("blog", <AddBlog />)} />
              <Route path="/profile" element={<ProfileDetails />} />
              <Route path="/activity" element={isPrivilegedAdmin ? <ActivityLog admin={admin} /> : <Navigate to="/" replace />} />
              <Route path="/staff" element={guarded("users", <StaffManagement />)} />
              <Route path="/staff/new" element={guarded("users", <StaffForm />)} />
              <Route path="/staff/:id" element={guarded("users", <StaffProfile />)} />
              <Route path="/users" element={guarded("users", <StaffManagement />)} />
              <Route path="/roles" element={guarded("roles", <Navigate to="/staff" replace />)} />
              <Route path="/customers" element={guarded("customers", <CustomerManagement />)} />
              <Route path="/customers/:id" element={guarded("customers", <CustomerDetail />)} />
              <Route path="/categories" element={guarded("categories", <ManageCategories />)} />
              <Route path="/inventory" element={guarded("inventory", <InventoryManagement />)} />
              <Route path="/leads" element={guarded("leads", <LeadManagement />)} />
              <Route path="/sales-catalogs" element={guarded("sales_catalogs", <SalesCatalogManagement />)} />
              <Route path="/warehouse" element={guarded("warehouse", <OperationalCatalog catalog="warehouse" />)} />
              <Route path="/godown" element={<Navigate to="/warehouse" replace />} />
              <Route path="/shop-settings" element={guarded("store", <StoreManagement />)} />
              <Route path="/shop-products" element={guarded("store", <OperationalCatalog catalog="store" />)} />
              <Route path="/store" element={<Navigate to="/shop-settings" replace />} />
              <Route path="/store-products" element={<Navigate to="/shop-products" replace />} />
              <Route path="/tasks" element={guarded("tasks", <Tasks />)} />
              <Route path="/drive" element={guarded("drive", <DriveStorage admin={admin} />)} />
              <Route path="/hr" element={guarded("hr", <HrManagement />)} />
              <Route path="/newsletter" element={guarded("newsletter", <NewsletterManagement />)} />
              <Route path="/returns" element={guarded("returns", <ReturnsManagement />)} />
              <Route path="/shipping" element={guarded("shipping", <ShippingManagement />)} />
              <Route path="/payments" element={guarded("payments", <PaymentIntegrations />)} />
              <Route path="/referrals" element={guarded("referral_affiliate", <ReferralAffiliate />)} />
              <Route path="/seo" element={guarded("seo_marketing", <SeoMarketing />)} />
              <Route path="/discounts" element={guarded("discounts", <DiscountManagement />)} />
              <Route path="/generate-bill" element={guarded("billing", <BillGenerator />)} />
              <Route path="/supplier" element={guarded("suppliers", <Supplier />)} />
              <Route path="/reports" element={guarded("reports", <Reports />)} />
              <Route path="/blog-list" element={guarded("blog", <AddBlog />)} />
              <Route path="/add-blog" element={guarded("blog", <AddNewBlog />)} />
              <Route path="/edit-product" element={guarded("products", <AddEditProduct />)} />
              <Route path="/login" element={<Navigate to="/" replace />} />
            </Routes>
            )}
          </div>
        </>
        )
      ) : (
        <Routes>
          <Route path="/login" element={<Login onLogin={setAdmin} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}

export default App;
