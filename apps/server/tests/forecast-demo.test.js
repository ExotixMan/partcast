import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {containsSimulatedDemand,demoWorkbookPayload,createDemoJobs} from '../src/services/forecastDemo.js';

Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters'});
const {adminDb} = await import('../src/supabase.js');
const {importDemandTrainingWorkbook,importSpreadsheetAuto} = await import('../src/services/importers.js');

function workbook(tier='synthetic_simulated') {
  const book = new ExcelJS.Workbook();
  for (const name of ['IMPORT_Train_5Col','Validation_5Col','Test_5Col']) {
    const s=book.addWorksheet(name);s.addRow(['Date','Part Number','Demand Quantity','Tier','Coverage']);
    s.addRow(['2025-01-01','00123',0,tier,'STABLE_DEMO_SCENARIO']);
    s.addRow(['2025-01-02','00123',2,tier,'STABLE_DEMO_SCENARIO']);
  }
  return book;
}

test('demo extraction preserves zero days and exact part numbers; actual rows cannot enter demo splits',async()=>{
  const book=workbook(), bytes=Buffer.from(await book.xlsx.writeBuffer());
  const payload=await demoWorkbookPayload(bytes,'demo.xlsx');
  assert.equal(payload.dataset_type,'SIMULATED_DEMO');
  assert.equal(payload.splits.train[0].quantity,0);
  assert.equal(payload.splits.train[0].part_number,'00123');
  assert.match(payload.source_sha256,/^[a-f0-9]{64}$/);
  await assert.rejects(demoWorkbookPayload(Buffer.from(await workbook('actual_quantity').xlsx.writeBuffer()),'renamed.xlsx'),/Keep actual sales separate/);
  book.removeWorksheet(book.getWorksheet('Test_5Col').id);
  await assert.rejects(demoWorkbookPayload(Buffer.from(await book.xlsx.writeBuffer()),'demo.xlsx'),/needs IMPORT_Train_5Col/);
});

test('a simulated training upload cannot touch store history or create an import batch',async()=>{
  const original=adminDb.from;let databaseCalls=0;
  adminDb.from=()=>{databaseCalls++;throw new Error('No store writes allowed.');};
  try {
    await assert.rejects(importDemandTrainingWorkbook(Buffer.from(await workbook().xlsx.writeBuffer()),'actual_sales.xlsx','test-user'),/simulated demand/);
    assert.equal(databaseCalls,0);
  } finally {adminDb.from=original;}
});

test('simulation detection scans beyond the scoring sample and accepts unmarked actual training',()=>{
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Daily_B_Usable');
  sheet.addRow(['Date','Part Number','Demand Quantity','Tier','Coverage']);
  for(let i=0;i<1100;i++)sheet.addRow(['2025-01-01','00123',1,'actual_quantity','partial_invoice_linkage']);
  assert.equal(containsSimulatedDemand(book),false);
  sheet.getCell('D1101').value={formula:'"synthetic_simulated"',result:'synthetic_simulated'};
  assert.equal(containsSimulatedDemand(book),true);
  sheet.getRow(1).values=['Transaction Date','SKU','Units Sold','Training Tier','Coverage'];
  assert.equal(containsSimulatedDemand(book),true);
  const actual=new ExcelJS.Workbook();actual.addWorksheet('Synthetic Oil').addRows([['Date','Part Number','Demand Quantity','Tier'],['2026-01-01','OIL-001',2,'actual_quantity']]);
  assert.equal(containsSimulatedDemand(actual),false);
});

test('owner-informed modeled labels remain separate from actual quantities after workbook relabeling',async()=>{
 const book=workbook('owner_informed_model');
 for(const sheet of book.worksheets)for(const row of [2,3])sheet.getCell(`E${row}`).value='MODELED_DAILY_HISTORY';
 assert.equal(containsSimulatedDemand(book),true);
 const bytes=Buffer.from(await book.xlsx.writeBuffer());
 const payload=await demoWorkbookPayload(bytes,'owner-labels.xlsx');
 assert.equal(payload.dataset_type,'SIMULATED_DEMO');
 assert.equal(payload.splits.train[0].tier,'simulated_demo');
 assert.equal(payload.splits.train[0].source_tier,'owner_informed_model');
 assert.equal(payload.splits.train[0].quantity,0);
 const original=adminDb.from;let calls=0;adminDb.from=()=>{calls++;throw new Error('No data writes');};
 try{await assert.rejects(importDemandTrainingWorkbook(bytes,'owner-labels.xlsx','test-user'),e=>e.code==='SIMULATED_DEMAND');assert.equal(calls,0);}
 finally{adminDb.from=original;}
});

test('automatic actual-data imports parse the workbook once; declared simulations never reach database calls',async()=>{
  const book=new ExcelJS.Workbook();book.addWorksheet('Daily_B_Usable').addRows([['Date','Part Number','Demand Quantity','Tier'],['2026-01-01','00123',2,'actual_quantity']]);
  const bytes=Buffer.from(await book.xlsx.writeBuffer()),prototype=Object.getPrototypeOf(book.xlsx),originalLoad=prototype.load,originalFrom=adminDb.from;
  let loads=0,dbCalls=0;
  prototype.load=async function(...args){loads++;return originalLoad.apply(this,args);};
  adminDb.from=()=>{dbCalls++;throw new Error('Stop at the first database call.');};
  try {
    await assert.rejects(importSpreadsheetAuto(bytes,'actual.xlsx','owner'),/Stop at the first database call/);
    assert.equal(loads,1);assert.equal(dbCalls,1);
    const simulated=workbook();simulated.getWorksheet('IMPORT_Train_5Col').name='CAPSTONE_SYNTHETIC_ALL';
    const simBytes=Buffer.from(await simulated.xlsx.writeBuffer());
    loads=0;dbCalls=0;
    for(const type of ['auto','demand-training','inventory','legacy-sales'])await assert.rejects(importSpreadsheetAuto(simBytes,'renamed_actual.xlsx','owner',type),e=>e.code==='SIMULATED_DEMAND');
    assert.equal(loads,0);assert.equal(dbCalls,0);
  } finally {prototype.load=originalLoad;adminDb.from=originalFrom;}
});

test('HTTP demo requires verified manager access and simulated imports fail before any store mutation',async()=>{
  const {default:express}=await import('express');
  const {authenticate}=await import('../src/middleware/auth.js');
  const {default:router}=await import('../src/routes/api.js');
  const {errorHandler}=await import('../src/middleware/error.js');
  const sid='77777777-7777-4777-8777-777777777777',id='11111111-1111-4111-8111-111111111111';
  const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({session_id:sid,amr:[{method:'password'}]})).toString('base64url')+'.test-signature';
  const originalFrom=adminDb.from,originalUser=adminDb.auth.getUser;
  let role='owner',verified=true;const tables=[];
  adminDb.auth.getUser=async()=>({data:{user:{id,email:'staff@example.test'}}});
  adminDb.from=table=>{
    tables.push(table);assert(['profiles','login_verifications'].includes(table));
    return {select(){return this;},eq(){return this;},single:async()=>({data:{id,role,active:true}}),maybeSingle:async()=>({data:verified?{expires_at:'2099-01-01T00:00:00Z'}:null})};
  };
  const app=express();app.use(express.json());app.use('/api',authenticate,router);app.use(errorHandler);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port,headers={Authorization:'Bearer '+token};
  try {
    assert.equal((await fetch(base+'/api/forecast/demo/jobs',{method:'POST'})).status,401);
    assert.equal((await fetch(base+'/api/forecast/demo/jobs',{method:'POST',headers})).status,400);
    role='cashier';assert.equal((await fetch(base+'/api/forecast/demo/jobs',{method:'POST',headers})).status,403);
    role='owner';verified=false;assert.equal((await fetch(base+'/api/forecast/demo/jobs',{method:'POST',headers})).status,428);
    verified=true;const form=new FormData();form.append('file',new Blob([await workbook().xlsx.writeBuffer()]),'renamed-actual.xlsx');
    const response=await fetch(base+'/api/imports/demand-training',{method:'POST',headers,body:form});
    assert.equal(response.status,422);const rejected=await response.json();assert.match(rejected.error,/simulated demand/);assert.equal(rejected.code,'SIMULATED_DEMAND');
    assert(tables.every(table=>['profiles','login_verifications'].includes(table)));
  } finally {adminDb.from=originalFrom;adminDb.auth.getUser=originalUser;await new Promise(resolve=>server.close(resolve));}
});

test('background demos return immediately, isolate accounts, reject overlap, expire and recover after failure',async()=>{
  let finish,clock=0;
  const jobs=createDemoJobs({runner:()=>new Promise(resolve=>{finish=resolve;}),now:()=>clock,ttlMs:100});
  const task=jobs.start(Buffer.from('demo'),'demo.xlsx','owner-A');
  assert.equal(task.status,'running');
  assert.throws(()=>jobs.start(Buffer.from('other'),'demo.xlsx','owner-A'),e=>e.status===409);
  assert.throws(()=>jobs.get(task.id,'owner-B'),e=>e.status===404);
  await new Promise(resolve=>setImmediate(resolve));finish({dataset_type:'SIMULATED_DEMO'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(jobs.get(task.id,'owner-A').status,'completed');
  clock=101;assert.throws(()=>jobs.get(task.id,'owner-A'),e=>e.status===404);
  const failed=createDemoJobs({runner:async()=>{throw Object.assign(new Error('Invalid synthetic tier.'),{safe:true});}});
  const id=failed.start(Buffer.from('bad'),'bad.xlsx','owner-A').id;
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(failed.get(id,'owner-A').status,'failed');
  assert.equal(failed.get(id,'owner-A').error,'Invalid synthetic tier.');
  assert.equal(failed.start(Buffer.from('retry'),'bad.xlsx','owner-A').status,'running');
  await new Promise(resolve=>setImmediate(resolve));
});
