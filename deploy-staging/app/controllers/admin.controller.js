import db from "../config/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import {
  getMockAdminProfile,
  getMockBillingActivity,
  getMockBillingDraft,
  getMockBlogPosts,
  getMockBlogTags,
  getMockGodownActivity,
  getMockGodowns,
  getMockRecentBlogPosts,
  getMockReportsData,
  getMockSuppliers,
  mockProfileActivities,
  createMockInvoice,
  createMockBlogPost,
  deleteMockBlogPost,
  updateMockAdminProfile,
} from "../config/mock-store.js";

/* DATABASE QUERY */

function dbQuery(
  sql,
  values = []
) {
  return new Promise(
    (resolve, reject) => {
      db.query(
        sql,
        values,
        (error, results) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(results);
        }
      );
    }
  );
}

async function optionalDbQuery(
  sql,
  values = []
) {
  try {
    return await dbQuery(
      sql,
      values
    );
  } catch (error) {
    if (
      error?.code ===
        "ER_NO_SUCH_TABLE" ||
      error?.code ===
        "ER_BAD_FIELD_ERROR"
    ) {
      return [];
    }

    throw error;
  }
}

/* DATE FORMAT */

function formatRelativeDate(
  value
) {
  if (!value) {
    return "Recently";
  }

  const date = new Date(
    value
  );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Recently";
  }

  return date.toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

/* ADMIN TOKEN */

function createAdminToken(
  admin
) {
  return jwt.sign(
    {
      id: admin.id,
      email: admin.email,
      role:
        admin.role ||
        "admin",
      type: "admin",
    },

    process.env.JWT_SECRET ||
      "local_dev_secret_change_before_deploy",

    {
      expiresIn: "8h",
    }
  );
}

function cleanIndianPhone(
  value
) {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .slice(-10);

  return digits.length === 10
    ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
    : String(value || "").trim();
}

async function logAdminActivity(
  req,
  action,
  module = "Profile",
  detail = ""
) {
  try {
    await dbQuery(
      `
        INSERT INTO admin_activity (admin_id, actor, action, module, detail)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        req.admin?.id || null,
        req.admin?.email || req.body?.email || "System",
        action,
        module,
        detail || null,
      ]
    );
  } catch (error) {
    console.log("Admin Activity Log Error:", error);
  }
}

async function getRecentAdminActivities(
  adminId
) {
  const rows = await optionalDbQuery(
    `
      SELECT id, actor, action, module, detail, created_at
      FROM admin_activity
      WHERE admin_id = ?
      ORDER BY created_at DESC
      LIMIT 8
    `,
    [adminId]
  );

  if (!rows.length) {
    return mockProfileActivities;
  }

  return rows.map((item) => ({
    id: item.id,
    title: item.action,
    time: formatRelativeDate(item.created_at),
    location: item.module || "Admin Console",
    detail: item.detail || "",
  }));
}

/* LOGIN */

export async function loginAdmin(
  req,
  res
) {
  const email = String(
    req.body?.email || ""
  )
    .trim()
    .toLowerCase();

  const password = String(
    req.body?.password || ""
  );

  if (
    !email ||
    !password
  ) {
    return res
      .status(400)
      .json({
        message:
          "Email and password are required",
      });
  }

  try {
    const rows =
      await dbQuery(
        `
      SELECT 
        id,
        name,
        email,
        password,
        role,
        phone,
        profile_image,
        status

      FROM admins

      WHERE email = ?

      LIMIT 1
    `,
        [email]
      );

    const admin =
      rows[0];

    if (!admin) {
      return res
        .status(401)
        .json({
          message:
            "Invalid admin credentials",
        });
    }

    const passwordMatches =
      await bcrypt.compare(
        password,
        admin.password
      );

    if (
      !passwordMatches
    ) {
      return res
        .status(401)
        .json({
          message:
            "Invalid admin credentials",
        });
    }

    const token =
      createAdminToken(
        admin
      );

    await dbQuery(
      `
        UPDATE admins
        SET last_login_at = NOW()
        WHERE id = ?
      `,
      [admin.id]
    );

    await logAdminActivity(
      {
        ...req,
        admin,
      },
      "Logged in",
      "Authentication",
      req.headers["user-agent"] || "Admin panel"
    );

    res.json({
      token,

      admin: {
        id: admin.id,
        name: admin.name,
        email:
          admin.email,
        role:
          admin.role ||
          "admin",
        phone:
          admin.phone || "",
        image:
          admin.profile_image || "",
        status:
          admin.status || "Active",
      },
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message:
        "Unable to login admin",
    });
  }
}

/* DASHBOARD */

export async function getAdminDashboard(
  _req,
  res
) {
  try {
    const products =
      await dbQuery(`
        SELECT *
        FROM products
      `);

    const categories =
      await dbQuery(`
        SELECT *
        FROM categories
      `);

    const users =
      await dbQuery(`
        SELECT *
        FROM users
      `);

    const admins =
      await dbQuery(`
        SELECT *
        FROM admins
      `);

    const orders =
      await optionalDbQuery(`
        SELECT *
        FROM orders
      `);

    const recentProducts =
      await dbQuery(`
        SELECT
          p.id,
          p.name,
          p.price,
          p.image,
          p.created_at,

          c.name AS category_name

        FROM products p

        LEFT JOIN categories c
        ON p.category_id = c.id

        ORDER BY p.id DESC

        LIMIT 5
      `);

    const recentUsers =
      await dbQuery(`
        SELECT
          id,
          name,
          email,
          phone,
          is_verified,
          created_at

        FROM users

        ORDER BY id DESC

        LIMIT 5
      `);

    const totalRevenue =
      orders.reduce(
        (
          sum,
          order
        ) =>
          sum +
          Number(
            order.total_amount ||
              0
          ),
        0
      );

    const pendingOrders =
      orders.filter(
        (order) =>
          order.order_status ===
          "Pending"
      ).length;

    const premiumProducts =
      products.filter(
        (product) =>
          Number(
            product.price
          ) >= 5000
      ).length;

    const catalogValue =
      products.reduce(
        (
          sum,
          product
        ) =>
          sum +
          Number(
            product.price ||
              0
          ),
        0
      );

    res.json({
      whatsappMessage:
        "Backend connected successfully",

      customerGroups: [
        "All Customers",
        "Recent Buyers",
        "Premium Users",
      ],

      summary: {
        totalProducts:
          products.length,

        categories:
          categories.length,

        totalUsers:
          users.length,

        totalAdmins:
          admins.length,

        totalOrders:
          orders.length,

        pendingOrders,

        totalRevenue,

        catalogValue,

        premiumProducts,
      },

      recentProducts:
        recentProducts.map(
          (
            product
          ) => ({
            ...product,

            price:
              Number(
                product.price
              ) || 0,

            time:
              formatRelativeDate(
                product.created_at
              ),
          })
        ),

      recentUsers:
        recentUsers.map(
          (user) => ({
            ...user,

            contact:
              user.email ||
              user.phone ||
              "No contact",

            time:
              formatRelativeDate(
                user.created_at
              ),
          })
        ),

      admins:
        admins.map(
          (
            admin
          ) => ({
            id: admin.id,

            name:
              admin.name,

            email:
              admin.email,

            role:
              admin.role ||
              "admin",

            time:
              formatRelativeDate(
                admin.created_at
              ),
          })
        ),
    });
  } catch (error) {
    console.log(
      "Dashboard Error:",
      error
    );

    res.status(500).json({
      message:
        "Failed to load dashboard",
    });
  }
}

/* ORDERS */

export async function getAdminOrders(
  _req,
  res
) {
  try {
    const orders =
      await optionalDbQuery(`
      SELECT 
        o.id,
        o.order_number,
        o.total_amount,
        o.order_status,
        o.created_at,

        COALESCE(o.customer_name, u.name) AS customer_name,
        COALESCE(o.customer_email, u.email) AS customer_email,
        COALESCE(o.customer_phone, u.phone) AS customer_phone,

        GROUP_CONCAT(
          DISTINCT COALESCE(p.name, oi.product_name)
          SEPARATOR ', '
        ) AS products

      FROM orders o

      LEFT JOIN users u
      ON o.user_id = u.id

      LEFT JOIN order_items oi
      ON o.id = oi.order_id

      LEFT JOIN products p
      ON oi.product_id = p.id

      GROUP BY
        o.id,
        o.order_number,
        o.total_amount,
        o.order_status,
        o.created_at,
        o.customer_name,
        o.customer_email,
        o.customer_phone,
        u.name,
        u.email,
        u.phone

      ORDER BY o.created_at DESC
    `);

    const formattedOrders =
      orders.map(
        (order) => ({
          id: order.id,

          orderId:
            order.order_number ||
            `ORD-${order.id}`,

          customer:
            order.customer_name ||
            "Guest Customer",

          email:
            order.customer_email ||
            "No Email",

          phone:
            order.customer_phone ||
            "No Phone",

          product:
            order.products ||
            "No Product",

          date:
            formatRelativeDate(
              order.created_at
            ),

          amount:
            Number(
              order.total_amount
            ) || 0,

          status:
            order.order_status ||
            "Pending",
        })
      );

    const totalRevenue =
      formattedOrders.reduce(
        (
          sum,
          order
        ) =>
          sum +
          order.amount,
        0
      );

    const deliveredCount =
      formattedOrders.filter(
        (order) =>
          order.status ===
          "Delivered"
      ).length;

    const activeCount =
      formattedOrders.filter(
        (order) =>
          order.status ===
            "Pending" ||
          order.status ===
            "Processing" ||
          order.status ===
            "Shipped"
      ).length;

    res.json({
      metrics: {
        totalRevenue,

        activeOrders:
          activeCount,

        deliveredOrders:
          deliveredCount,

        averageValue:
          formattedOrders.length
            ? Math.round(
                totalRevenue /
                  formattedOrders.length
              )
            : 0,
      },

      orders:
        formattedOrders,
    });
  } catch (error) {
    console.log(
      "Admin Orders Error:",
      error
    );

    res.status(500).json({
      message:
        "Failed to fetch orders",
    });
  }
}

/* BLOG */

export function getAdminBlog(
  _req,
  res
) {
  res.json({
    featured: {
      title:
        "The Future of SaaS",

      description:
        "Explore next-generation platforms powered by AI.",

      author:
        "Lekhanmart",

      readTime:
        "5 min read",
    },

    articles:
      getMockBlogPosts(),

    recentPosts:
      getMockRecentBlogPosts(),

    tags:
      getMockBlogTags(),

    totalArticles:
      getMockBlogPosts()
        .length,
  });
}

export function createAdminBlogPost(
  req,
  res
) {
  const title =
    String(
      req.body?.title ||
        ""
    ).trim();

  if (!title) {
    return res
      .status(400)
      .json({
        message:
          "Blog title is required",
      });
  }

  const post =
    createMockBlogPost(
      req.body || {}
    );

  res.status(201).json({
    post,
  });
}

export function deleteAdminBlogPost(
  req,
  res
) {
  const deleted =
    deleteMockBlogPost(
      req.params.id
    );

  if (!deleted) {
    return res
      .status(404)
      .json({
        message:
          "Blog post not found",
      });
  }

  res.json({
    message:
      "Blog post deleted successfully",
    post: deleted,
  });
}

/* PROFILE */

function addProfileActivity(
  title,
  location = "Admin Console"
) {
  mockProfileActivities.unshift({
    id: Date.now(),
    title,
    time: "Just now",
    location,
  });
}

function buildAdminProfile(
  adminRow = {},
  profile = getMockAdminProfile()
) {
  return {
    ...profile,
    id: adminRow.id || profile.id,
    name:
      adminRow.name || profile.name || "",
    email:
      adminRow.email || profile.email || "",
    phone:
      cleanIndianPhone(adminRow.phone || profile.phone || ""),
    location:
      adminRow.location || profile.location || "",
    role:
      adminRow.role ||
      profile.role ||
      profile.systemRole ||
      "admin",
    username:
      profile.username ||
      (
        adminRow.email
          ? String(adminRow.email).split("@")[0]
          : "admin"
      ),
    status:
      adminRow.status || profile.status || "Active",
    image:
      adminRow.profile_image || profile.image || "",
    memberSince:
      adminRow.created_at
        ? formatRelativeDate(adminRow.created_at)
        : profile.memberSince || "Oct 2021",
    securityScore:
      profile.securityScore || "98/100",
    lastActivity:
      adminRow.last_login_at
        ? formatRelativeDate(adminRow.last_login_at)
        : "Just now",
  };
}

export async function getAdminProfile(
  req,
  res
) {
  try {
    const rows =
      await optionalDbQuery(
        `
          SELECT
            id,
            name,
            email,
            phone,
            location,
            profile_image,
            role,
            status,
            last_login_at,
            created_at

          FROM admins

          WHERE id = ?

          LIMIT 1
        `,
        [req.admin?.id]
      );

    const admin =
      rows[0] || {};

    const activities =
      await getRecentAdminActivities(
        req.admin?.id
      );

    res.json({
      profile:
        buildAdminProfile(
          admin
        ),

      activities,
    });
  } catch (error) {
    console.log(
      "Admin Profile Error:",
      error
    );

    res.status(500).json({
      message:
        "Failed to load admin profile",
    });
  }
}

export async function updateAdminProfile(
  req,
  res
) {
  const name = String(
    req.body?.name || ""
  ).trim();

  const email = String(
    req.body?.email || ""
  )
    .trim()
    .toLowerCase();

  const phone =
    cleanIndianPhone(
      req.body?.phone || ""
    );

  const location = String(
    req.body?.location || ""
  ).trim();

  const image = String(
    req.body?.image || ""
  );

  if (!name || !email) {
    return res
      .status(400)
      .json({
        message:
          "Name and email are required",
      });
  }

  try {
    await dbQuery(
      `
        UPDATE admins
        SET name = ?, email = ?, phone = ?, location = ?, profile_image = COALESCE(NULLIF(?, ''), profile_image)
        WHERE id = ?
      `,
      [
        name,
        email,
        phone || null,
        location || null,
        image,
        req.admin?.id,
      ]
    );

    const rows = await dbQuery(
      `
        SELECT id, name, email, phone, location, profile_image, role, status, last_login_at, created_at
        FROM admins
        WHERE id = ?
        LIMIT 1
      `,
      [req.admin?.id]
    );

    const nextProfile =
      updateMockAdminProfile({
        ...req.body,
        name,
        email,
        phone,
        location,
        image,
      });

    addProfileActivity(
      "Profile information updated",
      "Remote Web App"
    );

    await logAdminActivity(
      req,
      "Profile information updated",
      "Profile",
      email
    );

    const activities =
      await getRecentAdminActivities(
        req.admin?.id
      );

    res.json({
      profile:
        buildAdminProfile(
          rows[0] || {
            id: req.admin?.id,
            name,
            email,
            phone,
            location,
            profile_image: image,
            role: req.admin?.role,
          },
          nextProfile
        ),
      activities,
    });
  } catch (error) {
    console.log(
      "Profile Update Error:",
      error
    );

    res.status(500).json({
      message:
        "Failed to update admin profile",
    });
  }
}

export async function logoutAdmin(
  req,
  res
) {
  await logAdminActivity(
    req,
    "Logged out",
    "Authentication",
    "Admin panel"
  );

  res.json({
    message:
      "Logged out successfully",
  });
}

export async function updateAdminTwoFactor(
  req,
  res
) {
  const enabled =
    Boolean(
      req.body?.enabled
    );

  const profile =
    updateMockAdminProfile({
      twoFactorEnabled:
        enabled,
    });

  addProfileActivity(
    enabled
      ? "Two-factor authentication enabled"
      : "Two-factor authentication disabled"
  );

  await logAdminActivity(
    req,
    enabled
      ? "Two-factor authentication enabled"
      : "Two-factor authentication disabled",
    "Security"
  );

  res.json({
    message:
      enabled
        ? "Two-factor authentication enabled"
        : "Two-factor authentication disabled",

    profile,
    activities:
      mockProfileActivities,
  });
}

export async function resetAdminApiAccess(
  req,
  res
) {
  addProfileActivity(
    "API access token reset"
  );

  await logAdminActivity(
    req,
    "API access token reset",
    "Security"
  );

  res.json({
    message:
      "API access reset successfully",
    tokenPreview:
      `adm_${Date.now()
        .toString(36)
        .slice(-8)}`,
    activities:
      mockProfileActivities,
  });
}

export async function terminateAdminSessions(
  req,
  res
) {
  addProfileActivity(
    "All other admin sessions terminated"
  );

  await logAdminActivity(
    req,
    "All other admin sessions terminated",
    "Security"
  );

  res.json({
    message:
      "All other sessions terminated successfully",
    activities:
      mockProfileActivities,
  });
}

export async function changeAdminPassword(
  req,
  res
) {
  if (
    !req.body?.currentPassword ||
    !req.body?.newPassword
  ) {
    return res
      .status(400)
      .json({
        message:
          "Current password and new password are required",
      });
  }

  try {
    const rows =
      await dbQuery(
        `
          SELECT password
          FROM admins
          WHERE id = ?
          LIMIT 1
        `,
        [req.admin?.id]
      );

    const admin =
      rows[0];

    if (!admin) {
      return res
        .status(404)
        .json({
          message:
            "Admin account not found",
        });
    }

    const matches =
      await bcrypt.compare(
        req.body.currentPassword,
        admin.password
      );

    if (!matches) {
      return res
        .status(401)
        .json({
          message:
            "Current password is incorrect",
        });
    }

    if (
      String(
        req.body.newPassword
      ).length < 6
    ) {
      return res
        .status(400)
        .json({
          message:
            "New password must be at least 6 characters",
        });
    }

    const hashedPassword =
      await bcrypt.hash(
        req.body.newPassword,
        10
      );

    await dbQuery(
      `
        UPDATE admins
        SET password = ?
        WHERE id = ?
      `,
      [
        hashedPassword,
        req.admin?.id,
      ]
    );

    addProfileActivity(
      "Password changed successfully"
    );

    await logAdminActivity(
      req,
      "Password changed successfully",
      "Security"
    );

    res.json({
      message:
        "Password changed successfully",
      activities:
        mockProfileActivities,
    });
  } catch (error) {
    console.log(
      "Password Change Error:",
      error
    );

    res.status(500).json({
      message:
        "Failed to change password",
    });
  }
}

export async function uploadAdminProfileImage(
  req,
  res
) {
  const image =
    req.body?.image || "";

  if (!image) {
    return res
      .status(400)
      .json({
        message:
          "Image is required",
      });
  }

  const profile =
    updateMockAdminProfile({
      image,
    });

  addProfileActivity(
    "Profile image updated",
    "Remote Web App"
  );

  await dbQuery(
    `
      UPDATE admins
      SET profile_image = ?
      WHERE id = ?
    `,
    [
      image,
      req.admin?.id,
    ]
  );

  await logAdminActivity(
    req,
    "Profile image updated",
    "Profile",
    "Image changed"
  );

  res.json({
    image:
      profile.image,
    profile,
    activities:
      mockProfileActivities,
  });
}

/* STAFF */

export async function getAdminStaff(
  _req,
  res
) {
  try {
    const admins =
      await dbQuery(`
        SELECT
          id,
          name,
          email,
          phone,
          role,
          status,
          permissions,
          created_at

        FROM admins

        ORDER BY id DESC
      `);

    const users =
      await dbQuery(`
        SELECT
          id,
          name,
          email,
          phone,
          is_verified,
          created_at

        FROM users

        ORDER BY id DESC
      `);

    const staff = [
      ...admins.map(
        (admin) => ({
          id: `ADM-${admin.id}`,
          name:
            admin.name,
          role:
            admin.role ||
            "admin",
          email:
            admin.email,
          phone:
            admin.phone || "-",
          status:
            admin.status ||
            "Active",
          permissions: (() => {
            if (!admin.permissions) {
              return [];
            }

            if (
              Array.isArray(
                admin.permissions
              )
            ) {
              return admin.permissions;
            }

            try {
              return JSON.parse(
                admin.permissions
              );
            } catch {
              return [];
            }
          })(),
        })
      ),

      ...users.map(
        (user) => ({
          id: `USR-${user.id}`,
          name:
            user.name ||
            "User",
          role:
            "Customer",
          email:
            user.email ||
            "-",
          phone:
            user.phone ||
            "-",
          status:
            user.is_verified
              ? "Active"
              : "Pending",
        })
      ),
    ];

    res.json({
      summary: {
        totalStaff:
          staff.length,

        activeStaff:
          staff.filter(
            (item) =>
              item.status ===
              "Active"
          ).length,

        pendingInvites:
          staff.filter(
            (item) =>
              item.status ===
              "Pending"
          ).length,

        roleTypes:
          new Set(
            staff.map(
              (item) =>
                item.role
            )
          ).size,
      },

      staff,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message:
        "Failed to load staff",
    });
  }
}

/* GODOWNS */

export function getAdminGodowns(
  _req,
  res
) {
  res.json({
    facilities:
      getMockGodowns(),

    activity:
      getMockGodownActivity(),
  });
}

/* SUPPLIERS */

export function getAdminSuppliers(
  _req,
  res
) {
  res.json({
    suppliers:
      getMockSuppliers(),
  });
}

/* REPORTS */

export function getAdminReports(
  _req,
  res
) {
  res.json(
    getMockReportsData()
  );
}

/* BILLING */

export function getAdminBilling(
  _req,
  res
) {
  res.json({
    draft:
      getMockBillingDraft(),

    activity:
      getMockBillingActivity(),
  });
}

export function createAdminInvoice(
  req,
  res
) {
  const invoice =
    createMockInvoice(
      req.body || {}
    );

  res.status(201).json({
    invoice,
  });
}
