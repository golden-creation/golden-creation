import React, { useState } from "react";
import logo from "../assets/golden-creation-official-logo.png";
import menuIcon from "../assets/menu.png";
import dashboardIcon from "../assets/dashboard (1).png";
import ordersIcon from "../assets/online-shopping.png";
import productIcon from "../assets/box.png";
import blogIcon from "../assets/blogging.png";
import profiledetails from "../assets/user (1).png";
import { useLocation, useNavigate} from "react-router-dom";
import { expandPermissionKeys } from "../lib/permissions";
import usersIcon from "../assets/user.png";
import godownIcon from "../assets/warehouse.png";
import supplierIcon from "../assets/cargo-truck.png";
import reportIcon from "../assets/report.png";
function Sidebar({ admin }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const role = String(admin?.role || "").trim().toLowerCase();
  const isSalesman = role === "salesman";
  const isPrivilegedAdmin = ["super admin", "technical developer"].includes(role);
  const canUseSalesWorkspace = isPrivilegedAdmin || isSalesman;
  const permissions = expandPermissionKeys(admin?.permissions);
  const can = (permission) => isPrivilegedAdmin || !permission || permissions.includes(permission);
  const fullMenuGroups = [
    {
      title: "Dashboard",
      items: [{ name: "Dashboard", icon: dashboardIcon, path: "/", permission: "dashboard" }],
    },
    {
      title: "Website Management",
      items: [
        { name: "Website Products", icon: productIcon, path: "/product", permission: "products" },
        { name: "Manage Categories", icon: productIcon, path: "/categories", permission: "categories" },
        { name: "Order Management", icon: ordersIcon, path: "/orders", permission: "orders" },
        { name: "Removal Requests", icon: reportIcon, path: "/removal-requests", superOnly: true },
        { name: "Brand Management", icon: productIcon, path: "/brands", permission: "brands" },
        { name: "Tag Management", icon: productIcon, path: "/tags", permission: "tags" },
        { name: "Collection Management", icon: productIcon, path: "/collections", permission: "collections" },
        { name: "Menu Management", icon: dashboardIcon, path: "/menus", permission: "menus" },
        { name: "Bundle Management", icon: productIcon, path: "/bundles", permission: "bundles" },
        { name: "Corporate Enquiries", icon: reportIcon, path: "/corporate-enquiries", permission: "corporate_enquiries" },
        { name: "Enquiry Management", icon: reportIcon, path: "/enquiries", permission: "contact_enquiries" },
        { name: "Newsletter Subscribers", icon: usersIcon, path: "/newsletter", permission: "newsletter" },
        { name: "Returns & Replacements", icon: ordersIcon, path: "/returns", permission: "returns" },
        { name: "Customers", icon: usersIcon, path: "/customers", permission: "customers" },
        { name: "Shipping", icon: supplierIcon, path: "/shipping", permission: "shipping" },
        { name: "Payment Management", icon: reportIcon, path: "/payments", permission: "payments" },
        { name: "Discount Management", icon: reportIcon, path: "/discounts", permission: "discounts" },
        { name: "Referral & Affiliate", icon: usersIcon, path: "/referrals", permission: "referral_affiliate" },
        { name: "SEO & Marketing", icon: reportIcon, path: "/seo", permission: "seo_marketing" },
        { name: "Blog", icon: blogIcon, path: "/blog", permission: "blog" },
      ],
    },
    {
      title: "Business Management",
      items: [
        ...(canUseSalesWorkspace
          ? [
              { name: "Lead Management", icon: usersIcon, path: "/leads", permission: "leads" },
              { name: "Catalog Sharing", icon: reportIcon, path: "/sales-catalogs", permission: "sales_catalogs" },
            ]
          : []),
        { name: "Inventory", icon: productIcon, path: "/inventory", permission: "inventory" },
        { name: "Staff Management", icon: usersIcon, path: "/staff", permission: "users" },
        { name: "Warehouse Management", icon: godownIcon, path: "/warehouse", permission: "warehouse" },
        { name: "Shop Products", icon: productIcon, path: "/shop-products", permission: "store" },
        { name: "Store Settings", icon: dashboardIcon, path: "/shop-settings", permission: "store" },
        { name: "To-Do Workspace", icon: reportIcon, path: "/tasks", permission: "tasks" },
        { name: "Drive Storage", icon: reportIcon, path: "/drive", permission: "drive" },
        { name: "HR Lite", icon: usersIcon, path: "/hr", permission: "hr" },
        { name: "Billing Management", icon: reportIcon, path: "/generate-bill", permission: "billing" },
        { name: "Supplier Management", icon: supplierIcon, path: "/supplier", permission: "suppliers" },
        { name: "Reports", icon: reportIcon, path: "/reports", permission: "reports" },
      ],
    },
    {
      title: "Account & Audit",
      items: [
        { name: "Profile Details", icon: profiledetails, path: "/profile" },
        ...(isPrivilegedAdmin
          ? [{ name: "Activity Log", icon: dashboardIcon, path: "/activity" }]
          : []),
      ],
    },
  ];
  const menuGroups = isSalesman
    ? [
        {
          title: "Sales Workspace",
          items: [
            { name: "Dashboard", icon: dashboardIcon, path: "/", permission: "dashboard" },
            { name: "Lead Management", icon: usersIcon, path: "/leads", permission: "leads" },
            { name: "Catalog Sharing", icon: reportIcon, path: "/sales-catalogs", permission: "sales_catalogs" },
            { name: "To-Do Workspace", icon: reportIcon, path: "/tasks", permission: "tasks" },
            { name: "Drive Storage", icon: reportIcon, path: "/drive", permission: "drive" },
          ].filter((item) => can(item.permission)),
        },
        {
          title: "Account",
          items: [{ name: "Profile Details", icon: profiledetails, path: "/profile" }],
        },
      ]
    : fullMenuGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => (item.superOnly ? isPrivilegedAdmin : can(item.permission))),
        }))
        .filter((group) => group.items.length);

  const isActive = (path) => {
    if (path === "/") {
      return location.pathname === "/";
    }

    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  return (
    <>
      <div className="md:hidden flex items-center justify-between bg-black text-white p-4">
        <div className="rounded-md bg-white px-2 py-1">
          <img src={logo} alt="Golden Creation" className="h-8" />
        </div>
        <button onClick={() => setOpen(true)}>
          <img src={menuIcon} alt="menu" className="h-6 w-6 invert" />
        </button>
      </div>
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setOpen(false)} />
      )}
      <div
     className={`fixed top-0 left-0 h-full w-64 bg-black text-white flex flex-col transform 
       ${open ? "translate-x-0" : "-translate-x-full"} 
        md:translate-x-0 transition-transform duration-300 z-50`}>
        <div className="shrink-0 p-4">
          <div className="inline-flex rounded-md bg-white px-2 py-1">
            <img src={logo} alt="Golden Creation" className="h-10" />
          </div>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            {menuGroups.map((group) => (
              <div key={group.title} className="mb-4">
                <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                  {group.title}
                </p>
                {group.items.map((item) => (
                  <div key={item.path} onClick={() => {
         setOpen(false);
         navigate(item.path);}}
          className={`group flex items-center gap-3 rounded-lg p-2.5 cursor-pointer mb-1.5 transition ${
                    isActive(item.path)
                      ? "bg-[#A68B5BFF] text-black"
                      : "hover:bg-gray-800"}`} >
                  <img src={item.icon} alt=""
                    className={`h-5 w-5 object-contain transition ${
                      isActive(item.path)
                        ? "brightness-0"
                        : "invert group-hover:scale-110"}`}/>
                  <span className="text-[13px]">{item.name}</span>
                </div>
                ))}
              </div>
            ))}
        </nav>
      </div>
    </>
  );
}
export default Sidebar;
