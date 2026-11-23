import db from "../config/db.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { sendEmailOtp } from "../services/email.service.js";
import { sendOtpSms } from "../services/sms.service.js";

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

export function missingOrdersStoreError(error) {
  return error?.code === "ER_NO_SUCH_TABLE" || error?.code === "ER_BAD_FIELD_ERROR";
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

function createOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function expiresAt(minutes = 10) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || ""))
    .digest("hex");
}

async function createAdminOtp(admin, purpose) {
  const otp = createOtp();
  const challengeToken = crypto.randomBytes(32).toString("hex");
  const otpHash = await bcrypt.hash(otp, 10);

  await dbQuery(
    `
      INSERT INTO admin_auth_otps
        (admin_id, purpose, otp_hash, challenge_token_hash, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    [
      admin.id,
      purpose,
      otpHash,
      sha256(challengeToken),
      expiresAt(),
    ]
  );

  const deliveries = [];

  if (admin.email) {
    deliveries.push(
      sendEmailOtp(admin.email, otp).then(
        () => ({ channel: "email", ok: true }),
        (error) => ({ channel: "email", ok: false, error })
      )
    );
  }

  if (admin.phone) {
    deliveries.push(
      sendOtpSms(admin.phone, otp).then(
        () => ({ channel: "sms", ok: true }),
        (error) => ({ channel: "sms", ok: false, error })
      )
    );
  }

  const results = await Promise.all(deliveries);
  const delivered = results.some((result) => result.ok);

  results
    .filter((result) => !result.ok)
    .forEach((result) => {
      console.error(
        `Admin OTP ${result.channel} delivery failed:`,
        result.error?.message || result.error
      );
    });

  if (!delivered) {
    throw new Error("Unable to deliver admin OTP by email or SMS");
  }

  return { challengeToken };
}

async function verifyAdminOtp({
  adminId,
  purpose,
  otp,
  challengeToken = "",
}) {
  const values = [adminId, purpose];
  const tokenClause = challengeToken
    ? "AND challenge_token_hash = ?"
    : "";

  if (challengeToken) {
    values.push(sha256(challengeToken));
  }

  const rows = await dbQuery(
    `
      SELECT id, otp_hash, attempts, expires_at, consumed_at
      FROM admin_auth_otps
      WHERE admin_id = ?
        AND purpose = ?
        ${tokenClause}
      ORDER BY id DESC
      LIMIT 1
    `,
    values
  );

  const record = rows[0];

  if (!record || record.consumed_at) {
    return { ok: false, message: "Invalid or expired OTP" };
  }

  if (new Date(record.expires_at).getTime() < Date.now()) {
    return { ok: false, message: "OTP has expired" };
  }

  if (Number(record.attempts || 0) >= 5) {
    return {
      ok: false,
      message: "Too many OTP attempts. Request a new OTP.",
    };
  }

  const matches = await bcrypt.compare(
    String(otp || ""),
    record.otp_hash
  );

  if (!matches) {
    await dbQuery(
      "UPDATE admin_auth_otps SET attempts = attempts + 1 WHERE id = ?",
      [record.id]
    );
    return { ok: false, message: "Invalid OTP" };
  }

  await dbQuery(
    "UPDATE admin_auth_otps SET consumed_at = NOW() WHERE id = ?",
    [record.id]
  );

  return { ok: true };
}

async function adminByEmail(email) {
  const rows = await dbQuery(
    `
      SELECT
        id,
        name,
        email,
        password,
        role,
        phone,
        profile_image,
        status,
        permissions,
        two_factor_enabled
      FROM admins
      WHERE email = ?
      LIMIT 1
    `,
    [email]
  );

  return rows[0] || null;
}

function parseAdminPermissions(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [];
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeAdminPayload(admin) {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role || "admin",
    phone: admin.phone || "",
    image: admin.profile_image || "",
    status: admin.status || "Active",
    permissions: parseAdminPermissions(admin.permissions),
  };
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
      name: admin.name,
      email: admin.email,
      role:
        admin.role ||
        "admin",
      permissions: parseAdminPermissions(admin.permissions),
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
    const admin =
      await adminByEmail(email);

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

    if (
      Number(
        admin.two_factor_enabled || 0
      )
    ) {
      const challenge =
        await createAdminOtp(
          admin,
          "login_2fa"
        );

      await logAdminActivity(
        {
          ...req,
          admin,
        },
        "Login OTP requested",
        "Authentication",
        req.headers["user-agent"] ||
          "Admin panel"
      );

      return res.json({
        requiresTwoFactor: true,
        challengeToken:
          challenge.challengeToken,
        message:
          "OTP sent to your registered email/mobile",
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

      admin: safeAdminPayload(
        admin
      ),
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message:
        "Unable to login admin",
    });
  }
}

export async function verifyAdminLoginOtp(
  req,
  res
) {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const otp = String(req.body?.otp || "").trim();
  const challengeToken = String(req.body?.challengeToken || "").trim();

  if (!email || !otp || !challengeToken) {
    return res.status(400).json({
      message:
        "Email, OTP, and login challenge are required",
    });
  }

  try {
    const admin = await adminByEmail(email);

    if (!admin) {
      return res.status(401).json({
        message: "Invalid or expired OTP",
      });
    }

    const verification = await verifyAdminOtp({
      adminId: admin.id,
      purpose: "login_2fa",
      otp,
      challengeToken,
    });

    if (!verification.ok) {
      return res.status(401).json({
        message: verification.message,
      });
    }

    const token = createAdminToken(admin);

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
      "Logged in with 2FA",
      "Authentication",
      req.headers["user-agent"] || "Admin panel"
    );

    res.json({
      token,
      admin: safeAdminPayload(admin),
    });
  } catch (error) {
    console.log("Admin 2FA Login Error:", error);
    res.status(500).json({
      message: "Unable to verify login OTP",
    });
  }
}

export async function requestAdminPasswordReset(
  req,
  res
) {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();

  if (!email) {
    return res.status(400).json({
      message: "Email is required",
    });
  }

  try {
    const admin = await adminByEmail(email);

    if (admin) {
      await createAdminOtp(
        admin,
        "password_reset"
      );
    }

    res.json({
      message:
        "If the email exists, a reset OTP has been sent to the registered email/mobile.",
    });
  } catch (error) {
    console.log("Admin Reset OTP Error:", error);
    res.status(500).json({
      message: "Unable to send reset OTP",
    });
  }
}

export async function verifyAdminPasswordReset(
  req,
  res
) {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const otp = String(req.body?.otp || "").trim();
  const newPassword = String(req.body?.newPassword || "");

  if (!email || !otp || !newPassword) {
    return res.status(400).json({
      message:
        "Email, OTP, and new password are required",
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      message:
        "New password must be at least 6 characters",
    });
  }

  try {
    const admin = await adminByEmail(email);

    if (!admin) {
      return res.status(401).json({
        message: "Invalid or expired OTP",
      });
    }

    const verification = await verifyAdminOtp({
      adminId: admin.id,
      purpose: "password_reset",
      otp,
    });

    if (!verification.ok) {
      return res.status(401).json({
        message: verification.message,
      });
    }

    const hashedPassword =
      await bcrypt.hash(newPassword, 10);

    await dbQuery(
      "UPDATE admins SET password = ? WHERE id = ?",
      [hashedPassword, admin.id]
    );

    await logAdminActivity(
      {
        ...req,
        admin,
      },
      "Password reset completed",
      "Security"
    );

    res.json({
      message: "Password reset successfully",
    });
  } catch (error) {
    console.log("Admin Reset Verify Error:", error);
    res.status(500).json({
      message: "Unable to reset password",
    });
  }
}

/* DASHBOARD */

export async function getAdminDashboard(
  _req,
  res
) {
  try {
    const activeProductWhere = `
      WHERE p.deleted_at IS NULL
        AND LOWER(COALESCE(p.status, 'active')) NOT IN ('inactive', 'deleted', 'archived', 'archive', 'draft')
    `;

    const products =
      await dbQuery(`
        SELECT
          p.id,
          p.name,
          p.price,
          p.stock_quantity,
          p.status,
          p.created_at
        FROM products p
        ${activeProductWhere}
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

    const orders = await dbQuery(`
        SELECT *
        FROM orders
      `).catch((error) => {
        if (!missingOrdersStoreError(error)) throw error;
        return null;
      });
    const ordersAvailable = Array.isArray(orders);

    const recentProducts =
      await dbQuery(`
        SELECT
          p.id,
          p.name,
          p.price,
          COALESCE(p.image, primary_image.image_url) AS image,
          p.created_at,
          p.status,

          c.name AS category_name

        FROM products p

        LEFT JOIN categories c
        ON p.category_id = c.id

        LEFT JOIN (
          SELECT pi.product_id, MIN(pi.image_url) AS image_url
          FROM product_images pi
          GROUP BY pi.product_id
        ) primary_image
        ON primary_image.product_id = p.id

        ${activeProductWhere}

        ORDER BY p.created_at DESC, p.id DESC

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

    const totalRevenue = ordersAvailable
      ? orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)
      : null;

    const pendingOrders = ordersAvailable
      ? orders.filter((order) => order.order_status === "Pending").length
      : null;

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

        totalOrders: ordersAvailable ? orders.length : null,
        ordersAvailable,

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
    const orders = await dbQuery(`
      SELECT 
        o.id,
        o.order_number,
        o.total_amount,
        o.payment_method,
        o.payment_status,
        o.amount_paid,
        o.cod_due,
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
        o.payment_method,
        o.payment_status,
        o.amount_paid,
        o.cod_due,
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

          paymentMethod:
            order.payment_method ||
            "Not specified",

          paymentStatus:
            order.payment_status ||
            "Pending",

          amountPaid:
            Number(order.amount_paid) ||
            0,

          codDue:
            Number(order.cod_due) ||
            0,

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
      message: missingOrdersStoreError(error)
        ? "Orders could not be loaded because the order store is unavailable."
        : "Failed to fetch orders",
      ordersAvailable: false,
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
    twoFactorEnabled:
      Boolean(
        Number(
          adminRow.two_factor_enabled ?? profile.twoFactorEnabled ?? 0
        )
      ),
    memberSince:
      adminRow.created_at
        ? formatRelativeDate(adminRow.created_at)
        : profile.memberSince || "Not available",
    securityScore:
      profile.securityScore || "98/100",
    lastActivity:
      adminRow.last_login_at
        ? formatRelativeDate(adminRow.last_login_at)
        : "Not available",
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
            two_factor_enabled,
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
        SELECT id, name, email, phone, location, profile_image, role, status, two_factor_enabled, last_login_at, created_at
        FROM admins
        WHERE id = ?
        LIMIT 1
      `,
      [req.admin?.id]
    );

    const savedProfile = buildAdminProfile(
      rows[0] || {
        id: req.admin?.id,
        name,
        email,
        phone,
        location,
        profile_image: image,
        role: req.admin?.role,
      }
    );

    updateMockAdminProfile(savedProfile);

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
      profile: savedProfile,
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
  const otp = String(req.body?.otp || "").trim();

  if (!otp) {
    return res.status(400).json({
      message:
        "Email OTP is required to update two-factor authentication",
    });
  }

  const verification = await verifyAdminOtp({
    adminId: req.admin?.id,
    purpose: "security_change",
    otp,
  });

  if (!verification.ok) {
    return res.status(401).json({
      message: verification.message,
    });
  }

  await dbQuery(
    "UPDATE admins SET two_factor_enabled = ? WHERE id = ?",
    [enabled ? 1 : 0, req.admin?.id]
  );

  const profile =
    updateMockAdminProfile({
      twoFactorEnabled: enabled,
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

export async function requestAdminSecurityOtp(
  req,
  res
) {
  try {
    const rows = await dbQuery(
      `
        SELECT id, name, email, phone
        FROM admins
        WHERE id = ?
        LIMIT 1
      `,
      [req.admin?.id]
    );
    const admin = rows[0];

    if (!admin?.email) {
      return res.status(404).json({
        message: "Admin account email not found",
      });
    }

    await createAdminOtp(
      admin,
      "security_change"
    );

    res.json({
      message:
        "Security OTP sent to your registered email/mobile",
    });
  } catch (error) {
    console.log("Admin Security OTP Error:", error);
    res.status(500).json({
      message: "Unable to send security OTP",
    });
  }
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
    !req.body?.newPassword ||
    !req.body?.otp
  ) {
    return res
      .status(400)
      .json({
        message:
          "Current password, new password, and email OTP are required",
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

    const verification = await verifyAdminOtp({
      adminId: req.admin?.id,
      purpose: "security_change",
      otp: req.body.otp,
    });

    if (!verification.ok) {
      return res.status(401).json({
        message: verification.message,
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

  const profile =
    updateMockAdminProfile({
      image,
    });

  addProfileActivity(
    image ? "Profile image updated" : "Profile image removed",
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
    image ? "Profile image updated" : "Profile image removed",
    "Profile",
    image ? "Image changed" : "Image removed"
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
          profile_image,
          created_at

        FROM admins
        WHERE COALESCE(status, 'Active') <> 'Deleted'

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
          image:
            admin.profile_image || "",
          profile_image:
            admin.profile_image || "",
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
