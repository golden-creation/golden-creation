import bcrypt from "bcrypt";
import { dataSeedAuthorized, dataSeedRefusalReason } from "./setup-safety.js";

export async function seedAdminModuleData(db, env = process.env) {
  if (!dataSeedAuthorized(env)) {
    const error = new Error(dataSeedRefusalReason(env));
    error.code = "DATA_SEED_REFUSED";
    throw error;
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
}
