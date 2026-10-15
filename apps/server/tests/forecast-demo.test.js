import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {containsSimulatedDemand,demoWorkbookPayload} from '../src/services/forecastDemo.js';

Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters'});
const {adminDb} = await import('../src/supabase.js');
const {importDemandTrainingWorkbook} = await import('../src/services/importers.js');

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
    assert.equal((await fetch(base+'/api/forecast/demo',{method:'POST'})).status,401);
    assert.equal((await fetch(base+'/api/forecast/demo',{method:'POST',headers})).status,400);
    role='cashier';assert.equal((await fetch(base+'/api/forecast/demo',{method:'POST',headers})).status,403);
    role='owner';verified=false;assert.equal((await fetch(base+'/api/forecast/demo',{method:'POST',headers})).status,428);
    verified=true;const form=new FormData();form.append('file',new Blob([await workbook().xlsx.writeBuffer()]),'renamed-actual.xlsx');
    const response=await fetch(base+'/api/imports/demand-training',{method:'POST',headers,body:form});
    assert.equal(response.status,422);assert.match((await response.json()).error,/simulated demand/);
    assert(tables.every(table=>['profiles','login_verifications'].includes(table)));
  } finally {adminDb.from=originalFrom;adminDb.auth.getUser=originalUser;await new Promise(resolve=>server.close(resolve));}
});
