import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const targetFile = "C:/Users/My-PC-Win10/Downloads/3M Products for Website Stock.xlsx";
const tempFile = "D:/lekhanmart-backend-frontend-hostinger/outputs/website_stock_update_3m_20260820/artifact_export_test.xlsx";

const input = await FileBlob.load(targetFile);
const workbook = await SpreadsheetFile.importXlsx(input);
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(tempFile);
console.log(tempFile);
