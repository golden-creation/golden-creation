import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const inputPath = "D:/lekhanmart-backend-frontend-hostinger/outputs/shop_stock_reconciliation_data.json";
const outputDir = "D:/lekhanmart-backend-frontend-hostinger/outputs/shop_stock_reconciliation_artifact";
const projectOutput = path.join(outputDir, "Shop Stock Reconciliation - 3M Adwell Artzilla Beetel Belkin Brustro Camlin Kaweco.xlsx");
const downloadsOutput = "C:/Users/My-PC-Win10/Downloads/Shop Stock Reconciliation - 3M Adwell Artzilla Beetel Belkin Brustro Camlin Kaweco.xlsx";

const colLetters = (n) => {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
};

const safeValue = (v) => (v === undefined ? null : v);

function matrix(headers, rows, keys) {
  return [headers, ...rows.map((row) => keys.map((key) => safeValue(row[key])))];
}

function writeSheet(sheet, headers, rows, keys, widths = []) {
  const values = matrix(headers, rows, keys);
  const rowCount = values.length;
  const colCount = headers.length;
  sheet.getRangeByIndexes(0, 0, rowCount, colCount).values = values;
  sheet.freezePanes.freezeRows(1);
  sheet.showGridLines = false;

  const headerRange = sheet.getRangeByIndexes(0, 0, 1, colCount);
  headerRange.format.fill.color = "#1F4E78";
  headerRange.format.font.color = "#FFFFFF";
  headerRange.format.font.bold = true;
  headerRange.format.wrapText = true;
  headerRange.format.verticalAlignment = "center";

  const used = sheet.getRangeByIndexes(0, 0, rowCount, colCount);
  used.format.borders = { preset: "all", style: "thin", color: "#D9E2F3" };
  used.format.verticalAlignment = "top";
  used.format.wrapText = true;

  widths.forEach((width, index) => {
    if (width) sheet.getRangeByIndexes(0, index, rowCount, 1).format.columnWidth = width;
  });

  if (rowCount > 1) {
    const dataRange = sheet.getRangeByIndexes(1, 0, rowCount - 1, colCount);
    dataRange.format.font.color = "#1F1F1F";
  }
}

function addMainConditionalFormats(sheet, rowCount) {
  if (rowCount < 2) return;
  const statusRange = sheet.getRange(`G2:G${rowCount}`);
  statusRange.conditionalFormats.add("containsText", {
    text: "Website SKU not found",
    format: { fill: { color: "#FCE4D6" }, font: { color: "#9C0006", bold: true } },
  });
  const confidenceRange = sheet.getRange(`H2:H${rowCount}`);
  confidenceRange.conditionalFormats.add("containsText", {
    text: "Medium",
    format: { fill: { color: "#FFF2CC" }, font: { color: "#7F6000" } },
  });
  confidenceRange.conditionalFormats.add("containsText", {
    text: "Low",
    format: { fill: { color: "#F4CCCC" }, font: { color: "#990000", bold: true } },
  });
}

function addNumberFormats(sheet, rowCount, numericCols) {
  if (rowCount < 2) return;
  for (const col of numericCols) {
    sheet.getRange(`${col}2:${col}${rowCount}`).format.numberFormat = [["#,##0"]];
  }
}

const payload = JSON.parse(await fs.readFile(inputPath, "utf8"));
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();

const mainHeaders = [
  "Brand",
  "SKU",
  "Website Product Name",
  "Website Stock",
  "Shop Stock",
  "Website Minus Shop",
  "Match Status",
  "Confidence",
  "Website Stock Source",
  "Source Page",
  "Source Row(s)",
  "Extraction Method",
  "Scan Notes",
  "Busy Item Details",
];
const mainKeys = [
  "Brand",
  "SKU",
  "Website Product Name",
  "Website Stock",
  "Shop Stock",
  "Website Minus Shop",
  "Match Status",
  "Confidence",
  "Website Stock Source",
  "Source Page",
  "Source Row(s)",
  "Extraction Method",
  "Scan Notes",
  "Busy Item Details",
];
const mainSheet = workbook.worksheets.add("Shop Stock");
writeSheet(mainSheet, mainHeaders, payload.rows, mainKeys, [18, 13, 42, 14, 12, 16, 20, 12, 34, 12, 24, 28, 42, 58]);
addNumberFormats(mainSheet, payload.rows.length + 1, ["D", "E", "F"]);
addMainConditionalFormats(mainSheet, payload.rows.length + 1);
mainSheet.tabColor = "#5B9BD5";

const reviewHeaders = ["Brand", "SKU", "Website Product Name", "Source Page", "Source Row(s)", "Reason", "Busy Item Details"];
const reviewRows = payload.needs_review.map((row) => ({
  Brand: row.brand,
  SKU: row.sku,
  "Website Product Name": row.website_product_name,
  "Source Page": row.source_page,
  "Source Row(s)": row.source_rows,
  Reason: row.reason,
  "Busy Item Details": row.busy_item_details,
}));
const reviewSheet = workbook.worksheets.add("Needs Review");
writeSheet(reviewSheet, reviewHeaders, reviewRows, reviewHeaders, [18, 13, 42, 12, 18, 54, 58]);
if (reviewRows.length) {
  reviewSheet.getRange(`A2:${colLetters(reviewHeaders.length)}${reviewRows.length + 1}`).format.fill.color = "#FFF2CC";
}
reviewSheet.tabColor = "#FFC000";

const skippedHeaders = ["Brand", "SKU", "Source Page", "Source Row(s)", "Reason"];
const skippedRows = payload.skipped.map((row) => ({
  Brand: row.brand,
  SKU: row.sku,
  "Source Page": row.source_page,
  "Source Row(s)": row.source_rows,
  Reason: row.reason,
}));
const skippedSheet = workbook.worksheets.add("Skipped-Ignored");
writeSheet(skippedSheet, skippedHeaders, skippedRows, skippedHeaders, [18, 13, 12, 20, 70]);
skippedSheet.tabColor = "#A5A5A5";

const summaryHeaders = ["Brand", "Extracted SKU Rows", "Total Shop Stock", "Medium/Low Confidence Rows", "Website SKU Not Found"];
const summarySheet = workbook.worksheets.add("Summary");
writeSheet(summarySheet, summaryHeaders, payload.summary, summaryHeaders, [24, 80, 18, 26, 22]);
addNumberFormats(summarySheet, payload.summary.length + 1, ["B", "C", "D", "E"]);
summarySheet.tabColor = "#70AD47";

const notes = [
  ["Source PDF", payload.source_pdf],
  ["Context", payload.created_for],
  ["Extraction rule", "Only printed table rows with handwritten counts or checked Cl.Qty marks were included."],
  ["Skipped rule", "Camlin rows marked SKIP and handwritten-only product lines were excluded."],
  ["Website stock source", "Brand updated website-stock workbooks were used where available; Beetel Panasonic uses full website export plus Busy Cl.Qty fallback because no updated Beetel workbook was found."],
];
const startRow = payload.summary.length + 4;
summarySheet.getRangeByIndexes(startRow - 1, 0, notes.length, 2).values = notes;
summarySheet.getRange(`A${startRow}:A${startRow + notes.length - 1}`).format.font.bold = true;
summarySheet.getRange(`A${startRow}:B${startRow + notes.length - 1}`).format.borders = { preset: "all", style: "thin", color: "#D9E2F3" };
summarySheet.getRange(`A${startRow}:B${startRow + notes.length - 1}`).format.wrapText = true;

const mainInspect = await workbook.inspect({
  kind: "table",
  sheetId: "Shop Stock",
  range: "A1:N12",
  include: "values",
  tableMaxRows: 12,
  tableMaxCols: 14,
  maxChars: 5000,
});
console.log(mainInspect.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

for (const sheetName of ["Shop Stock", "Needs Review", "Skipped-Ignored", "Summary"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  const bytes = new Uint8Array(await preview.arrayBuffer());
  await fs.writeFile(path.join(outputDir, `${sheetName}.png`), bytes);
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(projectOutput);
await output.save(downloadsOutput);

console.log(JSON.stringify({
  projectOutput,
  downloadsOutput,
  rows: payload.rows.length,
  needsReview: payload.needs_review.length,
  skipped: payload.skipped.length,
  summary: payload.summary,
}, null, 2));
