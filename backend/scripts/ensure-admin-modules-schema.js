import "dotenv/config";
import mysql from "mysql2/promise";
import { seedAdminModuleData } from "./admin-module-seed.js";
import { ensureExpansionSchema } from "./ensure-expansion-schema.js";
import { ensureSeoSchema } from "./ensure-seo-schema.js";
import { promiseQueryRows } from "./admin-audit-schema.js";
import { dataSeedAuthorized, dataSeedRefusalReason, refuseProductionSchemaTarget } from "./setup-safety.js";

refuseProductionSchemaTarget();
const dbName = process.env.DB_NAME || "lekhanmart";
const startedAt = Date.now();
const timeoutMs = Math.min(Math.max(Number(process.env.SCHEMA_INIT_TIMEOUT_MS) || 180000, 5000), 600000);
let root;
let db;
const timer = setTimeout(() => {
  console.error(`schema_init TIMEOUT after ${timeoutMs}ms`);
  Promise.all([
    db?.end().catch(() => {}),
    root?.end().catch(() => {}),
  ]).finally(() => process.exit(1));
}, timeoutMs);

function progress(phase) {
  console.log(`schema_init_phase=${phase} elapsed_ms=${Date.now() - startedAt}`);
}

const baseConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  port: Number(process.env.DB_PORT) || 3306,
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 10000,
  multipleStatements: true,
};

try {
progress("connect");
root = await mysql.createConnection(baseConfig);
try {
  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
} catch (error) {
  if (error.errno !== 1044 && error.code !== "ER_DBACCESS_DENIED_ERROR") throw error;
} finally {
  await root.end();
  root = undefined;
}

db = await mysql.createConnection({
  ...baseConfig,
  database: dbName,
});

async function addColumnIfMissing(table, column, definition) {
  const [rows] = await db.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `,
    [dbName, table, column]
  );

  if (!rows.length) {
    await db.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
  }
}

async function indexExists(table, indexName) {
  const [rows] = await db.query(
    `
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      LIMIT 1
    `,
    [dbName, table, indexName]
  );

  return rows.length > 0;
}

async function constraintExists(table, constraintName) {
  const [rows] = await db.query(
    `
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = ?
      LIMIT 1
    `,
    [dbName, table, constraintName]
  );

  return rows.length > 0;
}

progress("admin-modules");
await db.query(`
  CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL UNIQUE,
    parent_id INT NULL,
    slug VARCHAR(180) NULL,
    image LONGTEXT NULL,
    description TEXT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    image VARCHAR(255) NULL,
    category_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_products_category_id (category_id),
    CONSTRAINT fk_products_category
      FOREIGN KEY (category_id)
      REFERENCES categories(id)
      ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS product_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    image_url VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_product_images_product_id (product_id),
    CONSTRAINT fk_product_images_product
      FOREIGN KEY (product_id)
      REFERENCES products(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NULL,
    email VARCHAR(190) NULL UNIQUE,
    phone VARCHAR(40) NULL UNIQUE,
    google_id VARCHAR(190) NULL UNIQUE,
    otp VARCHAR(12) NULL,
    otp_expires_at DATETIME NULL,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    email VARCHAR(190) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(80) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);

await addColumnIfMissing("products", "sku", "sku VARCHAR(80) NULL");
await addColumnIfMissing("products", "stock_quantity", "stock_quantity INT NOT NULL DEFAULT 0");
await addColumnIfMissing("products", "reorder_level", "reorder_level INT NOT NULL DEFAULT 0");
await addColumnIfMissing("products", "status", "status VARCHAR(40) NOT NULL DEFAULT 'Active'");
await addColumnIfMissing("products", "barcode", "barcode VARCHAR(120) NULL");
await addColumnIfMissing("products", "weight", "weight DECIMAL(10, 3) NULL");
await addColumnIfMissing("products", "weight_unit", "weight_unit VARCHAR(20) NULL");
await addColumnIfMissing("products", "dimensions", "dimensions JSON NULL");
await addColumnIfMissing("products", "specifications", "specifications JSON NULL");
await addColumnIfMissing("categories", "parent_id", "parent_id INT NULL AFTER id");
await addColumnIfMissing("categories", "slug", "slug VARCHAR(180) NULL AFTER name");
await addColumnIfMissing("categories", "image", "image LONGTEXT NULL AFTER slug");
await addColumnIfMissing("categories", "description", "description TEXT NULL");
await addColumnIfMissing("categories", "status", "status VARCHAR(40) NOT NULL DEFAULT 'Active'");
await addColumnIfMissing("users", "otp_expires_at", "otp_expires_at DATETIME NULL AFTER otp");
await db.query(
  "UPDATE users SET otp_expires_at = NOW() WHERE otp IS NOT NULL AND otp_expires_at IS NULL"
);

if (!(await indexExists("categories", "idx_categories_parent_id"))) {
  await db.query("ALTER TABLE categories ADD INDEX idx_categories_parent_id (parent_id)");
}

await db.query("ALTER TABLE products MODIFY image LONGTEXT NULL");
await db.query("ALTER TABLE product_images MODIFY image_url LONGTEXT NOT NULL");
await addColumnIfMissing("categories", "description", "description TEXT NULL");
await addColumnIfMissing("categories", "status", "status VARCHAR(40) NOT NULL DEFAULT 'Active'");
await addColumnIfMissing("categories", "updated_at", "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
await addColumnIfMissing("admins", "phone", "phone VARCHAR(40) NULL");
await addColumnIfMissing("admins", "location", "location VARCHAR(190) NULL");
await addColumnIfMissing("admins", "profile_image", "profile_image LONGTEXT NULL");
await addColumnIfMissing("admins", "two_factor_enabled", "two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE");
await addColumnIfMissing("admins", "status", "status VARCHAR(40) NOT NULL DEFAULT 'Active'");
await addColumnIfMissing("admins", "permissions", "permissions JSON NULL");
await addColumnIfMissing("admins", "last_login_at", "last_login_at DATETIME NULL");

await db.query(`
  CREATE TABLE IF NOT EXISTS admin_auth_otps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    purpose VARCHAR(40) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    challenge_token_hash VARCHAR(128) NULL,
    attempts INT NOT NULL DEFAULT 0,
    expires_at DATETIME NOT NULL,
    consumed_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_admin_auth_otps_admin_purpose (admin_id, purpose),
    INDEX idx_admin_auth_otps_challenge (challenge_token_hash),
    CONSTRAINT fk_admin_auth_otps_admin
      FOREIGN KEY (admin_id)
      REFERENCES admins(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);

await db.query(`
  CREATE TABLE IF NOT EXISTS brands (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    slug VARCHAR(180) NOT NULL UNIQUE,
    logo LONGTEXT NULL,
    banner LONGTEXT NULL,
    description TEXT NULL,
    meta_title VARCHAR(190) NULL,
    meta_description TEXT NULL,
    website_url VARCHAR(255) NULL,
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(40) NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    INDEX idx_brands_slug (slug),
    INDEX idx_brands_name (name),
    INDEX idx_brands_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    description VARCHAR(255) NULL,
    permissions JSON NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS admin_activity (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NULL,
    actor VARCHAR(160) NOT NULL DEFAULT 'System',
    action VARCHAR(160) NOT NULL,
    module VARCHAR(80) NOT NULL,
    detail VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_admin_activity_module (module),
    INDEX idx_admin_activity_created_at (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(40) NOT NULL UNIQUE,
    user_id INT NULL,
    customer_name VARCHAR(160) NULL,
    customer_email VARCHAR(190) NULL,
    customer_phone VARCHAR(40) NULL,
    street_address VARCHAR(255) NULL,
    city VARCHAR(120) NULL,
    state VARCHAR(120) NULL,
    zip_code VARCHAR(30) NULL,
    payment_method VARCHAR(80) NULL,
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
    shipping_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    order_status VARCHAR(40) NOT NULL DEFAULT 'Processing',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_orders_user_id (user_id),
    INDEX idx_orders_created_at (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    line_total DECIMAL(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order_items_order_id (order_id),
    INDEX idx_order_items_product_id (product_id),
    CONSTRAINT fk_order_items_order
      FOREIGN KEY (order_id)
      REFERENCES orders(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS warehouse_locations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(160) NOT NULL,
    location VARCHAR(160) NOT NULL,
    capacity_units INT NOT NULL DEFAULT 0,
    status VARCHAR(40) NOT NULL DEFAULT 'Operational',
    google_sheet_id VARCHAR(190) NULL,
    google_sheet_url TEXT NULL,
    last_synced_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS warehouse_products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sku VARCHAR(80) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    category VARCHAR(160) NULL,
    unit VARCHAR(40) NOT NULL DEFAULT 'pcs',
    purchase_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    mrp DECIMAL(10, 2) NOT NULL DEFAULT 0,
    status VARCHAR(40) NOT NULL DEFAULT 'Active',
    created_by VARCHAR(160) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_warehouse_products_status (status),
    INDEX idx_warehouse_products_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS warehouse_stock (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NULL,
    warehouse_product_id INT NULL,
    warehouse_id INT NOT NULL,
    sku VARCHAR(80) NULL,
    google_sheet_row_id VARCHAR(80) NULL,
    stock_on_hand INT NOT NULL DEFAULT 0,
    reserved_stock INT NOT NULL DEFAULT 0,
    reorder_level INT NOT NULL DEFAULT 0,
    approval_status VARCHAR(40) NOT NULL DEFAULT 'Approved',
    last_synced_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_warehouse_stock (product_id, warehouse_id),
    UNIQUE KEY uq_warehouse_product_stock (warehouse_product_id, warehouse_id),
    INDEX idx_warehouse_stock_product (product_id),
    INDEX idx_warehouse_stock_warehouse_product (warehouse_product_id),
    INDEX idx_warehouse_stock_warehouse (warehouse_id),
    CONSTRAINT fk_warehouse_stock_product
      FOREIGN KEY (product_id)
      REFERENCES products(id)
      ON DELETE CASCADE,
    CONSTRAINT fk_warehouse_stock_warehouse_product
      FOREIGN KEY (warehouse_product_id)
      REFERENCES warehouse_products(id)
      ON DELETE CASCADE,
    CONSTRAINT fk_warehouse_stock_location
      FOREIGN KEY (warehouse_id)
      REFERENCES warehouse_locations(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS stock_movements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NULL,
    warehouse_product_id INT NULL,
    warehouse_id INT NOT NULL,
    movement_type VARCHAR(40) NOT NULL,
    quantity INT NOT NULL,
    reference VARCHAR(120) NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'Pending',
    requested_by VARCHAR(160) NOT NULL DEFAULT 'System',
    approved_by VARCHAR(160) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME NULL,
    INDEX idx_stock_movements_status (status),
    INDEX idx_stock_movements_product (product_id),
    INDEX idx_stock_movements_warehouse_product (warehouse_product_id),
    CONSTRAINT fk_stock_movements_product
      FOREIGN KEY (product_id)
      REFERENCES products(id)
      ON DELETE CASCADE,
    CONSTRAINT fk_stock_movements_warehouse_product
      FOREIGN KEY (warehouse_product_id)
      REFERENCES warehouse_products(id)
      ON DELETE CASCADE,
    CONSTRAINT fk_stock_movements_warehouse
      FOREIGN KEY (warehouse_id)
      REFERENCES warehouse_locations(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS store_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(120) NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    category VARCHAR(80) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS shipping_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    region VARCHAR(160) NOT NULL,
    min_order_value DECIMAL(10, 2) NOT NULL DEFAULT 0,
    charge DECIMAL(10, 2) NOT NULL DEFAULT 0,
    delivery_days INT NOT NULL DEFAULT 3,
    eta VARCHAR(80) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'Active'
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS discounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(80) NOT NULL UNIQUE,
    discount_type VARCHAR(40) NOT NULL,
    value DECIMAL(10, 2) NOT NULL DEFAULT 0,
    starts_at DATE NULL,
    ends_at DATE NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'Active'
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS payment_integrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    provider VARCHAR(120) NOT NULL UNIQUE,
    mode VARCHAR(40) NOT NULL DEFAULT 'Test',
    status VARCHAR(40) NOT NULL DEFAULT 'Not Connected',
    config_summary VARCHAR(255) NULL,
    last_checked_at DATETIME NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS admin_notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(80) NOT NULL,
    title VARCHAR(160) NOT NULL,
    message VARCHAR(255) NOT NULL,
    link VARCHAR(160) NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_admin_notifications_read_created (is_read, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS removal_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    requester_admin_id INT NULL,
    requester_name VARCHAR(160) NULL,
    requester_email VARCHAR(190) NULL,
    request_method VARCHAR(16) NOT NULL,
    request_path VARCHAR(255) NOT NULL,
    request_body JSON NULL,
    target_label VARCHAR(255) NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'Pending',
    reviewer_admin_id INT NULL,
    reviewer_name VARCHAR(160) NULL,
    remarks TEXT NULL,
    reviewed_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_removal_requests_status_created (status, created_at),
    INDEX idx_removal_requests_requester (requester_admin_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS product_reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    order_id INT NOT NULL,
    user_id INT NULL,
    customer_name VARCHAR(160) NULL,
    customer_email VARCHAR(190) NULL,
    customer_phone VARCHAR(40) NULL,
    rating TINYINT NOT NULL,
    review_text TEXT NULL,
    review_images JSON NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'Published',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_product_order_customer_review (product_id, order_id, customer_email, customer_phone),
    INDEX idx_product_reviews_product (product_id),
    CONSTRAINT fk_product_reviews_product
      FOREIGN KEY (product_id)
      REFERENCES products(id)
      ON DELETE CASCADE,
    CONSTRAINT fk_product_reviews_order
      FOREIGN KEY (order_id)
      REFERENCES orders(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS category_tax_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NOT NULL,
    tax_name VARCHAR(120) NOT NULL DEFAULT 'GST',
    tax_rate DECIMAL(5, 2) NOT NULL DEFAULT 0,
    status VARCHAR(40) NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_category_tax_rule (category_id, tax_name),
    CONSTRAINT fk_category_tax_category
      FOREIGN KEY (category_id)
      REFERENCES categories(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS manual_bills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bill_number VARCHAR(80) NOT NULL UNIQUE,
    source_type VARCHAR(40) NOT NULL DEFAULT 'Manual',
    order_id INT NULL,
    customer_id INT NULL,
    customer_name VARCHAR(160) NOT NULL,
    customer_email VARCHAR(190) NULL,
    customer_phone VARCHAR(40) NULL,
    billing_address TEXT NULL,
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    payment_link VARCHAR(255) NULL,
    notes TEXT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'Generated',
    created_by VARCHAR(160) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_manual_bills_source (source_type),
    INDEX idx_manual_bills_order (order_id),
    CONSTRAINT fk_manual_bills_order
      FOREIGN KEY (order_id)
      REFERENCES orders(id)
      ON DELETE SET NULL,
    CONSTRAINT fk_manual_bills_customer
      FOREIGN KEY (customer_id)
      REFERENCES users(id)
      ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS manual_bill_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bill_id INT NOT NULL,
    product_source VARCHAR(40) NOT NULL DEFAULT 'Manual',
    product_id INT NULL,
    warehouse_product_id INT NULL,
    item_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    line_total DECIMAL(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_manual_bill_items_bill (bill_id),
    CONSTRAINT fk_manual_bill_items_bill
      FOREIGN KEY (bill_id)
      REFERENCES manual_bills(id)
      ON DELETE CASCADE,
    CONSTRAINT fk_manual_bill_items_product
      FOREIGN KEY (product_id)
      REFERENCES products(id)
      ON DELETE SET NULL,
    CONSTRAINT fk_manual_bill_items_warehouse_product
      FOREIGN KEY (warehouse_product_id)
      REFERENCES warehouse_products(id)
      ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS bill_delivery_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bill_id INT NOT NULL,
    channel VARCHAR(40) NOT NULL,
    recipient VARCHAR(190) NOT NULL,
    message TEXT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'Prepared',
    created_by VARCHAR(160) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_bill_delivery_logs_bill (bill_id),
    CONSTRAINT fk_bill_delivery_logs_bill
      FOREIGN KEY (bill_id)
      REFERENCES manual_bills(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    company VARCHAR(160) NULL,
    email VARCHAR(190) NULL,
    phone VARCHAR(40) NULL,
    whatsapp VARCHAR(40) NULL,
    address TEXT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'Active',
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_suppliers_status (status),
    INDEX idx_suppliers_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS supplier_products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    supplier_id INT NOT NULL,
    product_source VARCHAR(40) NOT NULL,
    product_id INT NULL,
    warehouse_product_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_supplier_website_product (supplier_id, product_id),
    UNIQUE KEY uq_supplier_warehouse_product (supplier_id, warehouse_product_id),
    INDEX idx_supplier_products_supplier (supplier_id),
    CONSTRAINT fk_supplier_products_supplier
      FOREIGN KEY (supplier_id)
      REFERENCES suppliers(id)
      ON DELETE CASCADE,
    CONSTRAINT fk_supplier_products_product
      FOREIGN KEY (product_id)
      REFERENCES products(id)
      ON DELETE CASCADE,
    CONSTRAINT fk_supplier_products_warehouse_product
      FOREIGN KEY (warehouse_product_id)
      REFERENCES warehouse_products(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS gst_returns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_tax DECIMAL(10, 2) NOT NULL DEFAULT 0,
    status VARCHAR(40) NOT NULL DEFAULT 'Pending',
    paid_at DATETIME NULL,
    updated_by VARCHAR(160) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_gst_return_period (period_start, period_end),
    INDEX idx_gst_returns_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);

await addColumnIfMissing("products", "brand_id", "brand_id INT NULL AFTER category_id");
await addColumnIfMissing("products", "featured", "featured BOOLEAN NOT NULL DEFAULT FALSE AFTER status");
await addColumnIfMissing("users", "profile_image", "profile_image LONGTEXT NULL");
await addColumnIfMissing("products", "gst_inclusive", "gst_inclusive BOOLEAN NOT NULL DEFAULT TRUE AFTER price");
await addColumnIfMissing("order_items", "gst_inclusive", "gst_inclusive BOOLEAN NOT NULL DEFAULT TRUE AFTER line_total");
await addColumnIfMissing("order_items", "gst_rate", "gst_rate DECIMAL(5, 2) NOT NULL DEFAULT 0 AFTER gst_inclusive");
await addColumnIfMissing("order_items", "gst_amount", "gst_amount DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER gst_rate");
await addColumnIfMissing("manual_bill_items", "gst_inclusive", "gst_inclusive BOOLEAN NOT NULL DEFAULT TRUE AFTER line_total");
await addColumnIfMissing("manual_bill_items", "gst_rate", "gst_rate DECIMAL(5, 2) NOT NULL DEFAULT 0 AFTER gst_inclusive");
await addColumnIfMissing("manual_bill_items", "gst_amount", "gst_amount DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER gst_rate");
await db.query("UPDATE products SET gst_inclusive = TRUE WHERE gst_inclusive IS NULL");

await db.query(`
  CREATE TABLE IF NOT EXISTS contact_enquiries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(120) NOT NULL,
    last_name VARCHAR(120) NULL,
    email VARCHAR(190) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'New',
    admin_notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_contact_enquiries_status_created (status, created_at),
    INDEX idx_contact_enquiries_email (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

if (!(await indexExists("products", "idx_products_brand_id"))) {
  await db.query("ALTER TABLE products ADD INDEX idx_products_brand_id (brand_id)");
}

if (!(await constraintExists("products", "fk_products_brand"))) {
  await db.query(`
    ALTER TABLE products
    ADD CONSTRAINT fk_products_brand
      FOREIGN KEY (brand_id)
      REFERENCES brands(id)
      ON DELETE SET NULL
  `);
}

await db.query(`
  CREATE TABLE IF NOT EXISTS variant_options (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS variant_option_values (
    id INT AUTO_INCREMENT PRIMARY KEY,
    option_id INT NOT NULL,
    value VARCHAR(120) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_variant_option_value (option_id, value),
    INDEX idx_variant_option_values_option (option_id),
    CONSTRAINT fk_variant_option_values_option
      FOREIGN KEY (option_id)
      REFERENCES variant_options(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS product_variants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    sku VARCHAR(120) NOT NULL UNIQUE,
    barcode VARCHAR(120) NULL,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    compare_price DECIMAL(10, 2) NULL,
    cost_price DECIMAL(10, 2) NULL,
    stock INT NOT NULL DEFAULT 0,
    weight DECIMAL(10, 3) NULL,
    weight_unit VARCHAR(20) NULL,
    dimensions JSON NULL,
    specifications JSON NULL,
    image LONGTEXT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'Active',
    visibility VARCHAR(40) NOT NULL DEFAULT 'Visible',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_product_variants_product (product_id),
    INDEX idx_product_variants_sku (sku),
    INDEX idx_product_variants_status_visibility (status, visibility),
    CONSTRAINT fk_product_variants_product
      FOREIGN KEY (product_id)
      REFERENCES products(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS variant_attribute_map (
    variant_id INT NOT NULL,
    option_id INT NOT NULL,
    value_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (variant_id, option_id),
    INDEX idx_variant_attribute_option (option_id),
    INDEX idx_variant_attribute_value (value_id),
    CONSTRAINT fk_variant_attribute_variant
      FOREIGN KEY (variant_id)
      REFERENCES product_variants(id)
      ON DELETE CASCADE,
    CONSTRAINT fk_variant_attribute_option
      FOREIGN KEY (option_id)
      REFERENCES variant_options(id)
      ON DELETE CASCADE,
    CONSTRAINT fk_variant_attribute_value
      FOREIGN KEY (value_id)
      REFERENCES variant_option_values(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    slug VARCHAR(180) NOT NULL UNIQUE,
    status VARCHAR(40) NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    INDEX idx_tags_slug (slug),
    INDEX idx_tags_name (name),
    INDEX idx_tags_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS product_tags (
    product_id INT NOT NULL,
    tag_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (product_id, tag_id),
    INDEX idx_product_tags_tag (tag_id),
    CONSTRAINT fk_product_tags_product
      FOREIGN KEY (product_id)
      REFERENCES products(id)
      ON DELETE CASCADE,
    CONSTRAINT fk_product_tags_tag
      FOREIGN KEY (tag_id)
      REFERENCES tags(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS collections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    slug VARCHAR(180) NOT NULL UNIQUE,
    type VARCHAR(40) NOT NULL DEFAULT 'automatic',
    description TEXT NULL,
    banner LONGTEXT NULL,
    conditions_json JSON NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'Active',
    seo_title VARCHAR(190) NULL,
    seo_description TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    INDEX idx_collections_slug (slug),
    INDEX idx_collections_status (status),
    INDEX idx_collections_type (type)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS collection_products (
    collection_id INT NOT NULL,
    product_id INT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (collection_id, product_id),
    INDEX idx_collection_products_product (product_id),
    INDEX idx_collection_products_order (collection_id, pinned, sort_order),
    CONSTRAINT fk_collection_products_collection
      FOREIGN KEY (collection_id)
      REFERENCES collections(id)
      ON DELETE CASCADE,
    CONSTRAINT fk_collection_products_product
      FOREIGN KEY (product_id)
      REFERENCES products(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS menus (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(160) NOT NULL,
    type VARCHAR(40) NOT NULL DEFAULT 'custom',
    reference_id INT NULL,
    url VARCHAR(255) NULL,
    icon LONGTEXT NULL,
    image LONGTEXT NULL,
    parent_id INT NULL,
    mega_menu BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    visibility VARCHAR(40) NOT NULL DEFAULT 'Visible',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    INDEX idx_menus_parent_order (parent_id, sort_order),
    INDEX idx_menus_visibility (visibility),
    INDEX idx_menus_type_reference (type, reference_id),
    CONSTRAINT fk_menus_parent
      FOREIGN KEY (parent_id)
      REFERENCES menus(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS corporate_enquiries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_name VARCHAR(180) NOT NULL,
    contact_name VARCHAR(160) NOT NULL,
    email VARCHAR(190) NOT NULL,
    phone VARCHAR(40) NOT NULL,
    whatsapp VARCHAR(40) NULL,
    enquiry_type VARCHAR(80) NOT NULL DEFAULT 'Corporate Order',
    budget_range VARCHAR(120) NULL,
    timeline VARCHAR(120) NULL,
    products_json JSON NULL,
    message TEXT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'New',
    admin_notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_corporate_enquiries_status (status),
    INDEX idx_corporate_enquiries_created_at (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS bundle_products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    slug VARCHAR(180) NOT NULL UNIQUE,
    description TEXT NULL,
    image LONGTEXT NULL,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    compare_price DECIMAL(10, 2) NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'Active',
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    min_items INT NOT NULL DEFAULT 1,
    max_items INT NOT NULL DEFAULT 15,
    created_by VARCHAR(160) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    INDEX idx_bundle_products_slug (slug),
    INDEX idx_bundle_products_status (status),
    INDEX idx_bundle_products_featured (featured)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS bundle_product_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bundle_id INT NOT NULL,
    product_id INT NOT NULL,
    variant_id INT NULL,
    quantity INT NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_bundle_items_bundle (bundle_id),
    INDEX idx_bundle_items_product (product_id),
    CONSTRAINT fk_bundle_items_bundle
      FOREIGN KEY (bundle_id)
      REFERENCES bundle_products(id)
      ON DELETE CASCADE,
    CONSTRAINT fk_bundle_items_product
      FOREIGN KEY (product_id)
      REFERENCES products(id)
      ON DELETE CASCADE,
    CONSTRAINT fk_bundle_items_variant
      FOREIGN KEY (variant_id)
      REFERENCES product_variants(id)
      ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);

await addColumnIfMissing("product_variants", "weight_unit", "weight_unit VARCHAR(20) NULL AFTER weight");
await addColumnIfMissing("product_variants", "specifications", "specifications JSON NULL AFTER dimensions");

await db.query("ALTER TABLE discounts MODIFY code VARCHAR(80) NULL");
await db.query("ALTER TABLE discounts MODIFY starts_at DATETIME NULL");
await db.query("ALTER TABLE discounts MODIFY ends_at DATETIME NULL");

await addColumnIfMissing("discounts", "name", "name VARCHAR(180) NULL AFTER id");
await addColumnIfMissing("discounts", "description", "description TEXT NULL AFTER name");
await addColumnIfMissing("discounts", "method", "method VARCHAR(40) NOT NULL DEFAULT 'Coupon' AFTER description");
await addColumnIfMissing("discounts", "max_discount_amount", "max_discount_amount DECIMAL(10, 2) NULL AFTER value");
await addColumnIfMissing("discounts", "min_order_value", "min_order_value DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER max_discount_amount");
await addColumnIfMissing("discounts", "max_order_value", "max_order_value DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER min_order_value");
await addColumnIfMissing("discounts", "min_quantity", "min_quantity INT NOT NULL DEFAULT 0 AFTER max_order_value");
await addColumnIfMissing("discounts", "usage_limit", "usage_limit INT NOT NULL DEFAULT 0 AFTER min_quantity");
await addColumnIfMissing("discounts", "usage_limit_per_customer", "usage_limit_per_customer INT NOT NULL DEFAULT 0 AFTER usage_limit");
await addColumnIfMissing("discounts", "usage_count", "usage_count INT NOT NULL DEFAULT 0 AFTER usage_limit_per_customer");
await addColumnIfMissing("discounts", "first_order_only", "first_order_only BOOLEAN NOT NULL DEFAULT FALSE AFTER usage_count");
await addColumnIfMissing("discounts", "is_stackable", "is_stackable BOOLEAN NOT NULL DEFAULT FALSE AFTER first_order_only");
await addColumnIfMissing("discounts", "prevent_combination", "prevent_combination BOOLEAN NOT NULL DEFAULT TRUE AFTER is_stackable");
await addColumnIfMissing("discounts", "applies_to", "applies_to JSON NULL AFTER status");
await addColumnIfMissing("discounts", "customer_eligibility", "customer_eligibility JSON NULL AFTER applies_to");
await addColumnIfMissing("discounts", "config_json", "config_json JSON NULL AFTER customer_eligibility");
await addColumnIfMissing("discounts", "created_by", "created_by VARCHAR(160) NULL AFTER config_json");
await addColumnIfMissing("discounts", "deleted_at", "deleted_at DATETIME NULL AFTER created_by");
await addColumnIfMissing("discounts", "created_at", "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER deleted_at");
await addColumnIfMissing("discounts", "updated_at", "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at");

await addColumnIfMissing("orders", "discount_id", "discount_id INT NULL AFTER tax_amount");
await addColumnIfMissing("orders", "discount_code", "discount_code VARCHAR(80) NULL AFTER discount_id");
await addColumnIfMissing("orders", "discount_amount", "discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER discount_code");
await addColumnIfMissing("order_items", "variant_id", "variant_id INT NULL AFTER product_id");
await addColumnIfMissing("order_items", "variant_sku", "variant_sku VARCHAR(120) NULL AFTER variant_id");
await addColumnIfMissing("order_items", "variant_title", "variant_title VARCHAR(255) NULL AFTER variant_sku");
await addColumnIfMissing("order_items", "variant_options", "variant_options JSON NULL AFTER variant_title");
await addColumnIfMissing("order_items", "item_type", "item_type VARCHAR(40) NOT NULL DEFAULT 'Product' AFTER variant_options");
await addColumnIfMissing("order_items", "bundle_name", "bundle_name VARCHAR(180) NULL AFTER item_type");
await addColumnIfMissing("order_items", "bundle_items", "bundle_items JSON NULL AFTER bundle_name");

if (!(await indexExists("order_items", "idx_order_items_variant_id"))) {
  await db.query("ALTER TABLE order_items ADD INDEX idx_order_items_variant_id (variant_id)");
}

if (!(await constraintExists("order_items", "fk_order_items_variant"))) {
  await db.query(`
    ALTER TABLE order_items
    ADD CONSTRAINT fk_order_items_variant
      FOREIGN KEY (variant_id)
      REFERENCES product_variants(id)
      ON DELETE SET NULL
  `);
}

await db.query(`
  CREATE TABLE IF NOT EXISTS discount_coupon_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    discount_id INT NOT NULL,
    code VARCHAR(80) NOT NULL UNIQUE,
    usage_limit INT NOT NULL DEFAULT 0,
    usage_count INT NOT NULL DEFAULT 0,
    starts_at DATETIME NULL,
    ends_at DATETIME NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_discount_coupon_discount (discount_id),
    INDEX idx_discount_coupon_status (status),
    CONSTRAINT fk_discount_coupon_discount
      FOREIGN KEY (discount_id)
      REFERENCES discounts(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS discount_conditions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    discount_id INT NOT NULL,
    condition_type VARCHAR(80) NOT NULL,
    operator VARCHAR(40) NOT NULL DEFAULT 'equals',
    condition_value JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_discount_conditions_discount (discount_id),
    CONSTRAINT fk_discount_conditions_discount
      FOREIGN KEY (discount_id)
      REFERENCES discounts(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS discount_usage (
    id INT AUTO_INCREMENT PRIMARY KEY,
    discount_id INT NOT NULL,
    coupon_id INT NULL,
    order_id INT NULL,
    user_id INT NULL,
    customer_email VARCHAR(190) NULL,
    customer_phone VARCHAR(40) NULL,
    amount_discounted DECIMAL(10, 2) NOT NULL DEFAULT 0,
    cart_subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_discount_usage_discount (discount_id),
    INDEX idx_discount_usage_coupon (coupon_id),
    INDEX idx_discount_usage_order (order_id),
    INDEX idx_discount_usage_customer (customer_email, customer_phone),
    INDEX idx_discount_usage_used_at (used_at),
    CONSTRAINT fk_discount_usage_discount
      FOREIGN KEY (discount_id)
      REFERENCES discounts(id)
      ON DELETE CASCADE,
    CONSTRAINT fk_discount_usage_coupon
      FOREIGN KEY (coupon_id)
      REFERENCES discount_coupon_codes(id)
      ON DELETE SET NULL,
    CONSTRAINT fk_discount_usage_order
      FOREIGN KEY (order_id)
      REFERENCES orders(id)
      ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS discount_audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    discount_id INT NULL,
    admin_id INT NULL,
    actor VARCHAR(160) NOT NULL DEFAULT 'Admin',
    action VARCHAR(160) NOT NULL,
    detail VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_discount_audit_discount (discount_id),
    INDEX idx_discount_audit_created_at (created_at),
    CONSTRAINT fk_discount_audit_discount
      FOREIGN KEY (discount_id)
      REFERENCES discounts(id)
      ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);

if (!(await indexExists("discounts", "idx_discounts_status_dates"))) {
  await db.query("ALTER TABLE discounts ADD INDEX idx_discounts_status_dates (status, starts_at, ends_at)");
}

if (!(await indexExists("discounts", "idx_discounts_method"))) {
  await db.query("ALTER TABLE discounts ADD INDEX idx_discounts_method (method)");
}

await addColumnIfMissing("product_reviews", "review_images", "review_images JSON NULL");
await addColumnIfMissing("manual_bill_items", "hsn_sac_code", "hsn_sac_code VARCHAR(40) NULL");
await addColumnIfMissing("manual_bill_items", "unit", "unit VARCHAR(30) NOT NULL DEFAULT 'Pcs.'");
await addColumnIfMissing("manual_bill_items", "discount_rate", "discount_rate DECIMAL(5, 2) NOT NULL DEFAULT 0");
await addColumnIfMissing("warehouse_locations", "google_sheet_url", "google_sheet_url TEXT NULL");
await addColumnIfMissing("shipping_rules", "delivery_days", "delivery_days INT NOT NULL DEFAULT 3");
await addColumnIfMissing("warehouse_stock", "warehouse_product_id", "warehouse_product_id INT NULL AFTER product_id");
await addColumnIfMissing("stock_movements", "warehouse_product_id", "warehouse_product_id INT NULL AFTER product_id");
await db.query("ALTER TABLE warehouse_stock MODIFY product_id INT NULL");
await db.query("ALTER TABLE stock_movements MODIFY product_id INT NULL");

if (!(await indexExists("warehouse_stock", "uq_warehouse_product_stock"))) {
  await db.query("ALTER TABLE warehouse_stock ADD UNIQUE KEY uq_warehouse_product_stock (warehouse_product_id, warehouse_id)");
}

if (!(await indexExists("warehouse_stock", "idx_warehouse_stock_warehouse_product"))) {
  await db.query("ALTER TABLE warehouse_stock ADD INDEX idx_warehouse_stock_warehouse_product (warehouse_product_id)");
}

if (!(await indexExists("stock_movements", "idx_stock_movements_warehouse_product"))) {
  await db.query("ALTER TABLE stock_movements ADD INDEX idx_stock_movements_warehouse_product (warehouse_product_id)");
}

if (!(await constraintExists("warehouse_stock", "fk_warehouse_stock_warehouse_product"))) {
  await db.query(`
    ALTER TABLE warehouse_stock
    ADD CONSTRAINT fk_warehouse_stock_warehouse_product
      FOREIGN KEY (warehouse_product_id)
      REFERENCES warehouse_products(id)
      ON DELETE CASCADE
  `);
}

if (!(await constraintExists("stock_movements", "fk_stock_movements_warehouse_product"))) {
  await db.query(`
    ALTER TABLE stock_movements
    ADD CONSTRAINT fk_stock_movements_warehouse_product
      FOREIGN KEY (warehouse_product_id)
      REFERENCES warehouse_products(id)
      ON DELETE CASCADE
  `);
}

const allowDataSeed = dataSeedAuthorized(process.env);
if (allowDataSeed) {
  await seedAdminModuleData(db);
  console.log("Local data seed completed because ALLOW_DATA_SEED=yes.");
} else {
  console.log(dataSeedRefusalReason(process.env));
}
progress("remaining-modules");


await db.query(`
  CREATE TABLE IF NOT EXISTS drive_folders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parent_id INT NULL,
    name VARCHAR(190) NOT NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    INDEX idx_drive_folders_parent (parent_id),
    INDEX idx_drive_folders_deleted (deleted_at),
    CONSTRAINT fk_drive_folders_parent
      FOREIGN KEY (parent_id)
      REFERENCES drive_folders(id)
      ON DELETE SET NULL,
    CONSTRAINT fk_drive_folders_created_by
      FOREIGN KEY (created_by)
      REFERENCES admins(id)
      ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS drive_files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    folder_id INT NULL,
    name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NULL,
    storage_key VARCHAR(500) NOT NULL,
    public_url LONGTEXT NULL,
    mime_type VARCHAR(190) NULL,
    size BIGINT NOT NULL DEFAULT 0,
    uploaded_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    INDEX idx_drive_files_folder (folder_id),
    INDEX idx_drive_files_name (name),
    INDEX idx_drive_files_mime (mime_type),
    INDEX idx_drive_files_deleted (deleted_at),
    CONSTRAINT fk_drive_files_folder
      FOREIGN KEY (folder_id)
      REFERENCES drive_folders(id)
      ON DELETE SET NULL,
    CONSTRAINT fk_drive_files_uploaded_by
      FOREIGN KEY (uploaded_by)
      REFERENCES admins(id)
      ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);


progress("expansion");
await ensureExpansionSchema({
  db,
  addColumnIfMissing,
  indexExists,
  constraintExists,
  allowDataWrites: allowDataSeed,
});

progress("seo");
await ensureSeoSchema(db, { allowDataWrites: allowDataSeed });
progress("audit");
const { ensureAdminAuditSchema } = await import("./admin-audit-schema.js");
await ensureAdminAuditSchema((sql, params = []) => promiseQueryRows(db, sql, params));

console.log(`Admin module schema is ready in database '${dbName}'.`);
console.log(`schema_init_ms=${Date.now() - startedAt}`);
} finally {
  clearTimeout(timer);
  if (db) await db.end().catch((error) => console.error(`schema_init_close_failed=${error.message}`));
  if (root) await root.end().catch((error) => console.error(`schema_init_close_failed=${error.message}`));
  console.log(`schema_init_phase=closed elapsed_ms=${Date.now() - startedAt}`);
}
console.log("schema_init_exit=0");
