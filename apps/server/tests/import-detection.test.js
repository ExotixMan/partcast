import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters'});
const {adminDb}=await import('../src/supabase.js');
const {detectSpreadsheetType,importSpreadsheetAuto}=await import('../src/services/importers.js');
const bytes=async rows=>{
 const book=new ExcelJS.Workbook();book.addWorksheet('Report').addRows(rows);
 return Buffer.from(await book.xlsx.writeBuffer());
};

test('financial-report notes cannot become inventory headers or reach database writes',async()=>{
 const original=adminDb.from;let calls=0;
 adminDb.from=()=>{calls++;throw new Error('No report writes allowed');};
 try {
  for(const rows of [
   [['Source'],['Part number and description are lookup references; quantity 1 is a planning assumption.'],['Year','Recorded Sales','Estimated Additions'],[2026,1000,100]],
   [['Description','Quantity is assumed for scenario planning, not stock'],['Fuel filter',1]],
   [['Description','Estimated Quantity'],['Fuel filter',1]],
   [['Part Number','Description','Suggested Quantity'],['TEST-001','Fuel filter',1]]
  ])await assert.rejects(importSpreadsheetAuto(await bytes(rows),'report.xlsx','fixture-owner'),error=>error.status===422&&/Could not recognize/.test(error.message));
  assert.equal(calls,0);
 }finally{adminDb.from=original;}
});

test('real inventory headers still work after introductory notes and with unit or required suffixes',async()=>{
 const data=await bytes([
  ['Use actual quantities. Part number and description below identify the stock.'],
  [],['Part Number (required)','Part Description','Quantity (pcs)'],['TEST-001','Fixture part',5]
 ]);
 assert.equal(await detectSpreadsheetType(data,'stock.xlsx'),'inventory');
});

test('choosing inventory for historical demand cannot overwrite stock with sold quantities',async()=>{
 const original=adminDb.from;let mutations=0;
 adminDb.from=()=>({select(){return this;},eq(){return this;},limit:async()=>({data:[],error:null}),
  insert(){mutations++;throw new Error('No stock writes allowed');}});
 try {
  const data=await bytes([['Date','Part Number','Demand Quantity','Tier'],['2026-01-05','TEST-001',2,'actual_quantity']]);
  assert.equal(await detectSpreadsheetType(data,'history.xlsx'),'demand-training');
  await assert.rejects(importSpreadsheetAuto(data,'history.xlsx','fixture-owner','inventory'),error=>error.status===422&&/No inventory-style table/.test(error.message));
  assert.equal(mutations,0);
 }finally{adminDb.from=original;}
});

test('recorded quantity reports import only dated part evidence and leave planning and amounts out',async()=>{
 const book=new ExcelJS.Workbook();
 book.addWorksheet('Monthly Sales').addRows([['Year-Month','Recorded Sales','Planning Scenario'],['2026-10',120000,150000]]);
 const evidence=book.addWorksheet('Actual Qty Evidence');
 evidence.addRows([['RECORDED PART DEMAND'],['Date','Part Number','Recorded Qty','Evidence Type','Source'],
  ['2026-09-01','00123',2,'actual_quantity','Owner sales log'],['2026-10-12','00123',3,'actual_quantity','Owner sales log']]);
 const planning=book.addWorksheet('Recent Part Planning');
 planning.addRow(['Date','Part Number','Suggested Qty']);
 for(let i=0;i<100;i++)planning.addRow(['2026-10-12','00123',1]);
 const estimated=book.addWorksheet('Estimates');
 estimated.addRows([['Date','Part Number','Estimated Quantity'],['2026-10-12','00123',999]]);
 const original=adminDb.from,products=[{id:'fixture-part',part_number:'00123',description:'Fuel filter'}],writes=[];
 adminDb.from=table=>{
  assert(['products','import_batches','demand_observations'].includes(table));
  return {select(){return this;},eq(){return this;},range(){return this;},
   insert(payload){assert.notEqual(table,'products');writes.push({table,action:'insert',payload});return this;},
   update(payload){assert.equal(table,'import_batches');writes.push({table,action:'update',payload});return this;},
   delete(){assert.equal(table,'demand_observations');writes.push({table,action:'delete'});return this;},
   single:async()=>({data:{id:'fixture-batch'},error:null}),
   then(resolve,reject){return Promise.resolve({data:table==='products'?products:[],error:null}).then(resolve,reject);}};
 };
 try {
  for(const heading of ['Recorded Qty','Recorded Quantity','Actual Qty','Actual Quantity']){
   evidence.getCell('C2').value=heading;
   const data=Buffer.from(await book.xlsx.writeBuffer());
   assert.equal(await detectSpreadsheetType(data,'owner-report.xlsx'),'demand-training');
  }
  const result=await importSpreadsheetAuto(Buffer.from(await book.xlsx.writeBuffer()),'owner-report.xlsx','fixture-owner');
  assert.equal(result.selectedSheet,'Actual Qty Evidence');
  assert.equal(result.rowsRead,2);assert.equal(result.rowsImported,2);assert.equal(result.rowsSkipped,0);
  const imported=writes.find(write=>write.table==='demand_observations'&&write.action==='insert').payload;
  assert.deepEqual(imported.map(row=>[row.product_id,row.occurred_on,row.quantity]),[['fixture-part','2026-09-01',2],['fixture-part','2026-10-12',3]]);
  assert(result.warnings.some(message=>/other 3 worksheet/.test(message)));
  assert(writes.every(write=>['import_batches','demand_observations'].includes(write.table)));
 }finally{adminDb.from=original;}
});

test('recorded quantity aliases retain simulation checks on evidence labels before any database calls',async()=>{
 const original=adminDb.from;let calls=0;
 adminDb.from=()=>{calls++;throw new Error('No simulated report writes');};
 try {
  for(const heading of ['Recorded Qty','Recorded Quantity','Actual Qty','Actual Quantity']){
   const data=await bytes([['Date','Part Number',heading,'Evidence Type'],['2026-10-12','00123',2,'actual_quantity'],['2026-10-13','00123',3,'synthetic_simulated']]);
   for(const type of ['auto','demand-training','inventory','legacy-sales'])
    await assert.rejects(importSpreadsheetAuto(data,'owner-report.xlsx','fixture-owner',type),error=>error.code==='SIMULATED_DEMAND');
  }
  assert.equal(calls,0);
 }finally{adminDb.from=original;}
});
