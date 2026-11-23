import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import {
  SENSITIVE_KEYS,
  isIsolatedTest,
  isolatedTestFailures,
} from "./runtime-safety.js";

function assignParsed(env, parsed, { override }) {
  for (const [key, value] of Object.entries(parsed)) {
    if (override || env[key] === undefined) env[key] = value;
  }
}

export function loadConfiguration(env, {
  cwd = process.cwd(),
  readFileSync = fs.readFileSync,
  existsSync = fs.existsSync,
} = {}) {
  if (isIsolatedTest(env)) {
    const configPath = String(env.DOTENV_CONFIG_PATH || "").trim();
    if (!configPath) {
      throw new Error("Isolated test requires DOTENV_CONFIG_PATH");
    }
    if (path.basename(configPath) === ".env") {
      throw new Error("Isolated test cannot load a production .env file");
    }
    if (!existsSync(configPath)) {
      throw new Error("Isolated test configuration file is missing");
    }
    const parsed = dotenv.parse(readFileSync(configPath));
    for (const key of SENSITIVE_KEYS) {
      env[key] = Object.prototype.hasOwnProperty.call(parsed, key) ? String(parsed[key] ?? "") : "";
    }
    assignParsed(env, parsed, { override: true });
    return { mode: "isolated" };
  }

  const configPath = String(env.DOTENV_CONFIG_PATH || "").trim() || path.join(cwd, ".env");
  if (!existsSync(configPath)) return { mode: "default" };
  assignParsed(env, dotenv.parse(readFileSync(configPath)), { override: false });
  return { mode: "default" };
}

let loaded = false;

export function loadProcessEnvironment() {
  if (loaded) return;
  loaded = true;
  try {
    loadConfiguration(process.env);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (!isIsolatedTest(process.env)) return;
  const failures = isolatedTestFailures(process.env);
  if (!failures.length) return;
  console.error("Refusing to start isolated test server:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

loadProcessEnvironment();
