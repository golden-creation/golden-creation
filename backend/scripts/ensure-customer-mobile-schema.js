import "dotenv/config";
import mysql from "mysql2/promise";
import { refuseProductionSchemaTarget } from "./setup-safety.js";

refuseProductionSchemaTarget();

const dbName = process.env.DB_NAME || "lekhanmart";
const db = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: dbName,
  port: Number(process.env.DB_PORT) || 3306,
  multipleStatements: true,
});

await db.query(`
  CREATE TABLE IF NOT EXISTS customer_sessions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    refresh_token_hash CHAR(64) NOT NULL UNIQUE,
    device_name VARCHAR(160) NULL,
    device_id VARCHAR(190) NULL,
    ip_address VARCHAR(64) NULL,
    user_agent VARCHAR(500) NULL,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    last_used_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_customer_sessions_user (user_id, revoked_at, expires_at),
    CONSTRAINT fk_customer_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS customer_cart_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    cart_key VARCHAR(220) NOT NULL,
    item_type VARCHAR(30) NOT NULL DEFAULT 'Product',
    product_id INT NULL,
    variant_id INT NULL,
    bundle_id INT NULL,
    bundle_type VARCHAR(40) NULL,
    bundle_name VARCHAR(255) NULL,
    bundle_items JSON NULL,
    name VARCHAR(255) NOT NULL,
    image LONGTEXT NULL,
    category VARCHAR(190) NULL,
    price DECIMAL(12,2) NOT NULL DEFAULT 0,
    old_price DECIMAL(12,2) NOT NULL DEFAULT 0,
    quantity INT NOT NULL DEFAULT 1,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_customer_cart_key (user_id, cart_key),
    INDEX idx_customer_cart_product (product_id),
    CONSTRAINT fk_customer_cart_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS customer_wishlist_items (
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, product_id),
    CONSTRAINT fk_customer_wishlist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_wishlist_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS customer_addresses (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(160) NOT NULL,
    tag VARCHAR(40) NOT NULL DEFAULT 'HOME',
    line1 VARCHAR(255) NOT NULL,
    line2 VARCHAR(255) NULL,
    city VARCHAR(120) NULL,
    state VARCHAR(120) NULL,
    postal_code VARCHAR(20) NULL,
    phone VARCHAR(40) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_customer_addresses_user (user_id, is_default),
    CONSTRAINT fk_customer_addresses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS content_pages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(120) NOT NULL UNIQUE,
    title VARCHAR(190) NOT NULL,
    body LONGTEXT NOT NULL,
    metadata JSON NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Published',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);

const pages = [
  ["about", "About Golden Creation", "Golden Creation provides thoughtfully selected stationery, writing instruments, office essentials and curated bundles for individuals and businesses."],
  ["faqs", "Frequently Asked Questions", "Find answers about ordering, payments, shipping, returns, products and account management."],
  ["shipping-policy", "Shipping Policy", "Shipping charges and delivery estimates are calculated from the active store rules shown during checkout."],
  ["return-policy", "Return and Replacement Policy", "Eligible delivered orders can be submitted for return or replacement review from your order history."],
  ["privacy-policy", "Privacy Policy", "We use customer information only to operate accounts, orders, support, security and communications in accordance with applicable law."],
  ["terms-and-conditions", "Terms and Conditions", "By using Golden Creation services you agree to the prices, availability, payment, delivery, return and account terms presented during use."],
  ["contact", "Contact Golden Creation", "Contact our support team for product, order, corporate and account assistance."],
];
for (const [slug, title, body] of pages) {
  await db.query(
    `INSERT INTO content_pages (slug, title, body, metadata)
     VALUES (?, ?, ?, '{}')
     ON DUPLICATE KEY UPDATE title=VALUES(title), body=IF(body='', VALUES(body), body)`,
    [slug, title, body]
  );
}

await db.end();
console.log(`Customer mobile schema is ready in database '${dbName}'.`);
