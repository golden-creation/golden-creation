import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const publicIndex = path.join(rootDir, "public", "index.html");

if (!fs.existsSync(publicIndex)) {
  console.error("Build failed: public/index.html is missing.");
  console.error("Copy the frontend dist files into public/ before deploying.");
  process.exit(1);
}

console.log("Build check passed: frontend files already exist in public/.");
