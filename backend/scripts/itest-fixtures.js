import bcrypt from "bcrypt";
import mysql from "mysql2/promise";
import "./../config/load-env.js";

const allowedDatabases = new Set(["lekhanmart_itest", "gc_ci"]);
if (!allowedDatabases.has(process.env.DB_NAME)) {
  console.error("Refusing fixture load because DB_NAME is not an isolated test database");
  process.exit(1);
}

const db = await mysql.createConnection({
  host: process.env.DB_HOST || "127.0.0.1",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
});

const [identity] = await db.query("SELECT DATABASE() AS name");
if (identity[0].name !== process.env.DB_NAME || identity[0].name === "goldencreation_db") {
  console.error("Refusing fixture load because the connection is not the isolated test database");
  process.exit(1);
}

await db.query(`
  CREATE TABLE IF NOT EXISTS checkout_attempts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    idempotency_key VARCHAR(80) NOT NULL,
    payload_hash CHAR(64) NOT NULL,
    status VARCHAR(30) NOT NULL,
    order_id INT NULL,
    order_number VARCHAR(40) NULL,
    response_json LONGTEXT NULL,
    error_message VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_checkout_attempt_key (idempotency_key),
    KEY idx_checkout_attempt_order (order_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

const [attemptColumn] = await db.query(
  `SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'lekhanmart_itest' AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'checkout_attempt_id'`
);
if (!attemptColumn.length) {
  await db.query("ALTER TABLE orders ADD COLUMN checkout_attempt_id BIGINT UNSIGNED NULL");
}
const [attemptIndex] = await db.query(
  `SELECT INDEX_NAME FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = 'lekhanmart_itest' AND TABLE_NAME = 'orders' AND INDEX_NAME = 'uq_orders_checkout_attempt'`
);
if (!attemptIndex.length) {
  await db.query("ALTER TABLE orders ADD UNIQUE KEY uq_orders_checkout_attempt (checkout_attempt_id)");
}

const passwordHash = await bcrypt.hash("Itest-Admin-2026", 10);
await db.query(
  `INSERT INTO admins (name, email, password, role, status, two_factor_enabled)
   VALUES ('ITEST Admin', 'itest.admin@example.com', ?, 'Super Admin', 'Active', 0)
   ON DUPLICATE KEY UPDATE password = VALUES(password), role = 'Super Admin', status = 'Active', two_factor_enabled = 0`,
  [passwordHash]
);

const [rules] = await db.query("SELECT id FROM shipping_rules WHERE name = 'ITEST All India' LIMIT 1");
if (!rules.length) {
  const [result] = await db.query(
    `INSERT INTO shipping_rules (name, region, min_order_value, charge, delivery_days, eta, status)
     VALUES ('ITEST All India', 'All India', 0, 40, 3, '3 days', 'Active')`
  );
  await db.query(
    "INSERT INTO shipping_rule_locations (rule_id, location_type, location_value) VALUES (?, 'All India', '')",
    [result.insertId]
  );
}

const [categories] = await db.query("SELECT id FROM categories WHERE status = 'Active' ORDER BY id LIMIT 1");
const categoryId = categories[0]?.id || null;
if (categoryId) {
  await db.query(
    `INSERT INTO category_tax_rules (category_id, tax_name, tax_rate, status)
     VALUES (?, 'GST', 18, 'Active')
     ON DUPLICATE KEY UPDATE tax_rate = 18, status = 'Active'`,
    [categoryId]
  );
}

await db.query(
  `INSERT INTO discounts (code, name, discount_type, method, value, status)
   VALUES ('ITEST10', 'ITEST 10 percent', 'percentage', 'Coupon', 10, 'Active')
   ON DUPLICATE KEY UPDATE status = 'Active', value = 10, discount_type = 'percentage'`
);

await db.query(
  `INSERT INTO menus (title, type, url, sort_order, visibility)
   SELECT 'ITEST Menu', 'custom', '/all-products', 1, 'Visible'
   WHERE NOT EXISTS (SELECT 1 FROM menus WHERE title = 'ITEST Menu')`
);

await db.query(
  `INSERT INTO blog_posts (slug, title, excerpt, content, status, author, published_at)
   VALUES (
     'itest-formatting',
     'ITEST formatting',
     'Synthetic article',
     '<h2>ITEST heading</h2><ul><li>ITEST list item</li></ul><p><a href=\"/all-products\">ITEST link</a></p>',
     'Published',
     'ITEST',
     NOW()
   )
   ON DUPLICATE KEY UPDATE content = VALUES(content), status = 'Published'`
);

await db.query("UPDATE products SET stock_quantity = 30 WHERE name LIKE 'ITEST%' AND deleted_at IS NULL");

await db.query(
  `INSERT INTO products (name, description, price, category_id, status, stock_quantity, gst_inclusive)
   SELECT 'ITEST Disposable', 'Synthetic product with no orders', 100, ?, 'Active', 4, 1
   WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'ITEST Disposable')`,
  [categoryId]
);
await db.query(
  `INSERT INTO products (name, description, price, category_id, status, stock_quantity, gst_inclusive)
   SELECT 'ITEST Linked', 'Synthetic product linked to an order', 100, ?, 'Active', 4, 1
   WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'ITEST Linked')`,
  [categoryId]
);

const [linked] = await db.query("SELECT id FROM products WHERE name = 'ITEST Linked' LIMIT 1");
const [existingItem] = await db.query(
  "SELECT id FROM order_items WHERE product_id = ? LIMIT 1",
  [linked[0].id]
);
if (!existingItem.length) {
  const [orders] = await db.query("SELECT id FROM orders WHERE order_number = 'ITEST-LINKED-1' LIMIT 1");
  let orderId = orders[0]?.id;
  if (!orderId) {
    const [order] = await db.query(
      `INSERT INTO orders (order_number, customer_name, customer_email, payment_method, subtotal, total_amount, order_status)
       VALUES ('ITEST-LINKED-1', 'ITEST Customer', 'itest.customer@example.com', 'Full COD', 100, 100, 'Processing')`
    );
    orderId = order.insertId;
  }
  await db.query(
    `INSERT INTO order_items (order_id, product_id, product_name, quantity, price, line_total)
     VALUES (?, ?, 'ITEST Linked', 1, 100, 100)`,
    [orderId, linked[0].id]
  );
}

const [tables] = await db.query(
  `SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = 'lekhanmart_itest'
      AND TABLE_NAME IN ('admins','users','products','categories','brands','menus','product_reviews','orders','checkout_attempts','discounts','product_stock_audit_logs','shipping_rules','payment_transactions')
    ORDER BY TABLE_NAME`
);
console.log(tables.map((row) => row.TABLE_NAME).join(","));
await db.end();
