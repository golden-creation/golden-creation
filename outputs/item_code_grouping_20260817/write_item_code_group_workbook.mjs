import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "D:/lekhanmart-backend-frontend-hostinger/outputs/item_code_grouping_20260817";
const finalDir = "C:/Users/My-PC-Win10/Desktop/Golden Creation/Stock Reconcilation Works";
const inputJson = path.join(outputDir, "item_code_groups.json");
const outputXlsx = path.join(finalDir, "shopify_products_grouped_by_item_code.xlsx");
const previewPng = path.join(outputDir, "item_code_grouping_summary_preview.png");

const data = JSON.parse(await fs.readFile(inputJson, "utf8"));
const workbook = Workbook.create();

const productColumns = [
  "Item Code Range",
  "Item Code",
  "Raw Item Code / Handle",
  "Variant SKU",
  "Title",
  "Brand",
  "Product Category",
  "Type",
  "Option Values",
  "Variant Price",
  "Variant Inventory Qty",
  "Status",
  "Tags",
  "Source Row",
];

const summaryColumns = [
  "Item Code Range",
  "Start Code",
  "End Code",
  "Product Rows",
  "Unique Handles",
  "Unique Variant SKUs",
  "First Product",
  "Last Product",
];

function writeMatrix(sheet, matrix) {
  sheet.getRangeByIndexes(0, 0, matrix.length, matrix[0].length).values = matrix;
}

function styleTable(sheet, rowCount, colCount, widths = {}) {
  const header = sheet.getRangeByIndexes(0, 0, 1, colCount);
  header.format.fill = { color: "#1F4E78" };
  header.format.font = { bold: true, color: "#FFFFFF" };
  header.format.wrapText = true;
  sheet.freezePanes.freezeRows(1);
  sheet.showGridLines = false;
  const used = sheet.getRangeByIndexes(0, 0, rowCount, colCount);
  used.format.borders = {
    insideHorizontal: { style: "thin", color: "#D9E2F3" },
    top: { style: "thin", color: "#B4C6E7" },
    bottom: { style: "thin", color: "#B4C6E7" },
  };
  used.format.wrapText = true;
  for (const [colIndex, width] of Object.entries(widths)) {
    sheet.getRangeByIndexes(0, Number(colIndex), rowCount, 1).format.columnWidthPx = width;
  }
}

function addProductSheet(name, rows) {
  const sheet = workbook.worksheets.add(name);
  const matrix = [productColumns, ...rows.map((row) => productColumns.map((column) => row[column] ?? ""))];
  writeMatrix(sheet, matrix);
  styleTable(sheet, matrix.length, productColumns.length, {
    0: 130,
    1: 95,
    2: 150,
    3: 150,
    4: 360,
    5: 140,
    6: 190,
    7: 190,
    8: 150,
    9: 100,
    10: 125,
    11: 100,
    12: 260,
    13: 80,
  });
  sheet.getRangeByIndexes(1, 1, Math.max(matrix.length - 1, 1), 1).format.numberFormat = [["0"]];
  sheet.getRangeByIndexes(1, 9, Math.max(matrix.length - 1, 1), 1).format.numberFormat = [["#,##0.00"]];
  sheet.getRangeByIndexes(1, 10, Math.max(matrix.length - 1, 1), 1).format.numberFormat = [["#,##0"]];
}

function addSummarySheet() {
  const sheet = workbook.worksheets.add("Summary");
  const summaryTop = [
    ["Shopify Products Grouped by Item Code", ""],
    ["Source file", data.source_file],
    ["Total source rows", data.total_rows],
    ["Rows with numeric leading item code", data.numeric_item_code_rows],
    ["Rows without numeric leading item code", data.non_numeric_item_code_rows],
    ["Range rule", data.range_rule],
  ];
  sheet.getRange("A1:B6").values = summaryTop;
  sheet.getRange("A1:H1").format.fill = { color: "#1F4E78" };
  sheet.getRange("A1:H1").format.font = { bold: true, color: "#FFFFFF", size: 14 };
  sheet.getRange("A1:H1").format.rowHeightPx = 28;
  sheet.getRange("A1:H1").format.wrapText = false;
  sheet.getRange("A2:H6").format.wrapText = true;
  sheet.getRange("A2:H6").format.borders = { preset: "outside", style: "thin", color: "#B4C6E7" };
  sheet.getRange("A2:A6").format.font = { bold: true };
  sheet.getRange("A1:A20").format.columnWidthPx = 220;
  sheet.getRange("B1:B20").format.columnWidthPx = 760;
  ["C", "D", "E", "F", "G", "H"].forEach((col) => {
    sheet.getRange(`${col}1:${col}20`).format.columnWidthPx = 120;
  });
  sheet.showGridLines = false;

  const startRow = 8;
  const summaryMatrix = [
    summaryColumns,
    ...data.summary_rows.map((row) => summaryColumns.map((column) => row[column] ?? "")),
  ];
  sheet.getRangeByIndexes(startRow - 1, 0, summaryMatrix.length, summaryColumns.length).values = summaryMatrix;
  const header = sheet.getRangeByIndexes(startRow - 1, 0, 1, summaryColumns.length);
  header.format.fill = { color: "#5B9BD5" };
  header.format.font = { bold: true, color: "#FFFFFF" };
  const tableRange = sheet.getRangeByIndexes(startRow - 1, 0, summaryMatrix.length, summaryColumns.length);
  tableRange.format.borders = {
    insideHorizontal: { style: "thin", color: "#D9E2F3" },
    top: { style: "thin", color: "#B4C6E7" },
    bottom: { style: "thin", color: "#B4C6E7" },
  };
  tableRange.format.wrapText = true;
  [140, 100, 100, 110, 120, 145, 360, 360].forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, startRow + summaryMatrix.length, 1).format.columnWidthPx = width;
  });
  sheet.getRangeByIndexes(startRow, 1, summaryMatrix.length - 1, 5).format.numberFormat = [["#,##0"]];
  sheet.freezePanes.freezeRows(startRow);
}

addSummarySheet();

const rangeSummary = workbook.worksheets.add("Range_Summary");
const rangeSummaryMatrix = [
  summaryColumns,
  ...data.summary_rows.map((row) => summaryColumns.map((column) => row[column] ?? "")),
];
writeMatrix(rangeSummary, rangeSummaryMatrix);
styleTable(rangeSummary, rangeSummaryMatrix.length, summaryColumns.length, {
  0: 140,
  1: 100,
  2: 100,
  3: 110,
  4: 120,
  5: 145,
  6: 360,
  7: 360,
});

addProductSheet("All_Grouped", data.all_rows);

const orderedRanges = [...data.summary_rows].map((row) => row["Item Code Range"]);
for (const rangeName of orderedRanges) {
  const sheetName = `R_${rangeName.replace("-", "_")}`;
  addProductSheet(sheetName, data.groups[rangeName] ?? []);
}

const summaryPreview = await workbook.render({
  sheetName: "Summary",
  range: "A1:H14",
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPng, new Uint8Array(await summaryPreview.arrayBuffer()));

const summaryInspect = await workbook.inspect({
  kind: "table",
  sheetId: "Summary",
  range: "A1:H14",
  tableMaxRows: 14,
  tableMaxCols: 8,
  maxChars: 4000,
});
console.log(summaryInspect.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  maxChars: 1000,
});
console.log(errors.ndjson);

await fs.mkdir(finalDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputXlsx);
console.log(outputXlsx);
