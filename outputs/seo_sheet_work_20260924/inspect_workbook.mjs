import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const input = await FileBlob.load("source.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);

await fs.mkdir("verified", { recursive: true });

const summary = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 30000,
  tableMaxRows: 6,
  tableMaxCols: 12,
  tableMaxCellChars: 120,
});
console.log(summary.ndjson);

const sheetList = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 10000,
});
console.log(sheetList.ndjson);

const firstSheet = workbook.worksheets.getItemAt(0);
const preview = await workbook.render({
  sheetName: firstSheet.name,
  range: "A1:I12",
  scale: 1,
  format: "png",
});
await fs.writeFile("verified/source_first_sheet.png", new Uint8Array(await preview.arrayBuffer()));
