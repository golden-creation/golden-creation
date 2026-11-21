import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const input = await FileBlob.load("source.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);

const summary = await workbook.inspect({
  kind: "workbook,sheet,table",
  tableMaxRows: 8,
  tableMaxCols: 16,
  tableMaxCellChars: 120,
  maxChars: 20000,
});

console.log(summary.ndjson);
