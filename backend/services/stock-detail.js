export function isMissingTableError(error) {
  return error?.code === "ER_NO_SUCH_TABLE" || error?.errno === 1146;
}

export function parseStockQuantity(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return { ok: false, message: "Enter a stock quantity" };
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return { ok: false, message: "Enter a valid stock quantity" };
  if (parsed < 0) return { ok: false, message: "Stock cannot be negative" };
  return { ok: true, value: parsed };
}

export function stockDetailProduct(row) {
  if (!row) return null;
  const recorded = (value) => (value === null || value === undefined ? null : Number(value));
  return {
    id: Number(row.id),
    sku: row.sku || "",
    name: row.name || "",
    stock_quantity: Number(row.stock_quantity || 0),
    reorder_level: Number(row.reorder_level || 0),
    busy_stock: Number(row.stock_quantity || 0),
    busyStock: Number(row.stock_quantity || 0),
    website_stock: Number(row.stock_quantity || 0),
    websiteStock: Number(row.stock_quantity || 0),
    warehouse_stock: recorded(row.warehouse_stock),
    warehouseStock: recorded(row.warehouse_stock),
    shop_stock: recorded(row.shop_stock),
    shopStock: recorded(row.shop_stock),
    website_reorder_level: Number(row.reorder_level || 0),
    warehouse_reorder_level: recorded(row.warehouse_reorder_level),
    shop_reorder_level: recorded(row.shop_reorder_level),
  };
}

const STOCK_DETAIL_SQL = `
  SELECT p.id, p.sku, p.name, p.stock_quantity, p.reorder_level,
         warehouse_stock.stock_on_hand AS warehouse_stock,
         shop_stock.stock_on_hand AS shop_stock,
         warehouse_stock.reorder_level AS warehouse_reorder_level,
         shop_stock.reorder_level AS shop_reorder_level
    FROM products p
    LEFT JOIN product_stock_counts warehouse_stock
      ON warehouse_stock.product_id = p.id AND warehouse_stock.bucket = 'warehouse'
    LEFT JOIN product_stock_counts shop_stock
      ON shop_stock.product_id = p.id AND shop_stock.bucket = 'shop'
   WHERE p.id = ? AND p.deleted_at IS NULL
   LIMIT 1`;

const AUDIT_SQL = `
  SELECT id, bucket, previous_stock, new_stock, previous_reorder_level, new_reorder_level,
         adjustment_type, quantity_delta, reason, actor, created_at
    FROM product_stock_audit_logs
   WHERE product_id = ?
   ORDER BY created_at DESC, id DESC
   LIMIT 25`;

export async function auditHistoryAvailable(query) {
  try {
    await query("SELECT id FROM product_stock_audit_logs LIMIT 0");
    return true;
  } catch (error) {
    if (isMissingTableError(error)) return false;
    throw error;
  }
}
export async function readStockDetail(query, productId) {
  const id = Number(productId);
  if (!id) return { ok: false, status: 400, message: "Valid product is required" };
  const rows = await query(STOCK_DETAIL_SQL, [id]);
  const product = stockDetailProduct(rows[0]);
  if (!product) return { ok: false, status: 404, message: "Product was not found" };
  let auditLogs = [];
  try {
    auditLogs = await query(AUDIT_SQL, [id]);
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
  }
  return { ok: true, status: 200, product, auditLogs };
}

export function stockWritePlan({ bucket, mode, stockOnHand, quantity }) {
  const parsedMode = String(mode || "set").toLowerCase();
  if (!["set", "increase", "decrease"].includes(parsedMode)) {
    return { ok: false, message: "Product, bucket, and adjustment mode are required" };
  }
  const input = parsedMode === "set" ? stockOnHand : quantity;
  const parsed = parseStockQuantity(input);
  if (!parsed.ok) return parsed;
  if (parsedMode !== "set" && parsed.value === 0) {
    return { ok: false, message: "Enter a quantity to increase or decrease" };
  }
  return { ok: true, mode: parsedMode, quantity: parsed.value, bucket };
}
