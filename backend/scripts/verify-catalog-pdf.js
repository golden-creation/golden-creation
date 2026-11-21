import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalogPdf } from "../controllers/sales.controller.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, "..", "tmp", "pdfs");
const outputPath = path.join(outputDir, "catalog-verification.pdf");

const products = Array.from({ length: 9 }, (_, index) => ({
  productId: index + 1,
  name: `Catalog Verification Product ${index + 1}`,
  brand_name: "Golden Creation",
  category_name: "Office Supplies",
  price: (index + 1) * 125,
  sku: `VERIFY-${String(index + 1).padStart(3, "0")}`,
  description:
    "A representative product description used to verify catalog rendering, pagination, and searchable PDF text.",
  image_url: "",
}));

await fs.mkdir(outputDir, { recursive: true });
const buffer = await buildCatalogPdf({
  name: "Catalog PDF Verification",
  layout: "2x2",
  categoryLabels: "Office Supplies",
  collectionLabels: "Verification Collection",
  products,
});
assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
assert.ok(buffer.length > 5_000, "Generated catalog PDF is unexpectedly small");
await fs.writeFile(outputPath, buffer);
console.log(outputPath);
