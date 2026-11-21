import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const sourcePath = "C:/Users/My-PC-Win10/Downloads/products_export_1.csv";
const outputDir = "D:/lekhanmart-backend-frontend-hostinger/outputs/goldencreation-products-import";
const outputPath = path.join(outputDir, "goldencreation_products_import_optimized.xlsx");
const previewPath = path.join(outputDir, "goldencreation_products_import_preview.png");
const summaryPath = path.join(outputDir, "goldencreation_products_import_summary.json");

const categoryRules = [
  ["PENS & PENCIL", "Office Supplies > Pens & Pencil"],
  ["NOTEBOOKS & DIARIES", "Office Supplies > Notebooks & Diaries"],
  ["NOTE PAD & STICKY NOTES", "Office Supplies > Note Pads & Sticky Notes"],
  ["CARTRIDGES & REFILLS", "Office Supplies > Cartridges & Refills"],
  ["MARKERS & HIGHLIGHTERS", "Office Supplies > Markers & Highlighters"],
  ["FILES & FOLDERS", "Office Supplies > Files & Folders"],
  ["TAPE & SCISSORS", "Office Supplies > Tape & Scissors"],
  ["CALCULATOR", "Office Supplies > Calculators"],
  ["INK", "Office Supplies > Ink"],
  ["POS ROLL & LABEL", "Office Supplies > POS Rolls & Labels"],
  ["GIFT ENVELOPE", "Office Supplies > Envelopes > Gift Envelopes"],
  ["PAPER ENVELOPE", "Office Supplies > Envelopes > Paper Envelopes"],
  ["OFFICE STATIONERY", "Office Supplies > Office Stationery"],
  ["SCHOOL STATIONERY", "School Stationery"],
  ["ART & CRAFT", "Art & Craft"],
  ["CLAY & MOULDING DOUGH", "Art & Craft > Clay & Moulding Dough"],
  ["CANVAS", "Art & Craft > Canvas"],
  ["COMPUTER & ELECTRONIC ACCESSORIES", "Computer & Electronic Accessories"],
  ["BATTERIES & CELLS", "Computer & Electronic Accessories > Batteries & Cells"],
  ["MOUSE PAD", "Computer & Electronic Accessories > Mouse Pads"],
  ["CORPORATE GIFT SUPPLIES", "Corporate Gift Supplies"],
  ["BOARD", "Boards"],
];

const categoryAndMarketingTags = new Set([
  ...categoryRules.map(([tag]) => tag),
  "PREMIUM PENS",
  "PREMIUM PEN",
  "PREMIUM ITEMS",
  "TRENDING ITEMS",
  "TRENDING",
  "NOTEBOOK",
  "CONVERTOR",
]);

const brandAliases = new Map([
  ["PARKER PREMIUM", "Parker"],
  ["PARKER", "Parker"],
  ["PILOT PREMIUM", "Pilot"],
  ["PILOT", "Pilot"],
  ["SCHOLAR", "Scholar"],
  ["PLANFIX", "Planfix"],
  ["FEVICOL", "Fevicol"],
  ["FLAIR", "Flair"],
  ["INTELLIO", "Intellio"],
  ["FABER CASTEL", "Faber-Castell"],
  ["OHTO", "Ohto"],
  ["OTHO", "Ohto"],
]);

const upperCaseBrands = new Set([
  "3M",
  "HP",
  "HQ",
  "JK",
  "JB9",
  "SDI",
]);

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function numberOrBlank(value) {
  const cleaned = text(value).replace(/^'/, "").replace(/[,\s]/g, "");
  if (!cleaned) return "";
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : "";
}

function cleanedTextNumber(value) {
  return text(value).replace(/^'/, "");
}

function splitTags(value) {
  return text(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function titleCaseBrand(value) {
  const normalized = text(value).toUpperCase();
  if (!normalized) return "";
  if (brandAliases.has(normalized)) return brandAliases.get(normalized);
  if (upperCaseBrands.has(normalized)) return normalized;
  return normalized
    .toLowerCase()
    .split(/([\s-]+)/)
    .map((part) => (/^[\s-]+$/.test(part) ? part : `${part.charAt(0).toUpperCase()}${part.slice(1)}`))
    .join("");
}

function inferBrand(tags, title) {
  const candidates = tags
    .map((tag) => tag.toUpperCase())
    .filter((tag) => !categoryAndMarketingTags.has(tag));

  if (!candidates.length) return "";

  const normalizedTitle = text(title).toUpperCase();
  const titleMatch = candidates.find((candidate) => {
    const candidateWords = candidate.replace(/[^A-Z0-9]+/g, " ").trim();
    const titleWords = normalizedTitle.replace(/[^A-Z0-9]+/g, " ").trim();
    return titleWords.startsWith(candidateWords) || titleWords.startsWith(candidateWords.split(" ")[0]);
  });

  return titleCaseBrand(titleMatch || candidates[candidates.length - 1]);
}

function inferCategory(sourceCategory, tags) {
  const existing = text(sourceCategory);
  if (existing && existing.toLowerCase() !== "uncategorized") return existing;

  for (const [tag, category] of categoryRules) {
    if (tags.some((item) => item.toUpperCase() === tag)) return category;
  }

  return "Uncategorized";
}

const csvText = await fs.readFile(sourcePath, "utf8");
const sourceWorkbook = await Workbook.fromCSV(csvText, { sheetName: "Shopify Export" });
const sourceSheet = sourceWorkbook.worksheets.items[0];
const values = sourceSheet.getUsedRange().values;
const sourceHeaders = values[0].map(text);
const headerIndex = new Map(sourceHeaders.map((header, index) => [header, index]));
const sourceRows = values.slice(1);

function get(row, header) {
  return row[headerIndex.get(header)];
}

const headers = [
  "Handle",
  "Title",
  "Description",
  "Brand",
  "Category",
  "Tags",
  "Status",
  "SKU",
  "Source SKU",
  "Price",
  "Compare Price",
  "Cost Price",
  "Stock",
  "Barcode",
  "Weight",
  "Weight Unit",
  "Length",
  "Breadth",
  "Height",
  "Image",
  "Reorder Level",
  "Vendor",
  "Google Shopping / Google Product Category",
  "Google Shopping / MPN",
  "Google Shopping / Condition",
  "Color (product.metafields.shopify.color-pattern)",
  "Pen type (product.metafields.shopify.pen-type)",
];

const outputRows = [];
const brandCounts = new Map();
const categoryCounts = new Map();
const sourceSkuCounts = new Map();
const duplicateSkuOccurrences = new Map();
const reservedSkus = new Set();
let inferredCategoryCount = 0;
let blankBrandCount = 0;
let duplicateSkuRowsRemapped = 0;

for (const row of sourceRows) {
  const sourceSku = cleanedTextNumber(get(row, "Variant SKU"));
  if (!sourceSku) continue;
  sourceSkuCounts.set(sourceSku, (sourceSkuCounts.get(sourceSku) || 0) + 1);
  reservedSkus.add(sourceSku);
}

function uniqueSku(sourceSku) {
  if ((sourceSkuCounts.get(sourceSku) || 0) <= 1) return sourceSku;

  let occurrence = (duplicateSkuOccurrences.get(sourceSku) || 0) + 1;
  let candidate = `${sourceSku}-GC${String(occurrence).padStart(2, "0")}`;
  while (reservedSkus.has(candidate)) {
    occurrence += 1;
    candidate = `${sourceSku}-GC${String(occurrence).padStart(2, "0")}`;
  }
  duplicateSkuOccurrences.set(sourceSku, occurrence);
  reservedSkus.add(candidate);
  duplicateSkuRowsRemapped += 1;
  return candidate;
}

for (const row of sourceRows) {
  const tags = splitTags(get(row, "Tags"));
  const sourceCategory = text(get(row, "Product Category"));
  const category = inferCategory(sourceCategory, tags);
  const brand = inferBrand(tags, get(row, "Title"));
  const sourceSku = cleanedTextNumber(get(row, "Variant SKU"));

  if (category !== sourceCategory && sourceCategory.toLowerCase() === "uncategorized") inferredCategoryCount += 1;
  if (brand) brandCounts.set(brand, (brandCounts.get(brand) || 0) + 1);
  else blankBrandCount += 1;
  categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);

  outputRows.push([
    text(get(row, "Handle")),
    text(get(row, "Title")),
    text(get(row, "Body (HTML)")),
    brand,
    category,
    text(get(row, "Tags")),
    text(get(row, "Status")) || (text(get(row, "Published")).toLowerCase() === "true" ? "Active" : "Inactive"),
    uniqueSku(sourceSku),
    sourceSku,
    numberOrBlank(get(row, "Variant Price")),
    numberOrBlank(get(row, "Variant Compare At Price")),
    numberOrBlank(get(row, "Cost per item")),
    numberOrBlank(get(row, "Variant Inventory Qty")),
    cleanedTextNumber(get(row, "Variant Barcode")),
    numberOrBlank(get(row, "Variant Grams")),
    text(get(row, "Variant Weight Unit")),
    numberOrBlank(get(row, "LENGTH (product.metafields.custom.length)")),
    numberOrBlank(get(row, "WIDTH (product.metafields.custom.width)")),
    numberOrBlank(get(row, "HEIGHT (product.metafields.custom.height)")),
    text(get(row, "Variant Image")) || text(get(row, "Image Src")),
    10,
    text(get(row, "Vendor")),
    text(get(row, "Google Shopping / Google Product Category")),
    text(get(row, "Google Shopping / MPN")),
    text(get(row, "Google Shopping / Condition")),
    text(get(row, "Color (product.metafields.shopify.color-pattern)")),
    text(get(row, "Pen type (product.metafields.shopify.pen-type)")),
  ]);
}

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Products Import");
sheet.getRangeByIndexes(0, 0, outputRows.length + 1, headers.length).values = [headers, ...outputRows];

const headerRange = sheet.getRangeByIndexes(0, 0, 1, headers.length);
headerRange.format.fill = "#1F4E78";
headerRange.format.font = { bold: true, color: "#FFFFFF" };
headerRange.format.wrapText = true;
headerRange.format.rowHeight = 34;

const widths = [
  34, 46, 62, 20, 54, 44, 12, 18, 16, 13, 15, 13, 10, 18, 11, 12, 10, 10, 10, 62, 14, 18, 18, 16, 14, 20, 18,
];
widths.forEach((width, index) => {
  sheet.getRangeByIndexes(0, index, outputRows.length + 1, 1).format.columnWidth = width;
});

sheet.getRange(`J2:L${outputRows.length + 1}`).format.numberFormat = "#,##0.00";
sheet.getRange(`M2:M${outputRows.length + 1}`).format.numberFormat = "0";
sheet.getRange(`O2:O${outputRows.length + 1}`).format.numberFormat = "#,##0.00";
sheet.getRange(`Q2:S${outputRows.length + 1}`).format.numberFormat = "#,##0.00";
sheet.getRange(`U2:U${outputRows.length + 1}`).format.numberFormat = "0";
sheet.getRange(`A2:AA${outputRows.length + 1}`).format.wrapText = false;
sheet.getRange(`A2:AA${outputRows.length + 1}`).format.rowHeight = 20;
sheet.freezePanes.freezeRows(1);
sheet.tables.add(`A1:AA${outputRows.length + 1}`, true, "GoldenCreationProducts");

await fs.mkdir(outputDir, { recursive: true });
const exported = await SpreadsheetFile.exportXlsx(workbook);
await exported.save(outputPath);
const savedWorkbook = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));
const savedSheet = savedWorkbook.worksheets.getItem("Products Import");
const savedRange = savedSheet.getUsedRange();
const savedValues = savedRange.values;
const savedSkuIndex = savedValues[0].map(text).indexOf("SKU");
const savedSkuCounts = new Map();
savedValues.slice(1).forEach((row) => {
  const sku = text(row[savedSkuIndex]);
  if (sku) savedSkuCounts.set(sku, (savedSkuCounts.get(sku) || 0) + 1);
});

const inspect = await workbook.inspect({
  kind: "table",
  range: "Products Import!A1:AA6",
  include: "values,formulas",
  tableMaxRows: 6,
  tableMaxCols: 27,
});
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "final formula error scan",
});
const preview = await workbook.render({
  sheetName: "Products Import",
  range: "A1:I18",
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const sortedBrands = [...brandCounts.entries()].sort((a, b) => b[1] - a[1]);
const sortedCategories = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]);
const summary = {
  sourcePath,
  outputPath,
  sourceRows: sourceRows.length,
  outputRows: outputRows.length,
  columns: headers.length,
  savedWorkbookRange: savedRange.address,
  duplicateSkuGroups: [...sourceSkuCounts.values()].filter((count) => count > 1).length,
  duplicateSkuRowsRemapped,
  remainingDuplicateSkuGroups: [...savedSkuCounts.values()].filter((count) => count > 1).length,
  inferredCategoryCount,
  blankBrandCount,
  uniqueBrands: sortedBrands.length,
  topBrands: sortedBrands.slice(0, 25),
  topCategories: sortedCategories.slice(0, 25),
  inspect: inspect.ndjson,
  formulaErrors: errors.ndjson,
};
await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
console.log(JSON.stringify(summary, null, 2));
