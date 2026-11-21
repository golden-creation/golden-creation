import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const targetSheets = [
  "3M Products",
  "Addgel Products",
  "Adnet Products",
  "Adwell Products",
  "Artzilla Products",
  "Baoke Products",
];

const input = await FileBlob.load("lekhanmart_seo_filled_6_category_sheets.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);

let totalRows = 0;
let missing = 0;
const sheetCounts = [];

for (const sheetName of targetSheets) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const values = sheet.getUsedRange(true).values;
  const rows = values.slice(1).filter((row) => row?.[0] && row?.[1]);
  totalRows += rows.length;
  const missingRows = [];
  rows.forEach((row, idx) => {
    const missingCols = [2, 3, 4, 5, 8].filter((col) => !row[col]);
    if (missingCols.length) missingRows.push({ row: idx + 2, missingCols });
  });
  missing += missingRows.length;
  sheetCounts.push({ sheetName, rows: rows.length, missingRows });
}

const sources = workbook.worksheets.getItem("Research Sources").getUsedRange(true).values;

console.log(JSON.stringify({
  totalRows,
  missing,
  sheetCounts,
  sourceRows: sources.length - 1,
}, null, 2));
