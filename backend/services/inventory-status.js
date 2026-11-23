const SCALE = 1_000_000;

function quantity(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sameQuantity(left, right) {
  return Math.round(Number(left) * SCALE) === Math.round(Number(right) * SCALE);
}

function zeroIsVerified(quantityValue, verified) {
  return quantityValue !== 0 || verified === true;
}

export function classifyInventoryStatus({
  busy = 0,
  warehouse = null,
  shop = null,
  warehouseVerified = false,
  shopVerified = false,
} = {}) {
  const warehouseQuantity = quantity(warehouse);
  const shopQuantity = quantity(shop);
  if (warehouseQuantity === null || shopQuantity === null) return "not_recorded";
  if (!zeroIsVerified(warehouseQuantity, warehouseVerified) || !zeroIsVerified(shopQuantity, shopVerified)) {
    return "unverified";
  }
  const busyQuantity = quantity(busy) ?? 0;
  return sameQuantity(busyQuantity, warehouseQuantity + shopQuantity) ? "balanced" : "mismatch";
}

export function physicalStockFilter(alias, stockStatus, reorderExpression) {
  const status = String(stockStatus || "").toLowerCase();
  if (status === "in_stock") return `${alias}.id IS NOT NULL AND ${alias}.stock_on_hand > 0`;
  if (status === "out_of_stock") return `${alias}.id IS NOT NULL AND ${alias}.stock_on_hand <= 0`;
  if (status === "low_stock") return `${alias}.id IS NOT NULL AND ${alias}.stock_on_hand <= ${reorderExpression}`;
  return "";
}

export function inventoryStatusSql({ auditAvailable = false } = {}) {
  const warehouseVerified = auditAvailable
    ? "EXISTS (SELECT 1 FROM product_stock_audit_logs warehouse_audit WHERE warehouse_audit.product_id = p.id AND warehouse_audit.bucket = 'warehouse')"
    : "0";
  const shopVerified = auditAvailable
    ? "EXISTS (SELECT 1 FROM product_stock_audit_logs shop_audit WHERE shop_audit.product_id = p.id AND shop_audit.bucket = 'shop')"
    : "0";
  return `CASE
    WHEN warehouse_stock.id IS NULL OR shop_stock.id IS NULL THEN 'not_recorded'
    WHEN (warehouse_stock.stock_on_hand = 0 AND ${warehouseVerified} = 0)
      OR (shop_stock.stock_on_hand = 0 AND ${shopVerified} = 0) THEN 'unverified'
    WHEN CAST(COALESCE(p.stock_quantity, 0) AS DECIMAL(20,6)) = CAST(warehouse_stock.stock_on_hand + shop_stock.stock_on_hand AS DECIMAL(20,6)) THEN 'balanced'
    ELSE 'mismatch'
  END`;
}
