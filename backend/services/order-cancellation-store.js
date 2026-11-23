import { beginTransaction, commit, connectionQuery, getConnection, rollback } from "./commerce.service.js";
import { applyCancellationWrites, planOrderCancellation } from "./order-cancellation.js";

export async function cancelStoredOrder({ orderId, reason, resolution, actor = "Admin" }) {
  const connection = await getConnection();
  try {
    await beginTransaction(connection);
    const orders = await connectionQuery(connection, "SELECT * FROM orders WHERE id=? FOR UPDATE", [orderId]);
    const order = orders[0];
    if (!order) {
      await rollback(connection);
      return { ok: false, statusCode: 404, message: "Order not found" };
    }
    const items = await connectionQuery(
      connection,
      "SELECT product_id, variant_id, quantity, item_type, bundle_items FROM order_items WHERE order_id=?",
      [orderId]
    );
    const prior = await connectionQuery(
      connection,
      "SELECT id FROM product_stock_audit_logs WHERE adjustment_type='cancellation' AND reason=? LIMIT 1",
      [`Order ${orderId} cancellation restore`]
    );
    const plan = planOrderCancellation(order, {
      items,
      reason,
      resolution,
      physicalAlreadyRestored: prior.length > 0,
    });
    if (!plan.ok) {
      await rollback(connection);
      return plan;
    }
    await applyCancellationWrites((sql, values) => connectionQuery(connection, sql, values), plan, actor);
    await commit(connection);
    return plan;
  } catch (error) {
    await rollback(connection);
    throw error;
  } finally {
    connection.release();
  }
}
