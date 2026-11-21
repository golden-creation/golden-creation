import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const root = 'D:/lekhanmart-backend-frontend-hostinger/outputs/sheaffer_mrp_20260912';
const data = JSON.parse(await fs.readFile(`${root}/matches.json`,'utf8'));
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(data.source));
const sh = wb.worksheets.getItem(data.sheet);
if(process.argv.includes('--preview')) {
  console.log((await wb.inspect({kind:'region',sheetId:data.sheet,range:'A1:D8',maxChars:2000,tableMaxRows:8,tableMaxCols:4})).ndjson);
  const pic = await wb.render({sheetName:data.sheet,range:'A1:D14',scale:1.5,format:'png'});
  await fs.writeFile(`${root}/before.png`,new Uint8Array(await pic.arrayBuffer()));
} else {
  for(const x of data.rows.filter(r=>r.status==='Updated')) sh.getRange(`C${x.row}`).values=[[x.new]];
  wb.recalculate();
  console.log((await wb.inspect({kind:'region',sheetId:data.sheet,range:'A51:C62',maxChars:2500,tableMaxRows:12,tableMaxCols:3})).ndjson);
  const pic = await wb.render({sheetName:data.sheet,range:'A117:C126',scale:1.5,format:'png'});
  await fs.writeFile(`${root}/after.png`,new Uint8Array(await pic.arrayBuffer()));
  await (await SpreadsheetFile.exportXlsx(wb)).save(`${root}/authored.xlsx`);
}
