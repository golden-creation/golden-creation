import fs from "node:fs/promises";
import path from "node:path";
import {
  SpreadsheetFile,
  Workbook,
} from "file:///D:/lekhanmart-backend-frontend-hostinger/.codex-spreadsheet-work/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const outputDir = "D:/lekhanmart-backend-frontend-hostinger/outputs/shop_stock_from_images_20260817";
const inputJson = path.join(outputDir, "shop_stock_matched.json");
const outputXlsx = path.join(outputDir, "shop_stock_extracted_from_images.xlsx");

const data = JSON.parse(await fs.readFile(inputJson, "utf8"));
const workbook = Workbook.create();

const allColumns = [
  "Source Image",
  "Image Line",
  "Raw Handwritten Text",
  "Transcribed Product Name",
  "Read MRP/Price",
  "Original Count Expression",
  "Normalized Shop Qty",
  "Detected Count Unit",
  "Transcription Confidence",
  "Corrected Website Product Name",
  "SKU",
  "Suggested SKU",
  "Suggested Website Product Name",
  "Suggested Brand",
  "Suggested Category",
  "Suggested Website Price",
  "Match Status",
  "Listing Issue Flag",
  "Variant Terms",
  "Match Reason",
  "Matched Code Tokens",
  "Match Score",
  "Score Gap",
  "Candidates",
  "Notes",
];

const statusRank = {
  Matched: 1,
  "Matched - Variant Review": 2,
  "Needs Review": 3,
};

function asMatrix(rows, columns) {
  const sorted = [...rows].sort((a, b) => {
    const rankA = statusRank[a["Match Status"]] ?? 9;
    const rankB = statusRank[b["Match Status"]] ?? 9;
    if (rankA !== rankB) return rankA - rankB;
    const image = String(a["Source Image"]).localeCompare(String(b["Source Image"]));
    if (image !== 0) return image;
    return Number(a["Image Line"] || 0) - Number(b["Image Line"] || 0);
  });
  return [columns, ...sorted.map((row) => columns.map((column) => row[column] ?? ""))];
}

function styleSheet(sheet, rowCount, colCount, widths = {}) {
  if (rowCount <= 0 || colCount <= 0) return;
  const header = sheet.getRangeByIndexes(0, 0, 1, colCount);
  header.format.fill = { color: "#1F4E78" };
  header.format.font = { bold: true, color: "#FFFFFF" };
  header.format.wrapText = true;
  sheet.freezePanes.freezeRows(1);
  const used = sheet.getRangeByIndexes(0, 0, rowCount, colCount);
  used.format.borders = { preset: "all", style: "thin", color: "#D9E2F3" };
  used.format.wrapText = true;
  Object.entries(widths).forEach(([index, width]) => {
    sheet.getRangeByIndexes(0, Number(index), rowCount, 1).format.columnWidth = width;
  });
}

function addRowsSheet(name, rows, columns = allColumns) {
  const sheet = workbook.worksheets.add(name);
  const matrix = asMatrix(rows, columns);
  sheet.getRangeByIndexes(0, 0, matrix.length, columns.length).values = matrix;
  styleSheet(sheet, matrix.length, columns.length, {
    0: 18,
    1: 10,
    2: 34,
    3: 34,
    5: 18,
    6: 14,
    9: 42,
    10: 16,
    11: 16,
    12: 42,
    16: 20,
    17: 34,
    23: 80,
    24: 36,
  });
  if (columns.includes("Normalized Shop Qty")) {
    const col = columns.indexOf("Normalized Shop Qty");
    sheet.getRangeByIndexes(1, col, Math.max(matrix.length - 1, 1), 1).format.numberFormat = [["0.00"]];
  }
  if (columns.includes("Match Score")) {
    const col = columns.indexOf("Match Score");
    sheet.getRangeByIndexes(1, col, Math.max(matrix.length - 1, 1), 1).format.numberFormat = [["0.0"]];
  }
}

function addSummarySheet() {
  const sheet = workbook.worksheets.add("Summary");
  const counts = new Map(data.summary.map(([metric, value]) => [metric, value]));
  const summaryRows = [
    ["Shop stock extraction from handwritten images", ""],
    ["Generated workbook", outputXlsx],
    ["Source images", counts.get("Source images") ?? ""],
    ["Transcribed rows", counts.get("Transcribed rows") ?? ""],
    ["Clean matched rows with SKU", counts.get("Matched rows with SKU") ?? ""],
    ["Matched but variant/listing review", counts.get("Matched rows requiring variant/listing review") ?? ""],
    ["Needs review rows", counts.get("Needs review rows") ?? ""],
    ["High confidence transcription rows", counts.get("Rows with high confidence transcription") ?? ""],
    ["Medium confidence transcription rows", counts.get("Rows with medium confidence transcription") ?? ""],
    ["Low confidence transcription rows", counts.get("Rows with low confidence transcription") ?? ""],
    ["Website reference file", counts.get("Website reference file") ?? ""],
    ["Warehouse reference file", counts.get("Prior warehouse reconciliation reference") ?? ""],
    ["SKU rule", counts.get("Rule") ?? ""],
    ["Quantity rule", counts.get("Quantity rule") ?? ""],
    [
      "Scope note",
      "Only the main visible handwritten page in each attached image was transcribed. Partial background-paper snippets were not treated as separate counted rows.",
    ],
  ];
  sheet.getRangeByIndexes(0, 0, summaryRows.length, 2).values = summaryRows;
  styleSheet(sheet, summaryRows.length, 2, { 0: 36, 1: 120 });
  sheet.getRange("A1:B1").format.fill = { color: "#5B9BD5" };
}

addSummarySheet();
addRowsSheet("Shop_Stock_All", data.all_rows);
addRowsSheet("Matched_SKU", data.matched);
addRowsSheet("Variant_Review", data.variant_review);
addRowsSheet("Needs_Review", data.review);

const imageColumns = ["Source Image", "Rows Transcribed", "Matched", "Variant Review", "Needs Review"];
const imageSheet = workbook.worksheets.add("Image_Summary");
const imageMatrix = [
  imageColumns,
  ...data.image_summary.map((row) => imageColumns.map((column) => row[column] ?? "")),
];
imageSheet.getRangeByIndexes(0, 0, imageMatrix.length, imageColumns.length).values = imageMatrix;
styleSheet(imageSheet, imageMatrix.length, imageColumns.length, { 0: 24, 1: 18, 2: 12, 3: 16, 4: 14 });

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputXlsx);
console.log(outputXlsx);
