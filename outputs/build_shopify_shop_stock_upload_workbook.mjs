import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const inputPath = "D:/lekhanmart-backend-frontend-hostinger/outputs/shopify_shop_stock_upload_data.json";
const outputDir = "D:/lekhanmart-backend-frontend-hostinger/outputs/shopify_shop_stock_upload_artifact";
const desktopOutput = "C:/Users/My-PC-Win10/Desktop/Golden Creation/Stock Reconcilation Works/Shopify Upload - Shop Stock Completed Products 04 Sep 2026.xlsx";
const projectOutput = path.join(outputDir, "Shopify Upload - Shop Stock Completed Products 04 Sep 2026.xlsx");

function colLetter(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
}

function writeTable(sheet, headers, rows, options = {}) {
  const values = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? null))];
  const rowCount = values.length;
  const colCount = headers.length;
  sheet.getRangeByIndexes(0, 0, rowCount, colCount).values = values;
  sheet.freezePanes.freezeRows(1);
  sheet.showGridLines = false;

  const headerRange = sheet.getRangeByIndexes(0, 0, 1, colCount);
  headerRange.format.fill.color = options.headerColor ?? "#1F4E78";
  headerRange.format.font.color = "#FFFFFF";
  headerRange.format.font.bold = true;
  headerRange.format.wrapText = true;
  headerRange.format.verticalAlignment = "center";

  const used = sheet.getRangeByIndexes(0, 0, rowCount, colCount);
  used.format.borders = { preset: "all", style: "thin", color: "#D9E2F3" };
  used.format.verticalAlignment = "top";
  used.format.wrapText = true;

  return { rowCount, colCount };
}

const payload = JSON.parse(await fs.readFile(inputPath, "utf8"));
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(path.dirname(desktopOutput), { recursive: true });

const workbook = Workbook.create();
const uploadSheet = workbook.worksheets.add("Shopify Upload");
const uploadRows = payload.upload_rows.map((row) => {
  const out = {};
  for (const header of payload.template_headers) out[header] = row[header] ?? null;
  return out;
});
const uploadSize = writeTable(uploadSheet, payload.template_headers, uploadRows);
uploadSheet.tabColor = "#5B9BD5";
if (uploadSize.rowCount > 1) {
  uploadSheet.getRangeByIndexes(1, 0, uploadSize.rowCount - 1, uploadSize.colCount).format.wrapText = false;
  uploadSheet.getRangeByIndexes(1, 0, uploadSize.rowCount - 1, uploadSize.colCount).format.rowHeight = 18;
}

const uploadWidths = {
  1: 28, 2: 46, 3: 60, 4: 18, 5: 18, 6: 24, 7: 18, 8: 24, 9: 12,
  10: 16, 11: 18, 12: 16, 13: 18, 14: 16, 15: 18, 16: 14, 17: 16,
  18: 14, 19: 12, 20: 14, 21: 20, 22: 18, 23: 45, 24: 14, 25: 35,
  26: 20, 27: 20, 28: 20, 29: 45, 30: 16, 31: 14, 32: 14, 33: 12, 34: 18,
};
for (const [index, width] of Object.entries(uploadWidths)) {
  uploadSheet.getRangeByIndexes(0, Number(index) - 1, uploadSize.rowCount, 1).format.columnWidth = width;
}
const skuCol = payload.template_headers.indexOf("Variant SKU") + 1;
const websiteStockCol = payload.template_headers.indexOf("Variant Inventory Qty") + 1;
const warehouseCol = payload.template_headers.indexOf("Warehouse Stock") + 1;
const shopStockCol = payload.template_headers.indexOf("Shop Stock") + 1;
if (uploadSize.rowCount > 1) {
  uploadSheet.getRange(`${colLetter(skuCol)}2:${colLetter(skuCol)}${uploadSize.rowCount}`).format.numberFormat = [["@"]];
  for (const col of [websiteStockCol, warehouseCol, shopStockCol]) {
    uploadSheet.getRange(`${colLetter(col)}2:${colLetter(col)}${uploadSize.rowCount}`).format.numberFormat = [["#,##0"]];
  }
}

const summarySheet = workbook.worksheets.add("Upload Summary");
const summaryRows = Object.entries(payload.summary.brand_counts).map(([brand, count]) => ({
  Brand: brand,
  "Upload Rows": count,
}));
summaryRows.push({ Brand: "Total", "Upload Rows": payload.summary.upload_row_count });
writeTable(summarySheet, ["Brand", "Upload Rows"], summaryRows, { headerColor: "#70AD47" });
summarySheet.getRange("A:A").format.columnWidth = 24;
summarySheet.getRange("B:B").format.columnWidth = 16;
summarySheet.getRange(`B2:B${summaryRows.length + 1}`).format.numberFormat = [["#,##0"]];
summarySheet.getRange(`A${summaryRows.length + 1}:B${summaryRows.length + 1}`).format.font.bold = true;
summarySheet.getRange("D1:E7").values = [
  ["Field", "Value"],
  ["Included rows", payload.summary.upload_row_count],
  ["Excluded rows", payload.summary.excluded_count],
  ["High confidence", payload.summary.confidence_counts.High ?? 0],
  ["Medium confidence", payload.summary.confidence_counts.Medium ?? 0],
  ["Low confidence", payload.summary.confidence_counts.Low ?? 0],
  ["Source", "Shop Stock Reconciliation"],
];
summarySheet.getRange("D1:E1").format.fill.color = "#70AD47";
summarySheet.getRange("D1:E1").format.font.color = "#FFFFFF";
summarySheet.getRange("D1:E1").format.font.bold = true;
summarySheet.getRange("D:E").format.columnWidth = 24;
summarySheet.tabColor = "#70AD47";

const excludedSheet = workbook.worksheets.add("Excluded");
writeTable(excludedSheet, ["Brand", "SKU", "Reason"], payload.excluded, { headerColor: "#C00000" });
excludedSheet.getRange("A:A").format.columnWidth = 22;
excludedSheet.getRange("B:B").format.columnWidth = 14;
excludedSheet.getRange("C:C").format.columnWidth = 70;
excludedSheet.tabColor = "#C00000";

const check = await workbook.inspect({
  kind: "table",
  sheetId: "Shopify Upload",
  range: "A1:S12",
  include: "values",
  tableMaxRows: 12,
  tableMaxCols: 19,
  tableMaxCellChars: 80,
  maxChars: 4000,
});
console.log(check.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const renderTargets = [
  { sheetName: "Shopify Upload", range: "A1:S40" },
  { sheetName: "Upload Summary", range: "A1:E12" },
  { sheetName: "Excluded", range: "A1:C14" },
];
for (const target of renderTargets) {
  const preview = await workbook.render({ sheetName: target.sheetName, range: target.range, scale: 1, format: "png" });
  const bytes = new Uint8Array(await preview.arrayBuffer());
  await fs.writeFile(path.join(outputDir, `${target.sheetName}.png`), bytes);
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(projectOutput);
await output.save(desktopOutput);

console.log(JSON.stringify({
  projectOutput,
  desktopOutput,
  uploadRows: payload.summary.upload_row_count,
  excludedRows: payload.summary.excluded_count,
  brandCounts: payload.summary.brand_counts,
  confidenceCounts: payload.summary.confidence_counts,
}, null, 2));
