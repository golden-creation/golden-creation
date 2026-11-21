import { dbQuery } from "../services/commerce.service.js";
import {
  publicUser,
  revokeCustomerSession,
  rotateCustomerSession,
} from "../services/customer-session.service.js";

function cleanString(value) {
  return String(value || "").trim();
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function cartItem(row) {
  return {
    cartKey: row.cart_key,
    itemType: row.item_type,
    productId: row.product_id ? Number(row.product_id) : null,
    variantId: row.variant_id ? Number(row.variant_id) : null,
    bundleId: row.bundle_id ? Number(row.bundle_id) : null,
    bundleType: row.bundle_type || "",
    bundleName: row.bundle_name || "",
    bundleItems: parseJson(row.bundle_items, []),
    name: row.name || "",
    image: row.image || "",
    category: row.category || "",
    price: Number(row.price || 0),
    oldPrice: Number(row.old_price || 0),
    quantity: Number(row.quantity || 1),
    stock:
      row.variant_id && row.variant_stock !== null && row.variant_stock !== undefined
        ? Number(row.variant_stock || 0)
        : row.product_stock !== null && row.product_stock !== undefined
        ? Number(row.product_stock || 0)
        : undefined,
    metadata: parseJson(row.metadata, {}),
  };
}

function address(row) {
  return {
    id: String(row.id),
    name: row.name || "",
    tag: row.tag || "HOME",
    line1: row.line1 || "",
    line2: row.line2 || "",
    city: row.city || "",
    state: row.state || "",
    postalCode: row.postal_code || "",
    phone: row.phone || "",
    isPrimary: Boolean(row.is_default),
  };
}

async function loadState(userId) {
  const [cartRows, wishlistRows, addressRows] = await Promise.all([
    dbQuery(
      `SELECT cci.*, p.stock_quantity AS product_stock, pv.stock AS variant_stock
         FROM customer_cart_items cci
         LEFT JOIN products p ON p.id = cci.product_id
         LEFT JOIN product_variants pv ON pv.id = cci.variant_id
        WHERE cci.user_id = ?
        ORDER BY cci.updated_at DESC`,
      [userId]
    ),
    dbQuery(
      `SELECT p.*, c.name AS category_name,
              COALESCE((SELECT GROUP_CONCAT(pi.image_url ORDER BY pi.id SEPARATOR ',') FROM product_images pi WHERE pi.product_id = p.id), '') AS images
         FROM customer_wishlist_items w
         JOIN products p ON p.id = w.product_id
         LEFT JOIN categories c ON c.id = p.category_id
        WHERE w.user_id = ? AND p.deleted_at IS NULL
        ORDER BY w.created_at DESC`,
      [userId]
    ),
    dbQuery("SELECT * FROM customer_addresses WHERE user_id = ? ORDER BY is_default DESC, updated_at DESC", [userId]),
  ]);
  return {
    cart: cartRows.map(cartItem),
    wishlist: wishlistRows,
    addresses: addressRows.map(address),
  };
}

async function validateProductCartItem(item) {
  const itemType = cleanString(item.itemType) || "Product";
  if (itemType !== "Product") return;

  const productId = Number(item.productId || item.id) || 0;
  const variantId = Number(item.variantId) || null;
  const quantity = Math.max(1, Number(item.quantity) || 1);
  if (!productId) {
    const error = new Error("A cart product is missing its product ID");
    error.statusCode = 400;
    throw error;
  }

  const rows = await dbQuery(
    `SELECT
        p.id,
        p.name,
        p.stock_quantity,
        p.status,
        p.deleted_at,
        pv.id AS variant_id,
        pv.stock AS variant_stock,
        pv.status AS variant_status,
        pv.visibility AS variant_visibility
       FROM products p
       LEFT JOIN product_variants pv
         ON pv.product_id = p.id AND pv.id = ?
      WHERE p.id = ?
      LIMIT 1`,
    [variantId || 0, productId]
  );
  const product = rows[0];
  if (!product || product.deleted_at || product.status !== "Active") {
    const error = new Error("This product is no longer available");
    error.statusCode = 409;
    throw error;
  }
  if (variantId && !product.variant_id) {
    const error = new Error(`${product.name} variant is no longer available`);
    error.statusCode = 409;
    throw error;
  }
  if (
    variantId &&
    (product.variant_status !== "Active" || product.variant_visibility === "Hidden")
  ) {
    const error = new Error(`${product.name} variant is unavailable`);
    error.statusCode = 409;
    throw error;
  }

  const stock = Number(variantId ? product.variant_stock : product.stock_quantity) || 0;
  if (stock <= 0) {
    const error = new Error(`${product.name} is currently out of stock`);
    error.statusCode = 409;
    throw error;
  }
  if (stock < quantity) {
    const error = new Error(`${product.name} has only ${stock} unit(s) available`);
    error.statusCode = 409;
    throw error;
  }
}

export async function getCustomerState(req, res) {
  try {
    res.json({
      user: publicUser(req.customer),
      ...(await loadState(req.customer.id)),
    });
  } catch {
    res.status(500).json({ message: "Unable to load customer state" });
  }
}

export async function getCart(req, res) {
  try {
    const state = await loadState(req.customer.id);
    res.json({ items: state.cart });
  } catch {
    res.status(500).json({ message: "Unable to load cart" });
  }
}

export async function upsertCartItem(req, res) {
  const cartKey = cleanString(req.params.cartKey);
  const item = req.body || {};
  if (!cartKey || !["Product", "Bundle"].includes(cleanString(item.itemType) || "Product")) {
    return res.status(400).json({ message: "A valid cart item is required" });
  }
  try {
    await validateProductCartItem(item);
    await dbQuery(
      `INSERT INTO customer_cart_items
        (user_id, cart_key, item_type, product_id, variant_id, bundle_id, bundle_type,
         bundle_name, bundle_items, name, image, category, price, old_price, quantity, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         item_type=VALUES(item_type), product_id=VALUES(product_id), variant_id=VALUES(variant_id),
         bundle_id=VALUES(bundle_id), bundle_type=VALUES(bundle_type), bundle_name=VALUES(bundle_name),
         bundle_items=VALUES(bundle_items), name=VALUES(name), image=VALUES(image),
         category=VALUES(category), price=VALUES(price), old_price=VALUES(old_price),
         quantity=VALUES(quantity), metadata=VALUES(metadata), updated_at=NOW()`,
      [
        req.customer.id,
        cartKey,
        cleanString(item.itemType) || "Product",
        Number(item.productId) || null,
        Number(item.variantId) || null,
        Number(item.bundleId) || null,
        cleanString(item.bundleType) || null,
        cleanString(item.bundleName) || null,
        JSON.stringify(Array.isArray(item.bundleItems) ? item.bundleItems : []),
        cleanString(item.name),
        cleanString(item.image || item.imageUrl),
        cleanString(item.category || item.categoryName),
        Number(item.price || 0),
        Number(item.oldPrice || item.price || 0),
        Math.max(1, Number(item.quantity) || 1),
        JSON.stringify(item.metadata && typeof item.metadata === "object" ? item.metadata : {}),
      ]
    );
    res.json({ item: cartItem((await dbQuery(
      `SELECT cci.*, p.stock_quantity AS product_stock, pv.stock AS variant_stock
         FROM customer_cart_items cci
         LEFT JOIN products p ON p.id = cci.product_id
         LEFT JOIN product_variants pv ON pv.id = cci.variant_id
        WHERE cci.user_id = ? AND cci.cart_key = ?`,
      [req.customer.id, cartKey]
    ))[0]) });
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({ message: error.message || "Unable to update cart" });
  }
}

export async function deleteCartItem(req, res) {
  await dbQuery("DELETE FROM customer_cart_items WHERE user_id = ? AND cart_key = ?", [
    req.customer.id,
    cleanString(req.params.cartKey),
  ]).catch(() => {});
  res.json({ message: "Cart item removed" });
}

export async function clearCart(req, res) {
  await dbQuery("DELETE FROM customer_cart_items WHERE user_id = ?", [req.customer.id]).catch(() => {});
  res.json({ message: "Cart cleared" });
}

export async function getWishlist(req, res) {
  try {
    const state = await loadState(req.customer.id);
    res.json({ products: state.wishlist });
  } catch {
    res.status(500).json({ message: "Unable to load wishlist" });
  }
}

export async function addWishlistItem(req, res) {
  const productId = Number(req.params.productId);
  if (!productId) return res.status(400).json({ message: "Invalid product" });
  try {
    await dbQuery(
      `INSERT IGNORE INTO customer_wishlist_items (user_id, product_id) VALUES (?, ?)`,
      [req.customer.id, productId]
    );
    res.status(201).json({ message: "Added to wishlist" });
  } catch {
    res.status(400).json({ message: "Unable to add this product" });
  }
}

export async function removeWishlistItem(req, res) {
  await dbQuery("DELETE FROM customer_wishlist_items WHERE user_id = ? AND product_id = ?", [
    req.customer.id,
    Number(req.params.productId),
  ]).catch(() => {});
  res.json({ message: "Removed from wishlist" });
}

export async function getAddresses(req, res) {
  try {
    const rows = await dbQuery(
      "SELECT * FROM customer_addresses WHERE user_id = ? ORDER BY is_default DESC, updated_at DESC",
      [req.customer.id]
    );
    res.json({ addresses: rows.map(address) });
  } catch {
    res.status(500).json({ message: "Unable to load addresses" });
  }
}

function addressValues(body) {
  return [
    cleanString(body.name),
    cleanString(body.tag || "HOME").toUpperCase(),
    cleanString(body.line1 || body.address),
    cleanString(body.line2),
    cleanString(body.city),
    cleanString(body.state),
    cleanString(body.postalCode || body.zipCode),
    cleanString(body.phone),
  ];
}

export async function createAddress(req, res) {
  const values = addressValues(req.body || {});
  if (!values[0] || !values[2] || !values[7]) {
    return res.status(400).json({ message: "Name, address and phone are required" });
  }
  try {
    const count = await dbQuery("SELECT COUNT(*) count FROM customer_addresses WHERE user_id = ?", [
      req.customer.id,
    ]);
    const makeDefault = Boolean(req.body?.isPrimary) || Number(count[0]?.count || 0) === 0;
    if (makeDefault) {
      await dbQuery("UPDATE customer_addresses SET is_default = 0 WHERE user_id = ?", [req.customer.id]);
    }
    const result = await dbQuery(
      `INSERT INTO customer_addresses
        (user_id, name, tag, line1, line2, city, state, postal_code, phone, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.customer.id, ...values, makeDefault ? 1 : 0]
    );
    const rows = await dbQuery("SELECT * FROM customer_addresses WHERE id = ? AND user_id = ?", [
      result.insertId,
      req.customer.id,
    ]);
    res.status(201).json({ address: address(rows[0]) });
  } catch {
    res.status(500).json({ message: "Unable to save address" });
  }
}

export async function updateAddress(req, res) {
  const values = addressValues(req.body || {});
  try {
    await dbQuery(
      `UPDATE customer_addresses
          SET name=?, tag=?, line1=?, line2=?, city=?, state=?, postal_code=?, phone=?
        WHERE id=? AND user_id=?`,
      [...values, Number(req.params.id), req.customer.id]
    );
    const rows = await dbQuery("SELECT * FROM customer_addresses WHERE id = ? AND user_id = ?", [
      Number(req.params.id),
      req.customer.id,
    ]);
    if (!rows.length) return res.status(404).json({ message: "Address not found" });
    res.json({ address: address(rows[0]) });
  } catch {
    res.status(500).json({ message: "Unable to update address" });
  }
}

export async function deleteAddress(req, res) {
  try {
    const rows = await dbQuery(
      "SELECT is_default FROM customer_addresses WHERE id = ? AND user_id = ?",
      [Number(req.params.id), req.customer.id]
    );
    await dbQuery("DELETE FROM customer_addresses WHERE id = ? AND user_id = ?", [
      Number(req.params.id),
      req.customer.id,
    ]);
    if (rows[0]?.is_default) {
      await dbQuery(
        `UPDATE customer_addresses SET is_default = 1
          WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1`,
        [req.customer.id]
      );
    }
    res.json({ message: "Address removed" });
  } catch {
    res.status(500).json({ message: "Unable to remove address" });
  }
}

export async function setDefaultAddress(req, res) {
  try {
    const rows = await dbQuery("SELECT id FROM customer_addresses WHERE id = ? AND user_id = ?", [
      Number(req.params.id),
      req.customer.id,
    ]);
    if (!rows.length) return res.status(404).json({ message: "Address not found" });
    await dbQuery("UPDATE customer_addresses SET is_default = 0 WHERE user_id = ?", [req.customer.id]);
    await dbQuery("UPDATE customer_addresses SET is_default = 1 WHERE id = ? AND user_id = ?", [
      Number(req.params.id),
      req.customer.id,
    ]);
    res.json({ message: "Default address updated" });
  } catch {
    res.status(500).json({ message: "Unable to update default address" });
  }
}

export async function refreshSession(req, res) {
  try {
    res.json(await rotateCustomerSession(cleanString(req.body?.refreshToken), {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    }));
  } catch (error) {
    res.status(error.statusCode || 401).json({ message: error.message });
  }
}

export async function logoutSession(req, res) {
  await revokeCustomerSession({
    refreshToken: cleanString(req.body?.refreshToken),
    sessionId: req.customerSessionId,
    userId: req.customer?.id,
  }).catch(() => {});
  res.json({ message: "Logged out" });
}
