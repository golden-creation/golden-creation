export async function ensureExpansionSchema({
  db,
  addColumnIfMissing,
  indexExists,
  constraintExists,
}) {
  await addColumnIfMissing("products", "deleted_at", "deleted_at DATETIME NULL");
  await addColumnIfMissing("warehouse_products", "category_id", "category_id INT NULL AFTER category");
  await addColumnIfMissing("warehouse_products", "brand_id", "brand_id INT NULL AFTER category_id");
  await addColumnIfMissing("warehouse_products", "barcode", "barcode VARCHAR(120) NULL AFTER sku");
  await addColumnIfMissing("warehouse_products", "reorder_level", "reorder_level INT NOT NULL DEFAULT 0");
  await addColumnIfMissing("warehouse_products", "specifications", "specifications JSON NULL");
  await addColumnIfMissing("warehouse_products", "deleted_at", "deleted_at DATETIME NULL");
  await addColumnIfMissing("supplier_products", "store_product_id", "store_product_id INT NULL");
  await addColumnIfMissing("orders", "tracking_url", "tracking_url VARCHAR(500) NULL");
  await addColumnIfMissing("orders", "logistics_provider", "logistics_provider VARCHAR(160) NULL");
  await addColumnIfMissing("orders", "delivered_at", "delivered_at DATETIME NULL");
  await addColumnIfMissing("orders", "fulfillment_stock_source", "fulfillment_stock_source VARCHAR(30) NULL");
  await addColumnIfMissing("orders", "physical_stock_deducted_at", "physical_stock_deducted_at DATETIME NULL");
  await addColumnIfMissing("admin_notifications", "dedupe_key", "dedupe_key VARCHAR(190) NULL");

  await db.query(`
    CREATE TABLE IF NOT EXISTS store_products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sku VARCHAR(80) NOT NULL UNIQUE,
      barcode VARCHAR(120) NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT NULL,
      category_id INT NULL,
      brand_id INT NULL,
      unit VARCHAR(30) NOT NULL DEFAULT 'pcs',
      purchase_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
      mrp DECIMAL(10, 2) NOT NULL DEFAULT 0,
      reorder_level INT NOT NULL DEFAULT 0,
      specifications JSON NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'Active',
      created_by VARCHAR(160) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      INDEX idx_store_products_name (name),
      INDEX idx_store_products_status (status),
      INDEX idx_store_products_category (category_id),
      INDEX idx_store_products_brand (brand_id),
      CONSTRAINT fk_store_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      CONSTRAINT fk_store_products_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS store_stock (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_product_id INT NOT NULL UNIQUE,
      stock_on_hand INT NOT NULL DEFAULT 0,
      reserved_stock INT NOT NULL DEFAULT 0,
      reorder_level INT NOT NULL DEFAULT 0,
      approval_status VARCHAR(40) NOT NULL DEFAULT 'Approved',
      last_synced_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_store_stock_product (store_product_id),
      CONSTRAINT fk_store_stock_product FOREIGN KEY (store_product_id) REFERENCES store_products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS store_movements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_product_id INT NOT NULL,
      movement_type VARCHAR(40) NOT NULL,
      quantity INT NOT NULL,
      reference VARCHAR(120) NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'Pending',
      requested_by VARCHAR(160) NOT NULL DEFAULT 'System',
      approved_by VARCHAR(160) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      approved_at DATETIME NULL,
      INDEX idx_store_movements_product (store_product_id),
      INDEX idx_store_movements_status (status),
      CONSTRAINT fk_store_movements_product FOREIGN KEY (store_product_id) REFERENCES store_products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS supplier_brands (
      id INT AUTO_INCREMENT PRIMARY KEY,
      supplier_id INT NOT NULL,
      brand_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_supplier_brand (supplier_id, brand_id),
      CONSTRAINT fk_supplier_brands_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
      CONSTRAINT fk_supplier_brands_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(190) NOT NULL,
      description TEXT NULL,
      priority VARCHAR(40) NOT NULL DEFAULT 'Normal',
      due_at DATETIME NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_tasks_due_at (due_at),
      CONSTRAINT fk_tasks_created_by FOREIGN KEY (created_by) REFERENCES admins(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS task_assignments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      task_id INT NOT NULL,
      staff_id INT NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'Pending',
      remarks TEXT NULL,
      is_unread BOOLEAN NOT NULL DEFAULT TRUE,
      completed_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_task_assignment (task_id, staff_id),
      INDEX idx_task_assignments_staff_status (staff_id, status),
      CONSTRAINT fk_task_assignments_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      CONSTRAINT fk_task_assignments_staff FOREIGN KEY (staff_id) REFERENCES admins(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS task_assignment_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      assignment_id INT NOT NULL,
      status VARCHAR(40) NOT NULL,
      remarks TEXT NULL,
      changed_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_task_history_assignment (assignment_id),
      CONSTRAINT fk_task_history_assignment FOREIGN KEY (assignment_id) REFERENCES task_assignments(id) ON DELETE CASCADE,
      CONSTRAINT fk_task_history_changed_by FOREIGN KEY (changed_by) REFERENCES admins(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS order_status_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      status VARCHAR(40) NOT NULL,
      tracking_url VARCHAR(500) NULL,
      logistics_provider VARCHAR(160) NULL,
      changed_by VARCHAR(160) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_order_status_history_order (order_id),
      CONSTRAINT fk_order_status_history_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS return_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      request_type VARCHAR(40) NOT NULL,
      status VARCHAR(80) NOT NULL DEFAULT 'Requested',
      reason TEXT NOT NULL,
      internal_remarks TEXT NULL,
      requested_by VARCHAR(160) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_return_requests_order (order_id),
      INDEX idx_return_requests_status (status),
      CONSTRAINT fk_return_requests_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS return_request_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_id INT NOT NULL,
      status VARCHAR(80) NOT NULL,
      internal_remarks TEXT NULL,
      changed_by VARCHAR(160) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_return_history_request (request_id),
      CONSTRAINT fk_return_history_request FOREIGN KEY (request_id) REFERENCES return_requests(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(190) NOT NULL UNIQUE,
      source VARCHAR(80) NOT NULL DEFAULT 'website',
      status VARCHAR(40) NOT NULL DEFAULT 'Subscribed',
      subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      unsubscribed_at DATETIME NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_newsletter_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS blog_posts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(190) NOT NULL UNIQUE,
      title VARCHAR(255) NOT NULL,
      excerpt TEXT NULL,
      content LONGTEXT NULL,
      cover_image LONGTEXT NULL,
      category VARCHAR(120) NULL,
      tags JSON NULL,
      featured BOOLEAN NOT NULL DEFAULT FALSE,
      status VARCHAR(40) NOT NULL DEFAULT 'Draft',
      author VARCHAR(160) NULL,
      published_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_blog_posts_status_published (status, published_at),
      INDEX idx_blog_posts_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS low_stock_alert_state (
      id INT AUTO_INCREMENT PRIMARY KEY,
      catalog VARCHAR(40) NOT NULL,
      product_id INT NOT NULL,
      is_low BOOLEAN NOT NULL DEFAULT FALSE,
      last_alerted_at DATETIME NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_low_stock_alert (catalog, product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS product_stock_counts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      bucket VARCHAR(30) NOT NULL,
      stock_on_hand INT NOT NULL DEFAULT 0,
      reserved_stock INT NOT NULL DEFAULT 0,
      reorder_level INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_product_stock_bucket (product_id, bucket),
      INDEX idx_product_stock_counts_bucket (bucket),
      CONSTRAINT fk_product_stock_counts_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS product_stock_audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      bucket VARCHAR(30) NOT NULL,
      previous_stock INT NOT NULL DEFAULT 0,
      new_stock INT NOT NULL DEFAULT 0,
      previous_reorder_level INT NULL,
      new_reorder_level INT NULL,
      adjustment_type VARCHAR(30) NOT NULL DEFAULT 'set',
      quantity_delta INT NOT NULL DEFAULT 0,
      reason VARCHAR(255) NULL,
      changed_by INT NULL,
      actor VARCHAR(190) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_stock_audit_product (product_id, created_at),
      INDEX idx_stock_audit_bucket (bucket, created_at),
      CONSTRAINT fk_stock_audit_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      CONSTRAINT fk_stock_audit_actor FOREIGN KEY (changed_by) REFERENCES admins(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS sales_leads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      lead_name VARCHAR(190) NOT NULL,
      meeting_at DATETIME NOT NULL,
      place VARCHAR(255) NULL,
      company_name VARCHAR(190) NULL,
      contact_person VARCHAR(190) NULL,
      phone VARCHAR(40) NULL,
      whatsapp VARCHAR(40) NULL,
      email VARCHAR(190) NULL,
      notes TEXT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'Newly Added',
      closing_remarks TEXT NULL,
      owner_id INT NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_sales_leads_owner_status (owner_id, status),
      INDEX idx_sales_leads_meeting_at (meeting_at),
      INDEX idx_sales_leads_company (company_name),
      CONSTRAINT fk_sales_leads_owner FOREIGN KEY (owner_id) REFERENCES admins(id) ON DELETE RESTRICT,
      CONSTRAINT fk_sales_leads_created_by FOREIGN KEY (created_by) REFERENCES admins(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS sales_lead_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      lead_id INT NOT NULL,
      status VARCHAR(50) NOT NULL,
      remarks TEXT NULL,
      changed_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sales_lead_history_lead (lead_id, created_at),
      CONSTRAINT fk_sales_lead_history_lead FOREIGN KEY (lead_id) REFERENCES sales_leads(id) ON DELETE CASCADE,
      CONSTRAINT fk_sales_lead_history_actor FOREIGN KEY (changed_by) REFERENCES admins(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS sales_catalogs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(190) NOT NULL,
      lead_id INT NULL,
      creator_id INT NOT NULL,
      filters_json JSON NULL,
      layout VARCHAR(20) NOT NULL DEFAULT '2x2',
      status VARCHAR(40) NOT NULL DEFAULT 'Draft',
      public_token VARCHAR(96) NULL UNIQUE,
      pdf_storage_key VARCHAR(500) NULL,
      pdf_size INT NULL,
      error_message TEXT NULL,
      generated_at DATETIME NULL,
      archived_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_sales_catalogs_creator_status (creator_id, status),
      INDEX idx_sales_catalogs_lead (lead_id),
      CONSTRAINT fk_sales_catalogs_lead FOREIGN KEY (lead_id) REFERENCES sales_leads(id) ON DELETE SET NULL,
      CONSTRAINT fk_sales_catalogs_creator FOREIGN KEY (creator_id) REFERENCES admins(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS sales_catalog_products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      catalog_id INT NOT NULL,
      product_id INT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      snapshot_json JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_sales_catalog_product (catalog_id, product_id),
      INDEX idx_sales_catalog_order (catalog_id, sort_order),
      CONSTRAINT fk_sales_catalog_product_catalog FOREIGN KEY (catalog_id) REFERENCES sales_catalogs(id) ON DELETE CASCADE,
      CONSTRAINT fk_sales_catalog_product_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS sales_catalog_shares (
      id INT AUTO_INCREMENT PRIMARY KEY,
      catalog_id INT NOT NULL,
      channel VARCHAR(30) NOT NULL,
      recipient VARCHAR(190) NULL,
      shared_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sales_catalog_shares_catalog (catalog_id, created_at),
      CONSTRAINT fk_sales_catalog_shares_catalog FOREIGN KEY (catalog_id) REFERENCES sales_catalogs(id) ON DELETE CASCADE,
      CONSTRAINT fk_sales_catalog_shares_actor FOREIGN KEY (shared_by) REFERENCES admins(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await addColumnIfMissing("sales_leads", "lead_source", "lead_source VARCHAR(80) NOT NULL DEFAULT 'Manual' AFTER lead_name");
  await db.query("ALTER TABLE sales_leads MODIFY owner_id INT NULL");
  if (await constraintExists("sales_leads", "fk_sales_leads_owner")) {
    await db.query("ALTER TABLE sales_leads DROP FOREIGN KEY fk_sales_leads_owner");
  }
  if (!(await constraintExists("sales_leads", "fk_sales_leads_owner"))) {
    await db.query(`
      ALTER TABLE sales_leads
      ADD CONSTRAINT fk_sales_leads_owner
        FOREIGN KEY (owner_id)
        REFERENCES admins(id)
        ON DELETE SET NULL
    `);
  }
  await addColumnIfMissing("order_status_history", "fulfillment_stock_source", "fulfillment_stock_source VARCHAR(30) NULL");

  await db.query(`
    CREATE TABLE IF NOT EXISTS migration_flags (
      flag_key VARCHAR(120) PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    INSERT IGNORE INTO product_stock_counts (product_id, bucket, stock_on_hand, reserved_stock, reorder_level)
    SELECT id, 'warehouse', 0, 0, COALESCE(reorder_level, 0)
    FROM products
    WHERE deleted_at IS NULL
  `);

  await db.query(`
    INSERT IGNORE INTO product_stock_counts (product_id, bucket, stock_on_hand, reserved_stock, reorder_level)
    SELECT id, 'shop', 0, 0, COALESCE(reorder_level, 0)
    FROM products
    WHERE deleted_at IS NULL
  `);

  const [lowStockResetRows] = await db.query(
    "SELECT flag_key FROM migration_flags WHERE flag_key = 'low_stock_alerts_zero_20260906' LIMIT 1"
  );
  if (!lowStockResetRows.length) {
    await db.query("UPDATE products SET reorder_level = 0 WHERE reorder_level <> 0");
    await db.query("UPDATE product_stock_counts SET reorder_level = 0 WHERE reorder_level <> 0");
    await db.query("UPDATE warehouse_products SET reorder_level = 0 WHERE reorder_level <> 0");
    await db.query("UPDATE store_products SET reorder_level = 0 WHERE reorder_level <> 0");
    await db.query("UPDATE warehouse_stock SET reorder_level = 0 WHERE reorder_level <> 0");
    await db.query("UPDATE store_stock SET reorder_level = 0 WHERE reorder_level <> 0");
    await db.query("INSERT INTO migration_flags (flag_key) VALUES ('low_stock_alerts_zero_20260906')");
  }

  await addColumnIfMissing("store_movements", "product_id", "product_id INT NULL AFTER id");
  await db.query("ALTER TABLE store_movements MODIFY store_product_id INT NULL");

  if (!(await indexExists("admin_notifications", "uq_admin_notifications_dedupe"))) {
    await db.query("ALTER TABLE admin_notifications ADD UNIQUE KEY uq_admin_notifications_dedupe (dedupe_key)");
  }

  if (!(await indexExists("supplier_products", "uq_supplier_store_product"))) {
    await db.query("ALTER TABLE supplier_products ADD UNIQUE KEY uq_supplier_store_product (supplier_id, store_product_id)");
  }

  if (!(await constraintExists("supplier_products", "fk_supplier_products_store_product"))) {
    await db.query(`
      ALTER TABLE supplier_products
      ADD CONSTRAINT fk_supplier_products_store_product
        FOREIGN KEY (store_product_id)
        REFERENCES store_products(id)
        ON DELETE CASCADE
    `);
  }

  if (!(await constraintExists("warehouse_products", "fk_warehouse_products_category"))) {
    await db.query(`
      ALTER TABLE warehouse_products
      ADD CONSTRAINT fk_warehouse_products_category
        FOREIGN KEY (category_id)
        REFERENCES categories(id)
        ON DELETE SET NULL
    `);
  }

  if (!(await constraintExists("warehouse_products", "fk_warehouse_products_brand"))) {
    await db.query(`
      ALTER TABLE warehouse_products
      ADD CONSTRAINT fk_warehouse_products_brand
        FOREIGN KEY (brand_id)
        REFERENCES brands(id)
        ON DELETE SET NULL
    `);
  }

  await db.query("UPDATE orders SET order_status = 'Dispatched' WHERE order_status = 'Shipped'");
  await db.query("UPDATE orders SET delivered_at = COALESCE(delivered_at, updated_at) WHERE order_status = 'Delivered'");

  if (false) {
  await db.query(`
    INSERT INTO warehouse_products
      (sku, name, description, category, category_id, brand_id, barcode, unit, purchase_price, mrp, reorder_level, specifications, status, created_by)
    SELECT
      COALESCE(NULLIF(p.sku, ''), CONCAT('WEB-', p.id)),
      p.name,
      p.description,
      c.name,
      p.category_id,
      p.brand_id,
      p.barcode,
      'pcs',
      p.price,
      p.price,
      p.reorder_level,
      p.specifications,
      p.status,
      'Website detachment migration'
    FROM warehouse_stock ws
    JOIN products p ON p.id = ws.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ws.warehouse_product_id IS NULL
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      category_id = COALESCE(warehouse_products.category_id, VALUES(category_id)),
      brand_id = COALESCE(warehouse_products.brand_id, VALUES(brand_id))
  `);

  await db.query(`
    INSERT INTO warehouse_stock
      (product_id, warehouse_product_id, warehouse_id, sku, google_sheet_row_id, stock_on_hand, reserved_stock, reorder_level, approval_status, last_synced_at)
    SELECT
      NULL,
      wp.id,
      ws.warehouse_id,
      MAX(COALESCE(NULLIF(ws.sku, ''), wp.sku)),
      MAX(ws.google_sheet_row_id),
      SUM(ws.stock_on_hand),
      SUM(ws.reserved_stock),
      MAX(ws.reorder_level),
      IF(SUM(ws.approval_status = 'Pending') > 0, 'Pending', 'Approved'),
      MAX(ws.last_synced_at)
    FROM warehouse_stock ws
    JOIN products p ON p.id = ws.product_id
    JOIN warehouse_products wp ON wp.sku = COALESCE(NULLIF(p.sku, ''), CONCAT('WEB-', p.id))
    WHERE ws.product_id IS NOT NULL
    GROUP BY wp.id, ws.warehouse_id
    ON DUPLICATE KEY UPDATE
      stock_on_hand = warehouse_stock.stock_on_hand + VALUES(stock_on_hand),
      reserved_stock = warehouse_stock.reserved_stock + VALUES(reserved_stock),
      reorder_level = GREATEST(warehouse_stock.reorder_level, VALUES(reorder_level)),
      approval_status = IF(
        warehouse_stock.approval_status = 'Pending' OR VALUES(approval_status) = 'Pending',
        'Pending',
        warehouse_stock.approval_status
      ),
      last_synced_at = COALESCE(
        GREATEST(warehouse_stock.last_synced_at, VALUES(last_synced_at)),
        warehouse_stock.last_synced_at,
        VALUES(last_synced_at)
      )
  `);

  await db.query("DELETE FROM warehouse_stock WHERE product_id IS NOT NULL");

  await db.query(`
    UPDATE stock_movements sm
    JOIN products p ON p.id = sm.product_id
    JOIN warehouse_products wp ON wp.sku = COALESCE(NULLIF(p.sku, ''), CONCAT('WEB-', p.id))
    SET sm.warehouse_product_id = wp.id,
        sm.product_id = NULL
    WHERE sm.product_id IS NOT NULL
  `);

  await db.query(`
    INSERT INTO supplier_products (supplier_id, product_source, product_id, warehouse_product_id)
    SELECT DISTINCT
      sp.supplier_id,
      'Warehouse',
      NULL,
      wp.id
    FROM supplier_products sp
    JOIN products p ON p.id = sp.product_id
    JOIN warehouse_products wp ON wp.sku = COALESCE(NULLIF(p.sku, ''), CONCAT('WEB-', p.id))
    WHERE sp.product_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM warehouse_stock ws
        WHERE ws.warehouse_product_id = wp.id
      )
    ON DUPLICATE KEY UPDATE
      product_source = 'Warehouse'
  `);

  await db.query(`
    DELETE sp
    FROM supplier_products sp
    JOIN products p ON p.id = sp.product_id
    JOIN warehouse_products wp ON wp.sku = COALESCE(NULLIF(p.sku, ''), CONCAT('WEB-', p.id))
    WHERE sp.product_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM warehouse_stock ws
        WHERE ws.warehouse_product_id = wp.id
      )
  `);
  }

  await db.query(`
    UPDATE sales_catalogs
    SET status = 'Failed',
        error_message = 'Generation was interrupted by a service restart'
    WHERE status = 'Generating'
      AND updated_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)
  `);
}
