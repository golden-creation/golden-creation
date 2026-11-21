import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";
import { deleteFromSpaces } from "../services/media-storage.service.js";

dotenv.config();

const baseUrl = String(process.env.SALES_VERIFY_BASE_URL || "http://127.0.0.1:5000").replace(/\/$/, "");
const adminEmail = process.env.SALES_VERIFY_ADMIN_EMAIL || "admin@goldencreation.in";
const adminPassword = process.env.SALES_VERIFY_ADMIN_PASSWORD || "Admin@123";
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = `Sales-${suffix}!`;
const testEmails = [`sales-one-${suffix}@example.test`, `sales-two-${suffix}@example.test`];
const created = {
  adminIds: [],
  leadIds: [],
  catalogIds: [],
  productIds: [],
  categoryIds: [],
  brandIds: [],
  tagIds: [],
  collectionIds: [],
};

const db = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "lekhanmart",
});

async function request(path, { token, method = "GET", body, expected = 200 } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, expected, `${method} ${path}: ${response.status} ${JSON.stringify(payload)}`);
  return { response, payload };
}

async function login(email, loginPassword) {
  const { payload } = await request("/api/admin/login", {
    method: "POST",
    body: { email, password: loginPassword },
  });
  assert.ok(payload.token, `Login token missing for ${email}`);
  return payload.token;
}

async function getAdminToken() {
  if (String(process.env.SALES_VERIFY_DB_AUTH || "").toLowerCase() !== "true") {
    return login(adminEmail, adminPassword);
  }

  const [admins] = await db.query(
    "SELECT id,email,role FROM admins WHERE status='Active' AND LOWER(TRIM(role))='super admin' ORDER BY id LIMIT 1"
  );
  assert.ok(admins[0], "An active Super Admin is required for verification");
  return jwt.sign(
    { id: admins[0].id, email: admins[0].email, role: admins[0].role, type: "admin" },
    process.env.JWT_SECRET || "local_dev_secret_change_before_deploy",
    { expiresIn: "15m" }
  );
}

async function waitForCatalog(token, id) {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const { payload } = await request(`/api/admin/sales-catalogs/${id}`, { token });
    if (payload.catalog.status === "Ready") return payload.catalog;
    if (payload.catalog.status === "Failed") {
      throw new Error(`Catalog generation failed: ${payload.catalog.error_message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Catalog generation did not finish within 90 seconds");
}

async function archiveAndVerify(token, catalog) {
  await request(`/api/admin/sales-catalogs/${catalog.id}/archive`, {
    token,
    method: "POST",
  });
  await request(new URL(catalog.publicUrl).pathname, { expected: 404 });
}

try {
  const [brandResult] = await db.execute(
    "INSERT INTO brands (name,slug,status) VALUES (?,?, 'Active')",
    [`Verification Brand ${suffix}`, `verification-brand-${suffix}`]
  );
  created.brandIds.push(Number(brandResult.insertId));
  const [parentCategory] = await db.execute(
    "INSERT INTO categories (name,slug,status) VALUES (?,?, 'Active')",
    [`Verification Parent ${suffix}`, `verification-parent-${suffix}`]
  );
  created.categoryIds.push(Number(parentCategory.insertId));
  const [childCategory] = await db.execute(
    "INSERT INTO categories (parent_id,name,slug,status) VALUES (?,?,?, 'Active')",
    [parentCategory.insertId, `Verification Child ${suffix}`, `verification-child-${suffix}`]
  );
  created.categoryIds.push(Number(childCategory.insertId));

  for (let index = 0; index < 8; index += 1) {
    const [product] = await db.execute(
      `INSERT INTO products
       (name,description,price,category_id,brand_id,sku,stock_quantity,status)
       VALUES (?,?,?,?,?,?,?,'Active')`,
      [
        `VerifyProduct-${suffix}-${index + 1}`,
        `Temporary catalog verification product ${index + 1}`,
        (index + 1) * 100,
        childCategory.insertId,
        brandResult.insertId,
        `VERIFY-${suffix}-${index + 1}`,
        index < 6 ? 5 : 0,
      ]
    );
    created.productIds.push(Number(product.insertId));
  }

  const [tagResult] = await db.execute(
    "INSERT INTO tags (name,slug,status) VALUES (?,?, 'Active')",
    [`Verification Tag ${suffix}`, `verification-tag-${suffix}`]
  );
  created.tagIds.push(Number(tagResult.insertId));
  await db.query("INSERT INTO product_tags (product_id,tag_id) VALUES ?", [
    created.productIds.slice(0, 2).map((productId) => [productId, tagResult.insertId]),
  ]);

  const [manualCollection] = await db.execute(
    "INSERT INTO collections (name,slug,type,status,conditions_json) VALUES (?,?,'manual','Active','{}')",
    [`Verification Manual ${suffix}`, `verification-manual-${suffix}`]
  );
  created.collectionIds.push(Number(manualCollection.insertId));
  await db.query("INSERT INTO collection_products (collection_id,product_id,sort_order) VALUES ?", [
    created.productIds.slice(0, 3).map((productId, index) => [manualCollection.insertId, productId, index + 1]),
  ]);
  const [automaticCollection] = await db.execute(
    "INSERT INTO collections (name,slug,type,status,conditions_json) VALUES (?,?,'automatic','Active',?)",
    [
      `Verification Automatic ${suffix}`,
      `verification-automatic-${suffix}`,
      JSON.stringify({ match: "all", tags: [`verification-tag-${suffix}`] }),
    ]
  );
  created.collectionIds.push(Number(automaticCollection.insertId));

  const hash = await bcrypt.hash(password, 10);
  for (const [index, email] of testEmails.entries()) {
    const [result] = await db.execute(
      `INSERT INTO admins (name,email,password,role,status,permissions)
       VALUES (?,?,?,'Salesman','Active',?)`,
      [`Sales Verification ${index + 1}`, email, hash, JSON.stringify(["dashboard", "leads", "sales_catalogs", "tasks", "profile"])]
    );
    created.adminIds.push(Number(result.insertId));
  }

  const [adminToken, salesmanOneToken, salesmanTwoToken] = await Promise.all([
    getAdminToken(),
    login(testEmails[0], password),
    login(testEmails[1], password),
  ]);

  await request("/api/admin/products", { token: salesmanOneToken, expected: 403 });

  const meetingAt = new Date(Date.now() + 3600000).toISOString();
  for (const [index, ownerId] of created.adminIds.entries()) {
    const { payload } = await request("/api/admin/leads", {
      token: adminToken,
      method: "POST",
      expected: 201,
      body: {
        leadName: `Verification Lead ${index + 1}`,
        meetingAt,
        companyName: "Golden Creation Verification",
        contactPerson: `Contact ${index + 1}`,
        phone: "9999999999",
        whatsapp: "9999999999",
        email: `contact-${index + 1}@example.test`,
        notes: "Temporary automated verification lead",
        ownerId,
      },
    });
    created.leadIds.push(Number(payload.id));
  }

  const { payload: ownLeads } = await request("/api/admin/leads?limit=100", { token: salesmanOneToken });
  assert.deepEqual(ownLeads.leads.map((lead) => Number(lead.id)), [created.leadIds[0]]);
  await request(`/api/admin/leads/${created.leadIds[1]}`, { token: salesmanOneToken, expected: 404 });

  await request(`/api/admin/leads/${created.leadIds[0]}`, {
    token: salesmanOneToken,
    method: "PUT",
    expected: 400,
    body: {
      leadName: "Verification Lead 1",
      meetingAt,
      status: "Closed Won",
    },
  });

  const queryPrefix = encodeURIComponent(`VerifyProduct-${suffix}`);
  const { payload: search } = await request(`/api/admin/sales-catalog-products?limit=200&inStock=false&q=${queryPrefix}`, {
    token: salesmanOneToken,
  });
  assert.equal(search.products.length, 8);
  const productIds = search.products.slice(0, 8).map((product) => Number(product.id));
  const { payload: inStock } = await request(`/api/admin/sales-catalog-products?limit=200&q=${queryPrefix}`, {
    token: salesmanOneToken,
  });
  assert.equal(inStock.products.length, 6);
  const { payload: categoryMatch } = await request(
    `/api/admin/sales-catalog-products?limit=200&inStock=false&categoryIds=${created.categoryIds[0]}`,
    { token: salesmanOneToken }
  );
  assert.ok(created.productIds.every((id) => categoryMatch.products.some((product) => Number(product.id) === id)));
  const { payload: tagMatch } = await request(
    `/api/admin/sales-catalog-products?limit=200&inStock=false&tagIds=${created.tagIds[0]}`,
    { token: salesmanOneToken }
  );
  assert.equal(tagMatch.products.filter((product) => created.productIds.includes(Number(product.id))).length, 2);
  for (const collectionId of created.collectionIds) {
    const { payload: collectionMatch } = await request(
      `/api/admin/sales-catalog-products?limit=200&inStock=false&collectionIds=${collectionId}`,
      { token: salesmanOneToken }
    );
    assert.ok(collectionMatch.products.some((product) => created.productIds.includes(Number(product.id))));
  }

  await request("/api/admin/sales-catalogs", {
    token: salesmanOneToken,
    method: "POST",
    expected: 400,
    body: {
      name: "Oversized Verification Catalog",
      layout: "2x2",
      productIds: Array.from({ length: 201 }, (_, index) => index + 1),
    },
  });

  const createCatalog = async (layout, ids) => {
    const { payload } = await request("/api/admin/sales-catalogs", {
      token: salesmanOneToken,
      method: "POST",
      expected: 201,
      body: {
        name: `Verification Catalog ${layout}`,
        leadId: created.leadIds[0],
        layout,
        filters: { inStock: false },
        productIds: ids,
      },
    });
    const id = Number(payload.id);
    created.catalogIds.push(id);
    return id;
  };

  const detailedId = await createCatalog("2x2", productIds.slice(0, 4));
  await request(`/api/admin/sales-catalogs/${detailedId}`, { token: salesmanTwoToken, expected: 404 });
  await request(`/api/admin/sales-catalogs/${detailedId}/generate`, {
    token: salesmanOneToken,
    method: "POST",
    expected: 202,
  });
  const detailed = await waitForCatalog(salesmanOneToken, detailedId);
  const detailedPdf = await request(new URL(detailed.publicUrl).pathname);
  assert.match(detailedPdf.response.headers.get("content-type") || "", /application\/pdf/);
  assert.equal(detailedPdf.payload.subarray(0, 4).toString(), "%PDF");
  assert.ok(detailedPdf.payload.length > 500, "Detailed PDF is unexpectedly small");
  await request(`/api/admin/sales-catalogs/${detailedId}`, {
    token: salesmanOneToken,
    method: "PUT",
    expected: 409,
    body: { name: "Should not update", layout: "2x2", productIds: productIds.slice(0, 4) },
  });

  const compactId = await createCatalog("2x4", productIds);
  await request(`/api/admin/sales-catalogs/${compactId}/generate`, {
    token: salesmanOneToken,
    method: "POST",
    expected: 202,
  });
  const compact = await waitForCatalog(salesmanOneToken, compactId);
  const compactPdf = await request(new URL(compact.publicUrl).pathname);
  assert.match(compactPdf.response.headers.get("content-type") || "", /application\/pdf/);
  assert.equal(compactPdf.payload.subarray(0, 4).toString(), "%PDF");
  assert.ok(compactPdf.payload.length > 500, "Compact PDF is unexpectedly small");

  await request(`/api/admin/leads/${created.leadIds[0]}`, {
    token: adminToken,
    method: "PUT",
    body: {
      leadName: "Verification Lead 1",
      meetingAt,
      companyName: "Golden Creation Verification",
      status: "In Progress",
      notes: "Reassigned during integration verification",
      ownerId: created.adminIds[1],
    },
  });
  await request(`/api/admin/leads/${created.leadIds[0]}`, { token: salesmanOneToken, expected: 404 });
  await request(`/api/admin/leads/${created.leadIds[0]}`, { token: salesmanTwoToken });

  await archiveAndVerify(salesmanOneToken, detailed);
  await archiveAndVerify(salesmanOneToken, compact);
  console.log("Salesman leads and PDF catalog verification passed.");
} finally {
  if (created.catalogIds.length) {
    const [storedCatalogs] = await db.query(
      "SELECT pdf_storage_key FROM sales_catalogs WHERE id IN (?) AND pdf_storage_key IS NOT NULL",
      [created.catalogIds]
    );
    for (const catalog of storedCatalogs) {
      await deleteFromSpaces(catalog.pdf_storage_key).catch(() => {});
    }
    await db.query("DELETE FROM sales_catalog_shares WHERE catalog_id IN (?)", [created.catalogIds]);
    await db.query("DELETE FROM sales_catalog_products WHERE catalog_id IN (?)", [created.catalogIds]);
    await db.query("DELETE FROM sales_catalogs WHERE id IN (?)", [created.catalogIds]);
  }
  if (created.leadIds.length) {
    await db.query("DELETE FROM sales_lead_history WHERE lead_id IN (?)", [created.leadIds]);
    await db.query("DELETE FROM sales_leads WHERE id IN (?)", [created.leadIds]);
  }
  if (created.adminIds.length) {
    await db.query("DELETE FROM admins WHERE id IN (?)", [created.adminIds]);
  }
  if (created.productIds.length) {
    await db.query("DELETE FROM collection_products WHERE product_id IN (?)", [created.productIds]);
    await db.query("DELETE FROM product_tags WHERE product_id IN (?)", [created.productIds]);
    await db.query("DELETE FROM products WHERE id IN (?)", [created.productIds]);
  }
  if (created.collectionIds.length) {
    await db.query("DELETE FROM collections WHERE id IN (?)", [created.collectionIds]);
  }
  if (created.tagIds.length) {
    await db.query("DELETE FROM tags WHERE id IN (?)", [created.tagIds]);
  }
  if (created.categoryIds.length) {
    await db.query("DELETE FROM categories WHERE id IN (?) ORDER BY parent_id DESC", [created.categoryIds]);
  }
  if (created.brandIds.length) {
    await db.query("DELETE FROM brands WHERE id IN (?)", [created.brandIds]);
  }
  await db.end();
}
