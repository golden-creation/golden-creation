import "dotenv/config";
import mysql from "mysql2/promise";

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "lekhanmart",
  port: Number(process.env.DB_PORT) || 3306,
});

try {
  await connection.query(`
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
    )
  `);

  await connection.query(`
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
    )
  `);

  console.log("Orders schema is ready.");
} finally {
  await connection.end();
}
