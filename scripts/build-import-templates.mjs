import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';

const require=createRequire(new URL('../apps/server/package.json',import.meta.url));
const ExcelJS=require('exceljs'),JSZip=require('jszip');
const output=new URL('../apps/web/public/examples/import-templates/',import.meta.url);
const date=new Date('2026-11-07T00:00:00Z');
const templates=[
 {name:'PartCast_Past_Invoices_Template',sheet:'Past_Invoices',type:'Past sales and customer records',
  columns:['Reference','Date','Customer Name','Amount','Items'],widths:[25,18,35,20,75],text:[1,3,5],dates:[2],numbers:[4],
  notes:[
   ['One row','Enter one genuine invoice per row. Keep the original reference, date, customer, amount and item descriptions.'],
   ['Amount','Total invoice amount in pesos, without a currency symbol. This is not the number of units sold.'],
   ['Dates','Use actual dates displayed as YYYY-MM-DD. Check missing or unusual years against original records. Do not guess dates.'],
   ['Missing amounts','Verify the receipt; do not replace an unknown amount with zero. The current invoice importer can default missing amounts to zero.'],
   ['Result','Saves historical invoices under Sales > Imported invoices. Does not change stock or supply forecasting quantities.'],
   ['Duplicates','Previously saved matching invoice references are skipped; conflicting saved details are reported for review.'],
   ['Safety','The atomic forecasting-history upgrade does not make invoice imports transactional.']
  ]},
 {name:'PartCast_Forecasting_Quantities_Template',sheet:'Sales_Quantities',type:'Sales quantities for forecasting',
  columns:['Date','Part Number','Demand Quantity','Source'],widths:[18,28,24,70],text:[2,4],dates:[1],numbers:[3],
  notes:[
   ['Required columns','Date, Part Number and Demand Quantity. Source is an optional evidence note.'],
   ['Date','Actual sale date displayed as YYYY-MM-DD. Do not move old dates to the present.'],
   ['Part Number','Use the exact code for an active part in Inventory. Preserve leading zeroes, hyphens and letters.'],
   ['Demand Quantity','Actual units sold for this part on this date, with at most two decimal places. Do not enter pesos, stock counts, deliveries or proposed orders.'],
   ['Source','Optional receipt or sales-log note. The importer generates its own database batch reference; it does not save this note verbatim as source_reference.'],
   ['Complete replacement','Use ONE complete history file. This replaces previous imported_training_data for all parts. Include the history you need to keep.'],
   ['Existing recorded sales','Do not repeat actual_sale transactions already recorded through Sell or receive.'],
   ['Same-day entries','Different real transactions for the same part/date are combined. Do not repeat the same transaction.'],
   ['Zero days','Only enter a zero if confirmed by real records. The updated importer reports zero rows without storing them as positive sold quantities.'],
   ['Safety','Atomic replacement requires migration 0015 and the production-v2 API and website. A template alone does not install the upgrade.'],
   ['Accuracy','Correct formatting does not prove authenticity, adequate history or forecasting accuracy.']
  ]},
 {name:'PartCast_Inventory_Template',sheet:'Current_Inventory',type:'Inventory and purchases',
  columns:['Part Number','Description','Quantity','Unit Cost','Selling Price','Brand','Unit','Location'],widths:[28,55,18,20,20,25,18,25],text:[1,2,6,7,8],dates:[],numbers:[3,4,5],
  notes:[
   ['Purpose','Current inventory snapshot. Use current physically verified stock counts, not units sold or historical delivery quantities.'],
   ['Part Number and Description','Enter the exact existing part code and its actual description. Preserve leading zeroes and identifiers.'],
   ['Quantity','Current whole-number on-hand stock count, including a confirmed zero where appropriate. Do not leave a supplied part quantity blank.'],
   ['Unit Cost and Selling Price','Fill both with the actual current per-unit values. Do not leave them blank: the current inventory importer can write zero for missing numeric values.'],
   ['Brand, Unit, Location','Enter known inventory details, such as the actual brand, unit and shelf location.'],
   ['Stock replacement','Importing replaces matched saved stock balances with the supplied quantities. It is not an additional delivery. Back up and review counts first.'],
   ['Forecasting','Receiving or counting stock is not evidence of sold units. Import forecasting quantities separately.'],
   ['Safety','This template does not make the inventory import atomic. Test a reviewed snapshot on a separate environment before replacing live counts.']
  ]}
];
const files=[];
await mkdir(output,{recursive:true});
for(const template of templates){
 const workbook=new ExcelJS.Workbook();
 workbook.creator='PartCast';workbook.created=date;workbook.modified=date;
 const sheet=workbook.addWorksheet(template.sheet,{views:[{state:'frozen',ySplit:1}]});
 sheet.addRow(template.columns);
 sheet.columns=template.columns.map((header,index)=>({header,width:template.widths[index]}));
 sheet.getRow(1).height=30;
 sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17324D'}};cell.alignment={vertical:'middle',wrapText:true};});
 sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:template.columns.length}};
 for(let row=2;row<=101;row++){
  for(const col of template.text)sheet.getCell(row,col).numFmt='@';
  for(const col of template.dates){const cell=sheet.getCell(row,col);cell.numFmt='yyyy-mm-dd';cell.dataValidation={type:'date',operator:'between',formulae:[new Date('1900-01-01T00:00:00Z'),'TODAY()'],allowBlank:true,showErrorMessage:true,error:'Use the genuine sale date; do not enter future dates.'};}
  for(const col of template.numbers){const cell=sheet.getCell(row,col);cell.numFmt='0.00';cell.dataValidation={type:template.sheet==='Current_Inventory'&&col===3?'whole':'decimal',operator:'greaterThanOrEqual',formulae:[0],allowBlank:true,showErrorMessage:true,error:'Enter a genuine nonnegative numeric value; use at most two decimal places.'};}
 }
 const notes=workbook.addWorksheet('Read_First');notes.columns=[{header:'Topic',width:28},{header:'Instruction',width:112}];
 notes.addRows([
  ['Blank template','Fill the first worksheet using genuine records before uploading. No example transactions, customer data or inventory records are included.'],
  ['Import selection',template.type],
  ['File choice','Use the Excel OR CSV version, not both copies. Keep the header row; data starts on row 2.'],
  ...template.notes
 ]);
 notes.eachRow((row,index)=>{row.alignment={wrapText:true,vertical:'top'};if(index>1)row.height=42;});
 const archive=await JSZip.loadAsync(await workbook.xlsx.writeBuffer());
 for(const entry of Object.values(archive.files))entry.date=date;
 const xlsx=await archive.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
 const csv=Buffer.from('\uFEFF'+template.columns.join(',')+'\n');
 for(const [extension,buffer] of [['xlsx',xlsx],['csv',csv]]){
  const name=template.name+'.'+extension;await writeFile(new URL(name,output),buffer);files.push({name,buffer});
 }
}
const readme=Buffer.from(`# PartCast blank import templates\n\nAll templates contain headers and instructions, without business records. Fill them with genuine data before upload.\n\n| File | Import selection |\n| --- | --- |\n${templates.map(t=>`| ${t.name}.xlsx | ${t.type} |`).join('\n')}\n\nUse Excel or CSV, not both versions of the same data. Dates use YYYY-MM-DD. Amount is pesos; Demand Quantity is units sold; inventory Quantity is current on-hand stock. Save edited CSV as CSV UTF-8 (Comma delimited).\n\nForecasting imports replace prior imported history. Inventory imports replace supplied stock balances and can set missing cost/price fields to zero; fill their actual values. Invoice imports save reporting records without supplying forecast quantities. The atomic history upgrade does not cover inventory or invoice imports.\n\nThese files are public templates. No customer names, sales rows, product catalog or database credentials are included.\n`);
await writeFile(new URL('README.md',output),readme);files.push({name:'README.md',buffer:readme});
const bundle=new JSZip();
for(const file of files)bundle.file(file.name,file.buffer,{date});
await writeFile(new URL('PartCast_All_Import_Templates.zip',output),await bundle.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
console.log('Built three blank Excel templates, matching CSV files, and one download ZIP.');
