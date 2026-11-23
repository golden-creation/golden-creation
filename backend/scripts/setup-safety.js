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
