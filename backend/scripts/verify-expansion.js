import db from "../config/db.js";

const base = (process.env.EXPANSION_VERIFY_URL || "http://localhost:5000/api").replace(/\/$/, "");
const email = process.env.EXPANSION_VERIFY_ADMIN_EMAIL || "admin@goldencreation.in";
const password = process.env.EXPANSION_VERIFY_ADMIN_PASSWORD || "Admin@123";
const stamp = Date.now();
const created = { storeIds: [], productId: null, orderId: null, supplierId: null, staffId: null, taskTitle: "", subscriber: "" };

function assert(value, message) {
  if (!value) throw new Error(message);
}

function sql(query, values = []) {
  return new Promise((resolve, reject) => db.query(query, values, (error, rows) => error ? reject(error) : resolve(rows)));
}

async function raw(path, { token, ...options } = {}) {
  return fetch(`${base}${path}`, {
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
    ...options,
  });
}

async function request(path, options = {}) {
  const response = await raw(path, options);
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path}: ${response.status} ${await response.text()}`);
  return response.headers.get("content-type")?.includes("application/json") ? response.json() : response.arrayBuffer();
}

async function expectStatus(path, status, options = {}) {
  const response = await raw(path, options);
  assert(response.status === status, `${options.method || "GET"} ${path}: expected ${status}, got ${response.status}`);
}

const json = (value) => JSON.stringify(value);

async function cleanup() {
  if (created.orderId) await sql("DELETE FROM orders WHERE id=?", [created.orderId]);
  if (created.productId) await sql("DELETE FROM products WHERE id=?", [created.productId]);
  if (created.supplierId) await sql("DELETE FROM suppliers WHERE id=?", [created.supplierId]);
  if (created.taskTitle) await sql("DELETE FROM tasks WHERE title=?", [created.taskTitle]);
  if (created.staffId) await sql("DELETE FROM admins WHERE id=?", [created.staffId]);
  if (created.storeIds.length) {
    await sql("DELETE FROM low_stock_alert_state WHERE catalog='store' AND product_id IN (?)", [created.storeIds]);
    await sql("DELETE FROM store_products WHERE id IN (?)", [created.storeIds]);
  }
  if (created.subscriber) await sql("DELETE FROM newsletter_subscribers WHERE email=?", [created.subscriber]);
  db.end();
}

async function run() {
  const health = await request("/health");
  assert(health.status === "ok", "Health check failed");
  const login = await request("/admin/login", { method: "POST", body: json({ email, password }) });
  const token = login.token;

  for (const catalog of ["website", "warehouse", "store"]) {
    const payload = await request(`/admin/inventory/catalog?catalog=${catalog}&limit=2`, { token });
    assert(payload.catalog === catalog, `${catalog} inventory is not separated`);
  }
  const linkedWarehouse = await sql("SELECT COUNT(*) count FROM warehouse_stock WHERE product_id IS NOT NULL");
  assert(Number(linkedWarehouse[0].count) === 0, "Warehouse still contains Website-linked stock rows");

  const sku = `VERIFY-STORE-${stamp}`;
  const saved = await request("/admin/catalogs/store/products", { token, method: "POST", body: json({ sku, name: "Expansion Verify Store Product", mrp: 20, reorderLevel: 3 }) });
  const storeId = saved.product.id; created.storeIds.push(storeId);
  await request("/admin/catalogs/store/stock", { token, method: "POST", body: json({ productId: storeId, stockOnHand: 1, reorderLevel: 3 }) });
  await request("/admin/catalogs/store/movements", { token, method: "POST", body: json({ productId: storeId, movementType: "Inward", quantity: 4, reference: "verify" }) });
  const store = await request(`/admin/catalogs/store?q=${sku}`, { token });
  const movement = store.movements.find((item) => Number(item.store_product_id) === Number(storeId));
  await request(`/admin/catalogs/store/movements/${movement.id}/approval`, { token, method: "PUT", body: json({ status: "Approved" }) });
  const adjusted = await request(`/admin/catalogs/store?q=${sku}`, { token });
  assert(Number(adjusted.products[0].stock_on_hand) === 5, "Approved Store movement did not update stock");
  const protectedStore = await request("/admin/bulk/store-products", { token, method: "POST", body: json({ action: "delete", ids: [storeId] }) });
  assert(protectedStore.result.blocked.length === 1, "Permanent delete did not block Store movement history");
  const lookup = await request(`/admin/lookups/products?catalog=store&q=${sku}&limit=1`, { token });
  assert(Number(lookup.pagination.total) === 1, "AJAX product lookup failed");
  assert(lookup.results.length === 1 && Number(lookup.pagination.limit) === 1, "AJAX lookup pagination failed");

  const importSku = `VERIFY-IMPORT-${stamp}`;
  await request("/admin/catalogs/store/import", { token, method: "POST", body: json({ products: [{ sku: importSku, name: "Imported Verify Product", stock: 7, reorderLevel: 2 }] }) });
  const imported = await sql("SELECT p.id, s.stock_on_hand FROM store_products p JOIN store_stock s ON s.store_product_id=p.id WHERE p.sku=?", [importSku]);
  assert(Number(imported[0].stock_on_hand) === 7, "Store spreadsheet upsert failed"); created.storeIds.push(imported[0].id);

  created.subscriber = `expansion-${stamp}@example.com`;
  await request("/newsletter/subscribe", { method: "POST", body: json({ email: created.subscriber, source: "homepage" }) });
  await request("/newsletter/subscribe", { method: "POST", body: json({ email: created.subscriber, source: "blog" }) });
  const subscribers = await request(`/admin/newsletter?q=${encodeURIComponent(created.subscriber)}`, { token });
  assert(Number(subscribers.pagination.total) === 1, "Newsletter dedupe failed");

  const title = `Expansion Verify Blog ${stamp}`;
  await request("/admin/blog", { token, method: "POST", body: json({ title, excerpt: "Verify", content: "Verify", status: "Published" }) });
  const publicBlog = await request("/blog");
  const post = publicBlog.posts.find((item) => item.title === title);
  assert(post, "Published blog is missing from public API");
  await request(`/admin/blog/${post.id}`, { token, method: "DELETE" });

  const categoryRows = await sql("SELECT id FROM categories ORDER BY id LIMIT 1");
  const websiteProduct = await request("/products", { method: "POST", body: json({ name: `Verify Website Product ${stamp}`, price: 99, category_id: categoryRows[0].id, sku: `VERIFY-WEB-${stamp}`, stock_quantity: 4, reorder_level: 1, status: "Active" }) });
  created.productId = websiteProduct.product.id;
  const buyer = `buyer-${stamp}@example.com`;
  const order = await request("/orders", { method: "POST", body: json({ customer: { name: "Verify Buyer", email: buyer, phone: "9999999999" }, items: [{ productId: created.productId, name: `Verify Website Product ${stamp}`, quantity: 2, price: 99 }], subtotal: 198 }) });
  created.orderId = order.order.databaseId;
  const stock = await sql("SELECT stock_quantity FROM products WHERE id=?", [created.productId]);
  assert(Number(stock[0].stock_quantity) === 2, "Website order did not deduct base product stock");
  const blocked = await request("/admin/bulk/website-products", { token, method: "POST", body: json({ action: "delete", ids: [created.productId] }) });
  assert(blocked.result.blocked.length === 1, "Permanent delete did not block referenced product");
  await request(`/admin/orders/${created.orderId}/shipment`, { token, method: "PUT", body: json({ status: "Delivered", trackingUrl: "https://tracking.example/verify", logisticsProvider: "Verify Logistics" }) });
  const customerOrders = await request(`/orders?email=${buyer}`);
  assert(customerOrders.orders[0].trackingUrl === "https://tracking.example/verify", "Tracking URL is hidden from customer orders");
  await expectStatus("/returns", 404, { method: "POST", body: json({ orderNumber: order.order.id, requestType: "Return", reason: "Wrong contact", email: "wrong@example.com" }) });
  await request("/returns", { method: "POST", body: json({ orderNumber: order.order.id, requestType: "Return", reason: "Verify return", email: buyer }) });
  const returns = await request(`/returns?email=${buyer}`);
  assert(!Object.hasOwn(returns.requests[0], "internal_remarks"), "Internal return remarks leaked to the customer API");
  await sql("UPDATE orders SET delivered_at=DATE_SUB(NOW(), INTERVAL 11 DAY) WHERE id=?", [created.orderId]);
  await expectStatus("/returns", 400, { method: "POST", body: json({ orderNumber: order.order.id, requestType: "Replacement", reason: "Outside window", email: buyer }) });

  const staffEmail = `staff-${stamp}@example.com`;
  const staff = await request("/admin/staff", { token, method: "POST", body: json({ name: "Verify Staff", email: staffEmail, password: "Staff@123", role: "Store Manager" }) });
  created.staffId = Number(String(staff.staff.id).replace("ADM-", ""));
  created.taskTitle = `Verify Task ${stamp}`;
  await request("/admin/tasks", { token, method: "POST", body: json({ title: created.taskTitle, assigneeIds: [created.staffId] }) });
  const staffLogin = await request("/admin/login", { method: "POST", body: json({ email: staffEmail, password: "Staff@123" }) });
  const ownTasks = await request("/admin/tasks", { token: staffLogin.token });
  assert(ownTasks.assignments.some((item) => item.title === created.taskTitle), "Staff cannot see assigned task");
  await expectStatus("/admin/activity", 403, { token: staffLogin.token });
  await expectStatus("/admin/notifications", 403, { token: staffLogin.token });
  await expectStatus("/admin/notifications/refresh-low-stock", 403, { token: staffLogin.token, method: "POST" });
  const hr = await request("/admin/hr", { token });
  assert(["done_today", "done_week", "done_month"].every((key) => Object.hasOwn(hr.summary, key)), "HR period metrics are missing");

  const workbook = await request("/admin/exports/orders", { token });
  const bytes = new Uint8Array(workbook);
  assert(bytes[0] === 0x50 && bytes[1] === 0x4b, "Orders export is not a valid XLSX workbook");
  await request("/admin/notifications/refresh-low-stock", { token, method: "POST" });
  const before = await request("/admin/notifications", { token });
  await request("/admin/notifications/refresh-low-stock", { token, method: "POST" });
  const after = await request("/admin/notifications", { token });
  assert(before.notifications.length === after.notifications.length, "Low-stock notification dedupe failed");

  console.log("Expansion verification passed");
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(cleanup);
