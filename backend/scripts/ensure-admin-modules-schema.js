import "dotenv/config";
import bcrypt from "bcrypt";
import mysql from "mysql2/promise";
import { ensureExpansionSchema } from "./ensure-expansion-schema.js";
import { ensureSeoSchema } from "./ensure-seo-schema.js";

const dbName = process.env.DB_NAME || "lekhanmart";

const baseConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  port: Number(process.env.DB_PORT) || 3306,
  multipleStatements: true,
};

const root = await mysql.createConnection(baseConfig);
await root.query(
  `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
);
await root.end();

const db = await mysql.createConnection({
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

const seedDemoData = ["1", "true", "yes"].includes(
  String(process.env.SEED_DEMO_DATA || "").trim().toLowerCase()
);

if (seedDemoData) {
const categories = ["Pens", "Notebooks", "Pencils", "Office Tools"];
for (const name of categories) {
  await db.query("INSERT IGNORE INTO categories (name) VALUES (?)", [name]);
}

const [categoryRows] = await db.query("SELECT id, name FROM categories");
const categoryId = (name) =>
  categoryRows.find((row) => row.name === name)?.id || categoryRows[0]?.id || 1;

const products = [
  ["LM-PEN-001", "Classic Ball Pen", "Smooth everyday writing pen.", 25, "pen.jpg", categoryId("Pens"), 220, 40],
  ["LM-PEN-002", "Premium Gel Pen", "Comfortable gel pen for clean notes.", 45, "pen1.jpg", categoryId("Pens"), 95, 30],
  ["LM-NB-001", "A5 Notebook", "Ruled notebook for school and office use.", 120, "notebook.jpg", categoryId("Notebooks"), 65, 20],
  ["LM-PCL-001", "HB Pencil Pack", "Reliable pencils for writing and sketching.", 60, "pencil.jpg", categoryId("Pencils"), 140, 50],
  ["LM-OFC-001", "Desk Stapler", "Compact stapler for office documents.", 180, "stapler.jpg", categoryId("Office Tools"), 18, 25],
];

for (const product of products) {
  await db.query(
    `
      INSERT INTO products
        (sku, name, description, price, image, category_id, stock_quantity, reorder_level)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = ?)
    `,
    [...product, product[1]]
  );
}

const brandSeeds = [
  ["Golden Creation", "golden-creation", "Lekhanmart house brand for everyday stationery.", true, "https://www.lekhanmart.in"],
  ["Parker", "parker", "Premium pens and writing instruments.", true, "https://www.parkerpen.com"],
  ["Reynolds", "reynolds", "Reliable pens for school, office, and daily writing.", false, "https://www.reynolds-pens.com"],
  ["Classmate", "classmate", "Student notebooks and school stationery.", false, "https://www.classmateshop.com"],
];

for (const [name, slug, description, featured, websiteUrl] of brandSeeds) {
  await db.query(
    `
      INSERT INTO brands (name, slug, description, featured, status, website_url, meta_title, meta_description)
      VALUES (?, ?, ?, ?, 'Active', ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        description = VALUES(description),
        featured = VALUES(featured),
        status = 'Active',
        website_url = VALUES(website_url),
        meta_title = VALUES(meta_title),
        meta_description = VALUES(meta_description),
        deleted_at = NULL
    `,
    [name, slug, description, featured, websiteUrl, `${name} stationery`, description]
  );
}

const [brandRows] = await db.query("SELECT id, slug FROM brands");
const brandId = (slug) => brandRows.find((row) => row.slug === slug)?.id || null;

await db.query("UPDATE products SET brand_id = ? WHERE name LIKE '%Pen%' AND brand_id IS NULL", [brandId("parker")]);
await db.query("UPDATE products SET brand_id = ? WHERE name LIKE '%Notebook%' AND brand_id IS NULL", [brandId("classmate")]);
await db.query("UPDATE products SET brand_id = ? WHERE brand_id IS NULL", [brandId("golden-creation")]);

const variantSeedOptions = {
  Color: ["Blue", "Black", "Red"],
  Size: ["Single", "Pack of 5"],
  Material: ["Plastic", "Paper"],
};

for (const [optionName, values] of Object.entries(variantSeedOptions)) {
  await db.query(
    `
      INSERT INTO variant_options (name)
      VALUES (?)
      ON DUPLICATE KEY UPDATE name = VALUES(name)
    `,
    [optionName]
  );

  const [[optionRow]] = await db.query("SELECT id FROM variant_options WHERE name = ? LIMIT 1", [optionName]);
  for (const value of values) {
    await db.query(
      `
        INSERT INTO variant_option_values (option_id, value)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE value = VALUES(value)
      `,
      [optionRow.id, value]
    );
  }
}

const [variantOptionRows] = await db.query("SELECT id, name FROM variant_options");
const [variantValueRows] = await db.query(`
  SELECT vov.id, vov.value, vo.name AS option_name
  FROM variant_option_values vov
  JOIN variant_options vo ON vo.id = vov.option_id
`);
const variantOptionId = (name) => variantOptionRows.find((row) => row.name === name)?.id || null;
const variantValueId = (optionName, value) =>
  variantValueRows.find((row) => row.option_name === optionName && row.value === value)?.id || null;

async function seedProductVariant(productName, variant) {
  const [[productRow]] = await db.query("SELECT id, price, stock_quantity, image FROM products WHERE name = ? LIMIT 1", [productName]);
  if (!productRow) return;

  await db.query(
    `
      INSERT INTO product_variants
        (product_id, sku, barcode, price, compare_price, cost_price, stock, weight, image, status, visibility, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', 'Visible', ?)
      ON DUPLICATE KEY UPDATE
        price = VALUES(price),
        compare_price = VALUES(compare_price),
        stock = VALUES(stock),
        image = VALUES(image),
        status = 'Active',
        visibility = 'Visible',
        is_default = VALUES(is_default)
    `,
    [
      productRow.id,
      variant.sku,
      variant.barcode || null,
      variant.price ?? productRow.price,
      variant.comparePrice || null,
      variant.costPrice || null,
      variant.stock ?? productRow.stock_quantity,
      variant.weight || null,
      variant.image || productRow.image,
      Boolean(variant.isDefault),
    ]
  );

  const [[variantRow]] = await db.query("SELECT id FROM product_variants WHERE sku = ? LIMIT 1", [variant.sku]);
  if (!variantRow) return;

  for (const option of variant.options || []) {
    const optionId = variantOptionId(option.name);
    const valueId = variantValueId(option.name, option.value);
    if (!optionId || !valueId) continue;

    await db.query(
      `
        INSERT INTO variant_attribute_map (variant_id, option_id, value_id)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE value_id = VALUES(value_id)
      `,
      [variantRow.id, optionId, valueId]
    );
  }
}

await seedProductVariant("Classic Ball Pen", {
  sku: "LM-PEN-001-BLUE",
  price: 25,
  stock: 120,
  image: "pen.jpg",
  isDefault: true,
  options: [{ name: "Color", value: "Blue" }, { name: "Size", value: "Single" }],
});
await seedProductVariant("Classic Ball Pen", {
  sku: "LM-PEN-001-BLACK",
  price: 25,
  stock: 100,
  image: "pen.jpg",
  options: [{ name: "Color", value: "Black" }, { name: "Size", value: "Single" }],
});
await seedProductVariant("Premium Gel Pen", {
  sku: "LM-PEN-002-BLUE",
  price: 45,
  comparePrice: 55,
  stock: 55,
  image: "pen1.jpg",
  isDefault: true,
  options: [{ name: "Color", value: "Blue" }, { name: "Size", value: "Single" }],
});
await seedProductVariant("Premium Gel Pen", {
  sku: "LM-PEN-002-RED",
  price: 45,
  comparePrice: 55,
  stock: 40,
  image: "pen1.jpg",
  options: [{ name: "Color", value: "Red" }, { name: "Size", value: "Single" }],
});
await seedProductVariant("A5 Notebook", {
  sku: "LM-NB-001-SINGLE",
  price: 120,
  stock: 65,
  image: "notebook.jpg",
  isDefault: true,
  options: [{ name: "Size", value: "Single" }, { name: "Material", value: "Paper" }],
});

const tagSeeds = [
  ["Trending", "trending"],
  ["Premium", "premium"],
  ["Gift Item", "gift-item"],
  ["School Stationery", "school-stationery"],
  ["Office Essentials", "office-essentials"],
];

for (const [name, slug] of tagSeeds) {
  await db.query(
    `
      INSERT INTO tags (name, slug, status)
      VALUES (?, ?, 'Active')
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        status = 'Active',
        deleted_at = NULL
    `,
    [name, slug]
  );
}

const [tagRows] = await db.query("SELECT id, slug FROM tags");
const tagId = (slug) => tagRows.find((row) => row.slug === slug)?.id || null;
const [seedProducts] = await db.query(`
  SELECT p.id, p.name, c.name AS category_name
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
`);

for (const product of seedProducts) {
  const assignments = new Set(["trending"]);
  const name = String(product.name || "").toLowerCase();
  const category = String(product.category_name || "").toLowerCase();

  if (name.includes("premium") || category.includes("pen")) assignments.add("premium");
  if (category.includes("notebook") || category.includes("pencil")) assignments.add("school-stationery");
  if (category.includes("office") || name.includes("stapler")) assignments.add("office-essentials");
  if (name.includes("gift")) assignments.add("gift-item");

  for (const slug of assignments) {
    const id = tagId(slug);
    if (id) {
      await db.query("INSERT IGNORE INTO product_tags (product_id, tag_id) VALUES (?, ?)", [product.id, id]);
    }
  }
}

await db.query("UPDATE products SET featured = TRUE WHERE name LIKE '%Premium%' OR name LIKE '%Classic%'");

await db.query(
  `
    INSERT INTO collections
      (name, slug, type, description, conditions_json, status, seo_title, seo_description)
    VALUES
      (
        'Trending Items',
        'trending-items',
        'automatic',
        'A live collection powered by the trending product tag.',
        JSON_OBJECT('match', 'all', 'tags', JSON_ARRAY('trending')),
        'Active',
        'Trending Items | Lekhanmart',
        'Shop trending stationery and office essentials from Lekhanmart.'
      ),
      (
        'Premium Pens',
        'premium-pens',
        'automatic',
        'Premium writing instruments grouped by tags and category.',
        JSON_OBJECT('match', 'all', 'tags', JSON_ARRAY('premium'), 'categories', JSON_ARRAY('Pens')),
        'Active',
        'Premium Pens | Lekhanmart',
        'Browse premium pens and writing supplies at Lekhanmart.'
      ),
      (
        'Office Essentials',
        'office-essentials',
        'automatic',
        'Curated office supplies based on product category and tag rules.',
        JSON_OBJECT('match', 'any', 'tags', JSON_ARRAY('office-essentials'), 'categories', JSON_ARRAY('Office Tools')),
        'Active',
        'Office Essentials | Lekhanmart',
        'Find office stationery essentials for daily work.'
      )
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      type = VALUES(type),
      description = VALUES(description),
      conditions_json = VALUES(conditions_json),
      status = 'Active',
      deleted_at = NULL,
      seo_title = VALUES(seo_title),
      seo_description = VALUES(seo_description)
  `
);

await db.query(
  `
    INSERT INTO collections
      (name, slug, type, description, conditions_json, status, seo_title, seo_description)
    SELECT
      'Starter Picks',
      'starter-picks',
      'manual',
      'A manually ordered set of starter products for homepage merchandising.',
      JSON_OBJECT(),
      'Active',
      'Starter Picks | Lekhanmart',
      'Browse Lekhanmart starter product picks.'
    WHERE NOT EXISTS (SELECT 1 FROM collections WHERE slug = 'starter-picks')
  `
);

const [starterCollectionRows] = await db.query("SELECT id FROM collections WHERE slug = 'starter-picks' LIMIT 1");
if (starterCollectionRows.length) {
  for (const [index, product] of seedProducts.slice(0, 4).entries()) {
    await db.query(
      `
        INSERT IGNORE INTO collection_products (collection_id, product_id, sort_order, pinned)
        VALUES (?, ?, ?, ?)
      `,
      [starterCollectionRows[0].id, product.id, index + 1, index === 0]
    );
  }
}

await db.query(
  `
    INSERT INTO bundle_products
      (name, slug, description, price, compare_price, status, featured, min_items, max_items, created_by)
    SELECT
      'Office Starter Bundle',
      'office-starter-bundle',
      'A ready bundle of daily office writing and desk essentials.',
      COALESCE(SUM(p.price), 0),
      COALESCE(SUM(p.price), 0) + 99,
      'Active',
      TRUE,
      1,
      15,
      'System'
    FROM (SELECT price FROM products ORDER BY id LIMIT 4) p
    ON DUPLICATE KEY UPDATE
      description = VALUES(description),
      status = 'Active',
      featured = TRUE,
      deleted_at = NULL
  `
);

const [[starterBundleRow]] = await db.query("SELECT id FROM bundle_products WHERE slug = 'office-starter-bundle' LIMIT 1");
if (starterBundleRow) {
  for (const [index, product] of seedProducts.slice(0, 4).entries()) {
    await db.query(
      `
        INSERT IGNORE INTO bundle_product_items
          (bundle_id, product_id, quantity, sort_order)
        VALUES (?, ?, 1, ?)
      `,
      [starterBundleRow.id, product.id, index + 1]
    );
  }
}
}

const [collectionRowsForMenus] = await db.query("SELECT id, slug FROM collections");
const collectionId = (slug) => collectionRowsForMenus.find((row) => row.slug === slug)?.id || null;

async function upsertMenuSeed({
  title,
  type,
  referenceId = null,
  url = null,
  parentId = null,
  megaMenu = false,
  sortOrder = 0,
  visibility = "Visible",
}) {
  const [existing] = await db.query(
    `
      SELECT id
      FROM menus
      WHERE title = ?
        AND COALESCE(parent_id, 0) = COALESCE(?, 0)
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [title, parentId]
  );

  if (existing.length) {
    await db.query(
      `
        UPDATE menus
        SET type = ?, reference_id = ?, url = ?, parent_id = ?, mega_menu = ?,
            sort_order = ?, visibility = ?
        WHERE id = ?
      `,
      [type, referenceId, url, parentId, megaMenu, sortOrder, visibility, existing[0].id]
    );
    return existing[0].id;
  }

  const [result] = await db.query(
    `
      INSERT INTO menus
        (title, type, reference_id, url, parent_id, mega_menu, sort_order, visibility)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [title, type, referenceId, url, parentId, megaMenu, sortOrder, visibility]
  );

  return result.insertId;
}

await upsertMenuSeed({
  title: "Art & Craft",
  type: "custom",
  url: "/writing-essentials?q=Art%20%26%20Craft",
  sortOrder: 10,
});
await upsertMenuSeed({
  title: "Computer & Electronics Accessories",
  type: "custom",
  url: "/writing-essentials?q=Computer%20%26%20Electronics%20Accessories",
  sortOrder: 20,
});
await upsertMenuSeed({
  title: "Office Stationery",
  type: "collection",
  referenceId: collectionId("office-essentials"),
  url: "/collections/office-essentials",
  sortOrder: 30,
});
await upsertMenuSeed({
  title: "Premium Pens",
  type: "collection",
  referenceId: collectionId("premium-pens"),
  url: "/collections/premium-pens",
  sortOrder: 40,
});
await upsertMenuSeed({
  title: "School Stationery",
  type: "custom",
  url: "/writing-essentials?q=School%20Stationery",
  sortOrder: 50,
});
await upsertMenuSeed({
  title: "Trending Items",
  type: "collection",
  referenceId: collectionId("trending-items"),
  url: "/collections/trending-items",
  sortOrder: 60,
});
await upsertMenuSeed({
  title: "All Products",
  type: "page",
  url: "/writing-essentials",
  sortOrder: 70,
});
await upsertMenuSeed({
  title: "Shop Bundles",
  type: "page",
  url: "/bundles",
  sortOrder: 75,
});
await upsertMenuSeed({
  title: "Corporate Orders",
  type: "page",
  url: "/corporate-orders",
  sortOrder: 78,
});
const shopByBrandMenuId = await upsertMenuSeed({
  title: "Shop By Brand",
  type: "page",
  url: "/brands",
  megaMenu: true,
  sortOrder: 80,
});

const [brandRowsForMenus] = await db.query(`
  SELECT id, slug, name
  FROM brands
  WHERE deleted_at IS NULL
    AND status = 'Active'
  ORDER BY name ASC
`);

for (const [index, brand] of brandRowsForMenus.entries()) {
  await upsertMenuSeed({
    title: brand.name,
    type: "brand",
    referenceId: brand.id,
    url: `/brand/${brand.slug}`,
    parentId: shopByBrandMenuId,
    sortOrder: index + 1,
  });
}

const allPermissionKeys = [
  "dashboard",
  "products",
  "categories",
  "brands",
  "tags",
  "collections",
  "menus",
  "bundles",
  "orders",
  "returns",
  "billing",
  "customers",
  "corporate_enquiries",
  "contact_enquiries",
  "newsletter",
  "shipping",
  "payments",
  "discounts",
  "blog",
  "inventory",
  "warehouse",
  "store",
  "tasks",
  "hr",
  "suppliers",
  "reports",
  "leads",
  "sales_catalogs",
  "drive",
  "media",
  "profile",
  "users",
  "roles",
];

function normalizePermissionSeed(permissions) {
  const expanded = new Set(permissions);

  if (expanded.has("products")) {
    expanded.add("categories");
    expanded.add("bundles");
    expanded.add("media");
  }
  if (expanded.has("customers")) {
    expanded.add("contact_enquiries");
    expanded.add("corporate_enquiries");
    expanded.add("newsletter");
  }
  if (expanded.has("orders")) {
    expanded.add("returns");
    expanded.add("billing");
  }
  if (expanded.has("users")) {
    expanded.add("hr");
  }
  if (expanded.has("blog") || expanded.has("brands") || expanded.has("collections") || expanded.has("menus") || expanded.has("bundles")) {
    expanded.add("media");
  }

  return allPermissionKeys.filter((key) => expanded.has(key));
}

const roleSeeds = [
  ["Super Admin", "Full system access", allPermissionKeys],
  ["Technical Developer", "Full platform access for technical maintenance; deletable by Super Admin", allPermissionKeys],
  ["Store Manager", "Manages store catalog and orders", normalizePermissionSeed(["dashboard", "products", "brands", "tags", "collections", "menus", "orders", "discounts", "customers", "reports", "blog"])],
  ["Warehouse Manager", "Manages stock and warehouse approvals", normalizePermissionSeed(["dashboard", "inventory", "warehouse", "shipping", "reports", "suppliers"])],
  ["Billing Executive", "Handles invoices and payment reconciliation", normalizePermissionSeed(["dashboard", "orders", "payments", "reports", "customers"])],
  ["Salesman", "Manages owned sales leads and shareable product catalogs", normalizePermissionSeed(["dashboard", "leads", "sales_catalogs", "tasks", "profile"])],
  ["Ads Executive", "Runs Google, Meta, and campaign tracking workflows", normalizePermissionSeed(["dashboard", "seo_marketing", "reports", "leads", "contact_enquiries", "corporate_enquiries"])],
];

for (const [name, description, permissions] of roleSeeds) {
  await db.query(
    `
      INSERT INTO roles (name, description, permissions)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        description = VALUES(description),
        permissions = VALUES(permissions),
        status = 'Active'
    `,
    [name, description, JSON.stringify(permissions)]
  );
}

const passwordHash = await bcrypt.hash("Admin@123", 10);
await db.query(
  `
    INSERT INTO admins (name, email, password, role, phone, status, permissions)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      role = VALUES(role),
      status = VALUES(status),
      permissions = VALUES(permissions)
  `,
  [
    "Local Admin",
    "admin@goldencreation.in",
    passwordHash,
    "Admin",
    "+91 9876543210",
    "Active",
    JSON.stringify(roleSeeds[1][2]),
  ]
);

await db.query(
  "UPDATE admins SET role = 'Super Admin' WHERE LOWER(TRIM(email)) = 'goldencreation@lekhanmart.in'"
);

await db.query(
  `
    UPDATE admins
    SET role = 'Admin'
    WHERE LOWER(TRIM(role)) = 'super admin'
      AND LOWER(TRIM(email)) <> 'goldencreation@lekhanmart.in'
  `
);

function parseStoredPermissions(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function normalizeStoredPermissionRows(table) {
  const [rows] = await db.query(`SELECT id, permissions FROM ${table}`);

  for (const row of rows) {
    const normalized = normalizePermissionSeed(parseStoredPermissions(row.permissions));
    await db.query(`UPDATE ${table} SET permissions = ? WHERE id = ?`, [
      JSON.stringify(normalized),
      row.id,
    ]);
  }
}

await normalizeStoredPermissionRows("roles");
await normalizeStoredPermissionRows("admins");

await db.query(
  "UPDATE roles SET permissions = ? WHERE LOWER(TRIM(name)) = 'super admin'",
  [JSON.stringify(allPermissionKeys)]
);
await db.query(
  "UPDATE admins SET permissions = ? WHERE LOWER(TRIM(email)) = 'goldencreation@lekhanmart.in'",
  [JSON.stringify(allPermissionKeys)]
);

await db.query(`
  INSERT INTO warehouse_locations (code, name, location, capacity_units, status, google_sheet_id, last_synced_at)
  VALUES
    ('WH-GGN', 'Gurugram Warehouse', 'Gurugram', 10000, 'Operational', 'sheet_gurugram_stock', NOW())
  ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    location = VALUES(location),
    capacity_units = VALUES(capacity_units),
    status = VALUES(status),
    google_sheet_id = VALUES(google_sheet_id),
    last_synced_at = VALUES(last_synced_at);
`);
await db.query("DELETE FROM warehouse_locations WHERE code <> 'WH-GGN'");

const [warehouseRows] = await db.query("SELECT id, code FROM warehouse_locations ORDER BY id");
const [productRows] = await db.query("SELECT id, sku, stock_quantity, reorder_level FROM products ORDER BY id LIMIT 8");

await db.query(
  `
    INSERT INTO warehouse_products
      (sku, name, description, category, unit, purchase_price, mrp, status, created_by)
    VALUES
      ('WH-PACK-001', 'Packaging Tape Roll', 'Warehouse packing material, not listed on website.', 'Packing Material', 'roll', 35, 0, 'Active', 'System')
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      description = VALUES(description),
      category = VALUES(category),
      unit = VALUES(unit),
      purchase_price = VALUES(purchase_price),
      status = VALUES(status)
  `
);

const [warehouseOnlyProductRows] = await db.query("SELECT id, sku FROM warehouse_products ORDER BY id LIMIT 8");

for (const product of productRows) {
  for (const [index, warehouse] of warehouseRows.entries()) {
    const stock = Math.max(0, Number(product.stock_quantity || 0) - index * 12);
    await db.query(
      `
        INSERT INTO warehouse_stock
          (product_id, warehouse_id, sku, google_sheet_row_id, stock_on_hand, reserved_stock, reorder_level, approval_status, last_synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Approved', NOW())
        ON DUPLICATE KEY UPDATE
          sku = VALUES(sku),
          stock_on_hand = VALUES(stock_on_hand),
          reserved_stock = VALUES(reserved_stock),
          reorder_level = VALUES(reorder_level),
          last_synced_at = VALUES(last_synced_at)
      `,
      [
        product.id,
        warehouse.id,
        product.sku || `LM-${product.id}`,
        `${warehouse.code}-${product.id}`,
        stock,
        index * 3,
        product.reorder_level || 0,
      ]
    );
  }
}

for (const product of warehouseOnlyProductRows) {
  for (const warehouse of warehouseRows) {
    await db.query(
      `
        INSERT INTO warehouse_stock
          (product_id, warehouse_product_id, warehouse_id, sku, google_sheet_row_id, stock_on_hand, reserved_stock, reorder_level, approval_status, last_synced_at)
        VALUES (NULL, ?, ?, ?, ?, 0, 0, 10, 'Approved', NOW())
        ON DUPLICATE KEY UPDATE
          sku = VALUES(sku),
          reorder_level = VALUES(reorder_level),
          last_synced_at = VALUES(last_synced_at)
      `,
      [
        product.id,
        warehouse.id,
        product.sku || `WH-${product.id}`,
        `${warehouse.code}-WP-${product.id}`,
      ]
    );
  }
}

if (productRows.length && warehouseRows.length) {
  await db.query(
    `
      INSERT INTO stock_movements
        (product_id, warehouse_id, movement_type, quantity, reference, status, requested_by)
      SELECT ?, ?, 'Inward', 75, 'PO-LOCAL-001', 'Pending', 'Warehouse Manager'
      WHERE NOT EXISTS (SELECT 1 FROM stock_movements WHERE reference = 'PO-LOCAL-001')
    `,
    [productRows[0].id, warehouseRows[0].id]
  );

  await db.query(
    `
      INSERT INTO stock_movements
        (product_id, warehouse_id, movement_type, quantity, reference, status, requested_by, approved_by, approved_at)
      SELECT ?, ?, 'Outward', 22, 'SO-LOCAL-014', 'Approved', 'Store Manager', 'Local Admin', NOW()
      WHERE NOT EXISTS (SELECT 1 FROM stock_movements WHERE reference = 'SO-LOCAL-014')
    `,
    [productRows[1]?.id || productRows[0].id, warehouseRows[1]?.id || warehouseRows[0].id]
  );
}

await db.query(
  `
    INSERT INTO suppliers
      (name, company, email, phone, whatsapp, address, status, notes)
    SELECT
      'Stationery Supply Desk', 'Stationery Supply Desk Pvt Ltd', 'supply@example.com', '+919876543210', '+919876543210', 'Gurugram', 'Active', 'Local seed supplier for warehouse and website stock'
    WHERE NOT EXISTS (
      SELECT 1 FROM suppliers WHERE email = 'supply@example.com'
    )
  `
);

const [supplierRows] = await db.query("SELECT id FROM suppliers ORDER BY id LIMIT 1");
if (supplierRows.length) {
  if (productRows[0]) {
    await db.query(
      `
        INSERT IGNORE INTO supplier_products
          (supplier_id, product_source, product_id, warehouse_product_id)
        VALUES (?, 'Website', ?, NULL)
      `,
      [supplierRows[0].id, productRows[0].id]
    );
  }

  if (warehouseOnlyProductRows[0]) {
    await db.query(
      `
        INSERT IGNORE INTO supplier_products
          (supplier_id, product_source, product_id, warehouse_product_id)
        VALUES (?, 'Warehouse', NULL, ?)
      `,
      [supplierRows[0].id, warehouseOnlyProductRows[0].id]
    );
  }
}

const storeSettings = [
  ["store_name", "Lekhanmart", "Store"],
  ["support_email", "goldencreation@lekhanmart.in", "Store"],
  ["default_tax_rate", "18", "Tax"],
  ["gst_number", "LOCAL-GST-0001", "Tax"],
  ["free_shipping_threshold", "999", "Shipping"],
  ["default_currency", "INR", "Payment"],
];

for (const setting of storeSettings) {
  await db.query(
    `
      INSERT INTO store_settings (setting_key, setting_value, category)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        setting_value = VALUES(setting_value),
        category = VALUES(category)
    `,
    setting
  );
}

await db.query("DELETE FROM shipping_rules WHERE name IN ('Standard Shipping', 'Free Shipping', 'Standard Local Delivery', 'Express Dispatch')");
await db.query(`
  INSERT INTO shipping_rules (name, region, min_order_value, charge, delivery_days, eta, status)
  VALUES
    ('Standard Shipping', 'All India', 0, 59, 3, '3 days', 'Active'),
    ('Free Shipping', 'All India', 999, 0, 5, '5 days', 'Active')
  ;

  DELETE dcc
  FROM discount_coupon_codes dcc
  JOIN discounts d ON d.id = dcc.discount_id
  WHERE d.created_by = 'System'
    AND (
      d.code IN ('WELCOME10', 'BULK500')
      OR d.name = 'Automatic Free Shipping Above Rs. 999'
    );

  DELETE FROM discounts
  WHERE created_by = 'System'
    AND (
      code IN ('WELCOME10', 'BULK500')
      OR name = 'Automatic Free Shipping Above Rs. 999'
    );

  INSERT INTO payment_integrations (provider, mode, status, config_summary, last_checked_at)
  VALUES
    ('Cash on Delivery', 'Live', 'Connected', 'Default offline payment method', NOW()),
    ('Razorpay', 'Test', 'Not Connected', 'Awaiting key_id and key_secret', NOW()),
    ('UPI Collect', 'Test', 'Pending', 'UPI VPA verification pending', NOW())
  ON DUPLICATE KEY UPDATE
    mode = VALUES(mode),
    status = VALUES(status),
    config_summary = VALUES(config_summary),
    last_checked_at = VALUES(last_checked_at);
`);

const [categoryRowsForTaxRules] = await db.query("SELECT id FROM categories");

for (const category of categoryRowsForTaxRules) {
  await db.query(
    `
      INSERT INTO category_tax_rules (category_id, tax_name, tax_rate, status)
      VALUES (?, 'GST', 8, 'Active')
      ON DUPLICATE KEY UPDATE
        tax_rate = tax_rate,
        status = status
    `,
    [category.id]
  );
}

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

await db.query(
  `
    INSERT INTO admin_activity (actor, action, module, detail)
    SELECT 'System', 'Seeded local admin modules', 'Setup', 'Schema, warehouse, RBAC, store, shipping and payments ready'
    WHERE NOT EXISTS (
      SELECT 1 FROM admin_activity
      WHERE action = 'Seeded local admin modules'
    )
  `
);

await ensureExpansionSchema({
  db,
  addColumnIfMissing,
  indexExists,
  constraintExists,
});

await ensureSeoSchema(db);
await db.end();

console.log(`Admin module schema is ready in database '${dbName}'.`);
