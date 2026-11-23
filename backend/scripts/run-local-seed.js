import { dataSeedAuthorized } from "./setup-safety.js";

if (String(process.env.NODE_ENV || "").trim().toLowerCase() === "production" || !dataSeedAuthorized({
  ...process.env,
  ALLOW_DATA_SEED: "yes",
  NODE_ENV: process.env.NODE_ENV || "development",
})) {
  console.error("Refused: db:seed cannot run when NODE_ENV=production.");
  process.exit(1);
}

process.env.ALLOW_DATA_SEED = "yes";
await import("./ensure-admin-modules-schema.js");
