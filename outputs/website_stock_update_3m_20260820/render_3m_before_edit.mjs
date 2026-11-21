import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const targetFile = "C:/Users/My-PC-Win10/Downloads/3M Products for Website Stock.xlsx";
const outputPng = "D:/lekhanmart-backend-frontend-hostinger/outputs/website_stock_update_3m_20260820/3m_before_edit.png";

const input = await FileBlob.load(targetFile);
const workbook = await SpreadsheetFile.importXlsx(input);
const inspect = await workbook.inspect({
  kind: "table",
  sheetId: "Products",
  range: "A1:T24",
  tableMaxRows: 8,
  tableMaxCols: 20,
  maxChars: 5000,
});
console.log(inspect.ndjson);
const render = await workbook.render({
  sheetName: "Products",
  range: "A1:T24",
  scale: 1,
  format: "png",
});
await fs.writeFile(outputPng, new Uint8Array(await render.arrayBuffer()));
console.log(outputPng);
