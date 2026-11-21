import fs from 'node:fs/promises';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const root='D:/lekhanmart-backend-frontend-hostinger/outputs/sheaffer_mrp_20260912/accountant_review';
const d=JSON.parse(await fs.readFile(`${root}/review_data.json`,'utf8'));
const w=Workbook.create();
const manual=w.worksheets.add('Manual Review');
const all=w.worksheets.add('All Matches');
const heads=['Source row','Item Code','Busy Name (unchanged)','Current MRP','Review issue','Specific reason','Accountant action','Approved MRP','Accountant notes','Catalog PDF pages','Single-pen reference prices','Original MRP'];
const rows=d.manual.map(r=>[r.row,r.sku,r.name,r.new,r.issue,r.review_reason,r.action,null,null,r.source_pages,r.single_prices,r.old]);
const logHeads=['Source row','Item Code','Busy Name (unchanged)','Original MRP','Current MRP','Price status','Review issue','Model reference','Pen type','Catalog PDF pages','Match or review reason','Accountant action'];
const logRows=d.records.map(r=>[r.row,r.sku,r.name,r.old,r.new,r.status,r.issue,r.model,r.kind,r.source_pages,r.review_reason,r.action]);

function layout(s,headers,rows,widths,title,summary){
  const end=rows.length+8;
  s.showGridLines=false;
  s.getRange(`A1:L${end}`).format.font={name:'Arial',size:10,color:'#202020'};
  s.getRange('A2').values=[[title]];
  s.getRange('A2').format.font={name:'Arial',size:15,bold:true,color:'#6F2035'};
  s.getRange('A3').values=[[summary]];
  s.getRange('A4').values=[['MRPs in INR. Source: SHEAFFER LIST - MRP Rechecked.xlsx; original SHEAFFER LIST.xlsx; Sheaffer Catalog.pdf.']];
  s.getRange('A5').values=[['NB = notebook; CCH = credit card holder; BCH = business card holder; TC = table clock; WL = accessory meaning unconfirmed.']];
  s.getRange('A6').values=[['Reference report, not a Busy import template. Page 9-11 gift sets and ICON bundles remain deferred.']];
  s.getRange('A7').values=[['Website export corroborates bundle names and selected pen types. Prices in names are unchanged; Current MRP is the import-file value.']];
  s.getRange('A3:L7').format.rowHeight=18;
  s.getRange('A4:L7').format.font={name:'Arial',size:9,color:'#555555'};
  s.getRange('A8:L8').values=[headers];
  s.getRange(`A9:L${end}`).values=rows;
  for(let i=0;i<widths.length;i++) s.getRangeByIndexes(0,i,end,1).format.columnWidth=widths[i];
  s.getRange('A8:L8').format={fill:'#6F2035',font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},wrapText:true,rowHeight:32,verticalAlignment:'center'};
  s.getRange(`A9:L${end}`).format.wrapText=true;
  s.getRange(`A9:L${end}`).format.verticalAlignment='top';
  s.getRange(`A9:L${end}`).format.rowHeight=96;
  const t=s.tables.add(`A8:L${end}`,true,s.name==='Manual Review'?'ManualReviewTable':'AllMatchTable');
  t.style='TableStyleLight1';
  t.showFilterButton=true;
  s.freezePanes.freezeRows(8);
  s.freezePanes.freezeColumns(3);
  s.getRange(`B9:B${end}`).setNumberFormat('@');
  return end;
}
const mEnd=layout(manual,heads,rows,[9,12,42,13,25,66,50,14,38,17,40,13],
  'Sheaffer MRP - Accountant Review','115 review entries: 112 prices unresolved, 2 item-code collisions, and 1 catalog-confirmed large reduction.');
manual.getRange(`D9:D${mEnd}`).setNumberFormat('#,##0');
manual.getRange(`H9:H${mEnd}`).setNumberFormat('#,##0');
manual.getRange(`L9:L${mEnd}`).setNumberFormat('#,##0');
manual.getRange(`H9:I${mEnd}`).format.fill='#FFF2CC';
manual.getRange('H8:I8').format.fill='#795D16';
manual.getRange(`H9:H${mEnd}`).dataValidation={rule:{type:'decimal',operator:'greaterThanOrEqual',formula1:0}};
const aEnd=layout(all,logHeads,logRows,[9,12,42,13,13,27,27,16,12,17,66,50],
  'Sheaffer MRP - Complete Match Log','217 source entries: 77 MRP changes, 28 already current, 112 original prices retained. Names and prices were not changed for this report.');
all.getRange(`D9:E${aEnd}`).setNumberFormat('#,##0');
// Row height follows text length so long case-specific reasons remain readable.
for(const [s,rr,widths] of [[manual,rows,[9,12,42,13,25,66,50,14,38,17,40,13]],[all,logRows,[9,12,42,13,13,27,27,16,12,17,66,50]]]){
  rr.forEach((row,i)=>{
    const lineCount=Math.max(...row.map((value,c)=>String(value??'').split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/(widths[c]*0.84))),0)));
    s.getRange(`A${i+9}:L${i+9}`).format.rowHeight=Math.max(45,Math.ceil(lineCount*13.5+12));
  });
}
w.recalculate();
for(const [s,rng,file] of [[manual,'A1:G12','manual-preview.png'],[manual,'H8:L12','manual-inputs.png'],[all,'A1:L12','all-preview.png']]){
 const pic=await w.render({sheetName:s.name,range:rng,scale:1.3,format:'png'});
 await fs.writeFile(`${root}/${file}`,new Uint8Array(await pic.arrayBuffer()));
}
console.log((await w.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!',options:{useRegex:true,maxResults:10},maxChars:500})).ndjson);
await (await SpreadsheetFile.exportXlsx(w)).save(`${root}/SHEAFFER MRP - Accountant Match and Review.xlsx`);
console.log(JSON.stringify({output:`${root}/SHEAFFER MRP - Accountant Match and Review.xlsx`,manualRows:rows.length,allRows:logRows.length}));
