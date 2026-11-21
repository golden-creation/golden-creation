import React, {
  useEffect,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import ordersIcon from "../assets/online-shopping.png";
import productsIcon from "../assets/box.png";
import usersIcon from "../assets/multiple-users-silhouette.png";
import pendingIcon from "../assets/clock.png";

import arrowRight from "../assets/arrow-right.png";
import dotsIcon from "../assets/dots.png";

import whatsappIcon from "../assets/whatsapp.png";

import productFallback from "../assets/box.png";

import {
  getAssetUrl,
} from "../lib/api";

import {
  getAdminDashboard,
  getAdminLookup,
} from "../lib/adminApi";

const WHATSAPP_TEMPLATE_KEY = "goldencreation.whatsappTemplates";

function loadWhatsappTemplates() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WHATSAPP_TEMPLATE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function storeWhatsappTemplates(templates) {
  localStorage.setItem(WHATSAPP_TEMPLATE_KEY, JSON.stringify(templates));
}

const defaultDashboard = {
  whatsappMessage:
    "Hi! Welcome to Golden Creation Admin Dashboard.",

  summary: {
    totalProducts: 0,
    categories: 0,
    totalUsers: 0,
    totalAdmins: 0,
    totalOrders: 0,
    pendingOrders: 0,
    catalogValue: 0,
    premiumProducts: 0,
    totalRevenue: 0,
  },

  recentProducts: [],
  recentUsers: [],
  admins: [],
};

const formatCurrency = (
  amount
) =>
  `₹${Number(
    amount || 0
  ).toLocaleString("en-IN")}`;

const Dashboard = () => {
  const navigate = useNavigate();

  const [loading, setLoading] =
    useState(true);

  const [toastMsg, setToastMsg] =
    useState("");

  const [dashboard, setDashboard] =
    useState(defaultDashboard);

  const [message, setMessage] =
    useState(
      defaultDashboard.whatsappMessage
    );

  const [mobileNumber, setMobileNumber] =
    useState("");

  const [customerQuery, setCustomerQuery] =
    useState("");

  const [customerResults, setCustomerResults] =
    useState([]);

  const [templateName, setTemplateName] =
    useState("");

  const [templates, setTemplates] =
    useState(() => loadWhatsappTemplates());

  useEffect(() => {
    fetchDashboard();
  }, []);

  useEffect(() => {
    const query = customerQuery.trim();
    if (query.length < 2) {
      setCustomerResults([]);
      return undefined;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await getAdminLookup("customers", {
          q: query,
          limit: 8,
        });
        setCustomerResults(response.results || []);
      } catch {
        setCustomerResults([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [customerQuery]);

  const fetchDashboard =
    async () => {
      try {
        setLoading(true);

        const data =
          await getAdminDashboard();

        setDashboard({
          ...defaultDashboard,
          ...data,
          summary: {
            ...defaultDashboard.summary,
            ...(data.summary || {}),
          },
          recentProducts:
            data.recentProducts || [],
          recentUsers:
            data.recentUsers || [],
          admins:
            data.admins || [],
        });

        setMessage(
          data.whatsappMessage ||
            defaultDashboard.whatsappMessage
        );
      } catch (error) {
        console.log(error);

        setToastMsg(
          "Failed to load dashboard"
        );

        setTimeout(() => {
          setToastMsg("");
        }, 3000);
      } finally {
        setLoading(false);
      }
    };

  const showToast = (
    text
  ) => {
    setToastMsg(text);

    setTimeout(() => {
      setToastMsg("");
    }, 2500);
  };

  const selectCustomerForWhatsapp = (customer) => {
    setCustomerQuery(customer.label || "");
    setMobileNumber(customer.phone || "");
    setCustomerResults([]);
    if (!customer.phone) showToast("Selected customer has no mobile number");
  };

  const saveWhatsappTemplate = () => {
    const body = message.trim();
    if (!body) {
      showToast("Write a message before saving a template");
      return;
    }
    const name =
      templateName.trim() ||
      body.slice(0, 32) ||
      `Template ${templates.length + 1}`;
    const next = [
      {
        id: Date.now(),
        name,
        body,
      },
      ...templates.filter((template) => template.name.toLowerCase() !== name.toLowerCase()),
    ].slice(0, 20);
    setTemplates(next);
    storeWhatsappTemplates(next);
    setTemplateName("");
    showToast("WhatsApp template saved");
  };

  const importWhatsappTemplate = (templateId) => {
    const template = templates.find((item) => String(item.id) === String(templateId));
    if (template) setMessage(template.body);
  };

  const sendWhatsappCampaign = () => {
    const phone = mobileNumber.replace(/\D/g, "");
    const body = message.trim();
    if (!phone) {
      showToast("Enter or select a mobile number");
      return;
    }
    if (!body) {
      showToast("Write a message before sending");
      return;
    }
    const normalizedPhone = phone.length === 10 ? `91${phone}` : phone;
    window.open(`https://wa.me/${normalizedPhone}?text=${encodeURIComponent(body)}`, "_blank", "noopener,noreferrer");
    showToast("Opening WhatsApp");
  };

  const summary =
    dashboard.summary ||
    defaultDashboard.summary;

  const cards = [
    {
      title: "Total Orders",

      value:
        summary.totalOrders || 0,

      icon: ordersIcon,

      change: `${
        summary.pendingOrders || 0
      } pending`,

      up: false,
    },

    {
      title: "Total Products",

      value:
        summary.totalProducts || 0,

      icon: productsIcon,

      change: `${
        summary.categories || 0
      } categories`,

      up: true,
    },

    {
      title: "Total Users",

      value:
        summary.totalUsers || 0,

      icon: usersIcon,

      change: `${
        summary.totalAdmins || 0
      } admins`,

      up: true,
    },

    {
      title: "Total Revenue",

      value: formatCurrency(
        summary.totalRevenue
      ),

      icon: pendingIcon,

      change: `${
        summary.premiumProducts || 0
      } premium products`,

      up: true,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F6F3ED] p-4 md:p-6">
      {/* TOAST */}

      {toastMsg && (
        <div className="fixed right-4 top-4 z-50 rounded-xl bg-[#1F241A] px-4 py-2 text-sm text-white shadow-lg">
          {toastMsg}
        </div>
      )}

      {/* HEADER */}

      <section className="mb-6 rounded-2xl border border-[#E7DDC8] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#A06F33]">
              Admin Overview
            </p>

            <h1 className="mt-2 text-3xl font-bold text-[#242414]">
              Dashboard
            </h1>

            <p className="mt-2 max-w-2xl text-sm text-gray-500">
              Monitor orders,
              products, users,
              and overall store
              performance.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#F8F5EF] p-3 sm:grid-cols-4">
            <MiniStat
              label="Products"
              value={
                summary.totalProducts ||
                0
              }
            />

            <MiniStat
              label="Categories"
              value={
                summary.categories ||
                0
              }
            />

            <MiniStat
              label="Users"
              value={
                summary.totalUsers ||
                0
              }
            />

            <MiniStat
              label="Admins"
              value={
                summary.totalAdmins ||
                0
              }
            />
          </div>
        </div>
      </section>

      {/* LOADING */}

      {loading ? (
        <div className="flex h-[400px] items-center justify-center">
          <div className="text-lg text-gray-500">
            Loading dashboard...
          </div>
        </div>
      ) : (
        <>
          {/* STATS */}

          <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-[#E9DFC9] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF49C]">
                    <img
                      src={card.icon}
                      className="h-5 w-5 object-contain"
                    />
                  </div>

                  <div
                    className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${
                      card.up
                        ? "bg-green-50 text-green-700"
                        : "bg-orange-50 text-orange-700"
                    }`}
                  >
                    <img
                      src={
                        arrowRight
                      }
                      className={`w-3 ${
                        card.up
                          ? "rotate-[-45deg]"
                          : "rotate-[135deg]"
                      }`}
                    />

                    <span>
                      {card.change}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-gray-500">
                  {card.title}
                </p>

                <h2 className="mt-2 text-3xl font-bold text-[#242414]">
                  {card.value}
                </h2>
              </div>
            ))}
          </section>

          {/* MAIN CONTENT */}

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* RECENT PRODUCTS */}

            <div className="overflow-hidden rounded-2xl border border-[#E9DFC9] bg-white shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between border-b border-gray-100 p-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#242414]">
                    Recent Products
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Latest products
                    added to the
                    store.
                  </p>
                </div>

                <button
                  onClick={() =>
                    navigate(
                      "/product"
                    )
                  }
                  className="rounded-lg border border-[#C2863F] px-3 py-2 text-sm font-medium text-[#8A5A22] transition hover:bg-[#FFF49C]"
                >
                  View Products
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px] text-sm">
                  <thead className="bg-[#FBF8F2]">
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3">
                        Product ID
                      </th>

                      <th className="px-4 py-3">
                        Name
                      </th>

                      <th className="px-4 py-3">
                        Category
                      </th>

                      <th className="px-4 py-3">
                        Price
                      </th>

                      <th className="px-4 py-3">
                        Created
                      </th>

                      <th className="px-4 py-3">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {dashboard.recentProducts.map(
                      (
                        product
                      ) => (
                        <tr
                          key={
                            product.id
                          }
                          className="border-b border-gray-100 hover:bg-[#FBF8F2]"
                        >
                          <td className="px-4 py-3 font-medium text-gray-600">
                            PRD-
                            {
                              product.id
                            }
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <img
                                src={
                                  product.image
                                    ? getAssetUrl(
                                        product.image
                                      )
                                    : productFallback
                                }
                                className="h-10 w-10 rounded-lg object-cover"
                              />

                              <span className="max-w-[220px] truncate font-medium text-[#242414]">
                                {
                                  product.name
                                }
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-3 text-gray-500">
                            {product.category_name ||
                              "Uncategorized"}
                          </td>

                          <td className="px-4 py-3 font-semibold text-[#A06F33]">
                            {formatCurrency(
                              product.price
                            )}
                          </td>

                          <td className="px-4 py-3 text-gray-500">
                            {product.time ||
                              "-"}
                          </td>

                          <td className="px-4 py-3">
                            <button
                              onClick={() =>
                                showToast(
                                  product.name
                                )
                              }
                              className="rounded-lg p-2 hover:bg-gray-100"
                            >
                              <img
                                src={
                                  dotsIcon
                                }
                                className="w-5"
                              />
                            </button>
                          </td>
                        </tr>
                      )
                    )}

                    {!dashboard
                      .recentProducts
                      .length && (
                      <tr>
                        <td
                          colSpan="6"
                          className="py-8 text-center text-gray-400"
                        >
                          No products
                          found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* WHATSAPP */}

            <div className="rounded-2xl border border-[#E9DFC9] bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
                  <img
                    src={
                      whatsappIcon
                    }
                    className="w-5"
                  />
                </div>

                <div>
                  <h2 className="font-semibold text-[#242414]">
                    WhatsApp
                    Campaign
                  </h2>

                  <p className="text-xs text-gray-500">
                    Draft customer
                    messages.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-semibold text-gray-600">
                  Customer Search
                  <input
                    value={customerQuery}
                    onChange={(event) => setCustomerQuery(event.target.value)}
                    placeholder="Search customer by name, email, or phone"
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-[#FBF8F2] p-3 text-sm font-normal outline-none focus:border-[#C2863F]"
                  />
                </label>
                {customerResults.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 bg-white text-sm shadow-sm">
                    {customerResults.map((customer) => (
                      <button
                        type="button"
                        key={customer.id}
                        onClick={() => selectCustomerForWhatsapp(customer)}
                        className="block w-full border-b px-3 py-2 text-left hover:bg-[#FBF8F2]"
                      >
                        <span className="font-medium">{customer.label || "Customer"}</span>
                        <span className="block text-xs text-gray-500">{[customer.phone, customer.email].filter(Boolean).join(" | ") || "No contact"}</span>
                      </button>
                    ))}
                  </div>
                )}
                <label className="block text-xs font-semibold text-gray-600">
                  Mobile Number
                  <input
                    value={mobileNumber}
                    onChange={(event) => setMobileNumber(event.target.value)}
                    placeholder="Enter WhatsApp mobile number"
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-[#FBF8F2] p-3 text-sm font-normal outline-none focus:border-[#C2863F]"
                  />
                </label>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <select
                    onChange={(event) => importWhatsappTemplate(event.target.value)}
                    defaultValue=""
                    className="rounded-xl border border-gray-200 bg-[#FBF8F2] p-3 text-sm outline-none focus:border-[#C2863F]"
                  >
                    <option value="">Import saved template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                    placeholder="Template name"
                    className="rounded-xl border border-gray-200 bg-[#FBF8F2] p-3 text-sm outline-none focus:border-[#C2863F]"
                  />
                </div>
                <textarea
                  rows={7}
                  value={message}
                  onChange={(
                    e
                  ) =>
                    setMessage(
                      e.target.value
                    )
                  }
                  className="w-full resize-none rounded-xl border border-gray-200 bg-[#FBF8F2] p-3 text-sm outline-none focus:border-[#C2863F]"
                />
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={saveWhatsappTemplate}
                  className="rounded-xl border border-[#404C31] py-3 text-sm font-semibold text-[#404C31] transition hover:bg-[#F3F6ED]"
                >
                  Save Template
                </button>
                <button
                  onClick={sendWhatsappCampaign}
                  className="rounded-xl bg-[#404C31] py-3 text-sm font-semibold text-white transition hover:bg-[#2F3923]"
                >
                  Send Campaign
                </button>
              </div>
            </div>
          </section>

          <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <PeoplePanel
              title="Recent Users"
              emptyText="No recent users found."
              people={dashboard.recentUsers.map(
                (user) => ({
                  id: user.id,
                  name:
                    user.name || "User",
                  detail:
                    user.contact ||
                    user.email ||
                    user.phone ||
                    "No contact",
                  meta:
                    user.is_verified
                      ? "Verified"
                      : "Pending",
                  positive:
                    Boolean(
                      user.is_verified
                    ),
                })
              )}
            />

            <PeoplePanel
              title="Admins"
              emptyText="No admins found."
              people={dashboard.admins.map(
                (admin) => ({
                  id: admin.id,
                  name:
                    admin.name || "Admin",
                  detail:
                    admin.email ||
                    "No email",
                  meta:
                    admin.role ||
                    "admin",
                  positive: true,
                })
              )}
            />
          </section>
        </>
      )}
    </div>
  );
};

function MiniStat({
  label,
  value,
}) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-center shadow-sm">
      <p className="text-base font-bold text-[#242414]">
        {value}
      </p>

      <p className="text-[11px] text-gray-500">
        {label}
      </p>
    </div>
  );
}

function PeoplePanel({
  title,
  people,
  emptyText,
}) {
  return (
    <div className="rounded-2xl border border-[#E9DFC9] bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#242414]">
          {title}
        </h2>

        <span className="rounded-full bg-[#FFF49C] px-3 py-1 text-xs font-semibold text-[#6B4E20]">
          {people.length}
        </span>
      </div>

      {people.length ? (
        <div className="divide-y divide-gray-100">
          {people.map((person) => (
            <div
              key={person.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F8F5EF] text-sm font-semibold text-[#404C31]">
                  {String(person.name)
                    .slice(0, 1)
                    .toUpperCase()}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#242414]">
                    {person.name}
                  </p>

                  <p className="truncate text-xs text-gray-500">
                    {person.detail}
                  </p>
                </div>
              </div>

              <span
                className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${
                  person.positive
                    ? "bg-green-50 text-green-700"
                    : "bg-orange-50 text-orange-700"
                }`}
              >
                {person.meta}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-sm text-gray-400">
          {emptyText}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
