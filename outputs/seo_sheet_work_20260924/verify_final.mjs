import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const targetSheets = [
  "3M Products",
  "Addgel Products",
  "Adnet Products",
  "Adwell Products",
  "Artzilla Products",
  "Baoke Products",
  "Belkin Products",
  "Bell Products",
  "Boya Products",
  "Brustro Products",
  "Camlin Products",
  "Casio Products",
  "Cello Products",
  "Century Products",
  "Corseca Products",
  "Cross Products",
  "Deli Products",
  "Digitek Products",
  "Duracell Products",
  "Elephant Products",
  "Epson Products",
];

const input = await FileBlob.load("final/Lekhanmart SEO - Completed Through Epson.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);
const sheets = workbook.worksheets.items.map((sheet) => sheet.name);

let totalRows = 0;
let totalMissingRows = 0;
const details = [];
for (const sheetName of targetSheets) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const values = sheet.getUsedRange(true).values;
  const headers = values[0] || [];
  const required = ["Description", "Keywords", "Submissions", "Tags", "Image SEO Status"].map((name) => headers.indexOf(name));
  const rows = values.slice(1).filter((row) => row?.[0] && row?.[1]);
  const missingRows = [];
  rows.forEach((row, idx) => {
    const missingCols = required
      .map((col, i) => ({ col, name: ["Description", "Keywords", "Submissions", "Tags", "Image SEO Status"][i] }))
      .filter((entry) => entry.col < 0 || !row[entry.col])
      .map((entry) => entry.name);
    if (missingCols.length) missingRows.push({ row: idx + 2, missingCols });
  });
  totalRows += rows.length;
  totalMissingRows += missingRows.length;
  details.push({ sheetName, rows: rows.length, missingRows: missingRows.slice(0, 5) });
}

console.log(JSON.stringify({
  workbookSheets: sheets.length,
  targetSheets: targetSheets.length,
  totalRows,
  totalMissingRows,
  details,
}, null, 2));
