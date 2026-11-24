export function refuseProductionSchemaTarget(env = process.env) {
  const name = String(env.DB_NAME || "").trim();
  if (name === "goldencreation_db") {
    throw new Error("Refusing schema setup for goldencreation_db");
  }
}

export function dataSeedAuthorized(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || "").trim().toLowerCase();
  const allow = String(env.ALLOW_DATA_SEED || "").trim().toLowerCase();
  if (nodeEnv === "production") return false;
  return allow === "yes";
}

export function dataSeedRefusalReason(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || "").trim().toLowerCase();
  if (nodeEnv === "production") {
    return "Data seed refused: NODE_ENV=production. Schema setup will not change menus, accounts, permissions, warehouses, products, orders, or stock.";
  }
  return "Data seed skipped. Schema only. Set ALLOW_DATA_SEED=yes with NODE_ENV other than production to run the local seed.";
}
