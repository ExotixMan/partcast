import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {parseLiteralFilters} from './fixtures/postgrest.js';
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters'});
const {adminDb}=await import('../src/supabase.js');
const {authenticate}=await import('../src/middleware/auth.js');
const {default:router}=await import('../src/routes/api.js');
const {default:express}=await import('express');
const {errorHandler}=await import('../src/middleware/error.js');

test('imported invoice browser returns persisted invoices, validates filters and enforces verified manager access',async()=>{
  const original={from:adminDb.from,getUser:adminDb.auth.getUser};
  const user='11111111-1111-4111-8111-111111111111',part='33333333-3333-4333-8333-333333333333';
  const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({session_id:'77777777-7777-4777-8777-777777777777',amr:[{method:'password'}]})).toString('base64url')+'.fixture';
  let role='owner',verified=true,invoiceReads=0;
  const queries=[],writes=[],batches=[],records=[{id:'invoice-1',reference_no:'SI#1',sale_date:'2026-01-05',amount:100,raw_items:'BP-001 Brake pad',customer_name:'Private fixture customer'}];
  adminDb.auth.getUser=async()=>({data:{user:{id:user,email:'fixture@example.test'}}});
  adminDb.from=table=>{
    assert(['profiles','login_verifications','products','legacy_sales','import_batches','audit_logs'].includes(table));
    let action='read',payload,selected='*',filters=[],orders=[],logic='';
    function result(start=0,end=Infinity){
      if(action!=='read'){
        writes.push(table);
        if(table==='import_batches'&&action==='insert'){const batch={...payload,id:`batch-${batches.length+1}`,status:'processing'};batches.push(batch);return {data:batch,error:null};}
        if(table==='import_batches'&&action==='update'){for(const row of batches.filter(r=>filters.every(([key,value])=>r[key]===value)))Object.assign(row,payload);}
        else if(table==='legacy_sales'&&action==='insert'){records.push(...payload.map((row,index)=>({...row,id:`new-${records.length+index}`})));}
        return {data:null,error:null};
      }
      let rows=table==='products'?[{id:part,part_number:'BP-001'}]:table==='import_batches'?batches:records;
      rows=rows.filter(row=>filters.every(([key,value,op])=>op==='gte'?row[key]&&row[key]>=value:op==='lte'?row[key]&&row[key]<=value:row[key]===value));
      if(table==='legacy_sales'){
        invoiceReads++;queries.push({selected,filters,logic,orders,start,end});
        if(logic){const filters=parseLiteralFilters(logic);rows=rows.filter(row=>filters.some(({column,pattern})=>new RegExp(pattern,'iu').test(String(row[column]||''))));}
        rows=[...rows].sort((a,b)=>{for(const [key,options] of orders){if(a[key]===b[key])continue;if(a[key]==null)return 1;if(b[key]==null)return -1;const comparison=String(a[key]).localeCompare(String(b[key]));return options?.ascending===false?-comparison:comparison;}return 0;});
      }
      const count=rows.length;
      rows=rows.slice(start,end+1);
      if(selected!=='*')rows=rows.map(row=>Object.fromEntries(selected.split(',').map(key=>[key,row[key]])));
      return {data:rows,count,error:null};
    }
    return {select(value){selected=value;return this;},eq(key,value){filters.push([key,value]);return this;},not(){return this;},limit(){return this;},
      gte(key,value){filters.push([key,value,'gte']);return this;},lte(key,value){filters.push([key,value,'lte']);return this;},
      or(value){logic=value;return this;},order(key,options){orders.push([key,options]);return this;},
      insert(value){action='insert';payload=value;return this;},update(value){action='update';payload=value;return this;},
      single:async()=>table==='profiles'?{data:{id:user,active:true,role},error:null}:result(),
      maybeSingle:async()=>({data:verified?{expires_at:'2099-01-01T00:00:00Z'}:null,error:null}),
      range:async(start,end)=>result(start,end),then(resolve,reject){try{return Promise.resolve(result()).then(resolve,reject);}catch(error){return Promise.reject(error).then(resolve,reject);}}};
  };
  const app=express();app.use('/api',authenticate,router);app.use(errorHandler);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}/api/imports`,headers={Authorization:'Bearer '+token};
  const get=async(query='')=>fetch(base+'/sales'+query,{headers});
  try{
    assert.equal((await fetch(base+'/sales')).status,401);
    for(const denied of ['cashier','inventory_staff']){role=denied;assert.equal((await get()).status,403);}
    role='owner';verified=false;assert.equal((await get()).status,428);verified=true;
    for(const query of ['?page=0','?pageSize=51','?q='+encodeURIComponent('x'.repeat(121)),'?q='+encodeURIComponent('x\u0000y'),'?from=bad-date','?from=2026-02-30'])assert.equal((await get(query)).status,400);
    assert.equal((await get('?from=2026-02-01&to=2026-01-01')).status,422);
    assert.equal(invoiceReads,0);
    const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Past sales');sheet.addRow(['Reference','Date','Customer','Amount','Items']);
    sheet.addRow(['SI#1','2026-01-05','',100,'BP-001 Brake pad']);
    sheet.addRow(['SI#2','2026-02-12','',250,'Oil filter']);sheet.addRow(['SI#3',null,'',0,'Unknown date']);
    const form=new FormData();form.append('kind','legacy-sales');form.append('useProxy','false');form.append('file',new Blob([await book.xlsx.writeBuffer()]),'invoices.xlsx');
    const imported=await fetch(base+'/spreadsheet',{method:'POST',headers,body:form});assert.equal(imported.status,200);
    const receipt=await imported.json();assert.equal(receipt.rowsImported,2);assert.equal(receipt.rowsSkipped,1);assert.equal(records.length,3);
    assert(receipt.warnings.some(value=>/already exist/.test(value)));assert(!writes.includes('demand_observations'));assert(!writes.includes('inventory_transactions'));
    const afterWrites=writes.length;
    const all=await (await get()).json();assert.equal(all.count,3);assert.deepEqual(all.data.map(row=>row.reference_no),['SI#2','SI#1','SI#3']);
    assert(all.data.every(row=>!('customer_name' in row)&&!('import_batch_id' in row)));
    const dated=await (await get('?from=2026-01-05&to=2026-01-05')).json();assert.equal(dated.count,1);assert.equal(dated.data[0].reference_no,'SI#1');
    assert.equal((await (await get('?q=oil')).json()).count,1);
    const paged=await (await get('?page=2&pageSize=1')).json();assert.equal(paged.count,3);assert.equal(paged.data[0].reference_no,'SI#1');
    assert.equal((await (await get('?q=missing')).json()).count,0);
    await get('?q='+encodeURIComponent('SI#1,raw_items.neq.x'));
    const filters=parseLiteralFilters(queries.at(-1).logic);assert.deepEqual(filters.map(filter=>filter.column),['reference_no','raw_items']);
    for(const {pattern} of filters){const expression=new RegExp(pattern,'iu');assert(expression.test('SI#1,raw_items.neq.x'));assert(!expression.test('SI#1'));}
    for(const manager of ['admin','super_admin']){role=manager;assert.equal((await get()).status,200);}
    assert.equal(writes.length,afterWrites);
  }finally{adminDb.from=original.from;adminDb.auth.getUser=original.getUser;await new Promise(resolve=>server.close(resolve));}
});
