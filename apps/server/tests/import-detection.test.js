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
